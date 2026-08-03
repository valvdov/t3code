/**
 * AgyAdapter — ProviderAdapter implementation for the Antigravity (`agy`) CLI.
 *
 * The Antigravity CLI has no persistent server or ACP mode; each turn is one
 * headless invocation:
 *
 *   agy -p "<prompt>" --output-format stream-json [--conversation <id>]
 *
 * Conversation continuity comes from Antigravity's own conversation store:
 * the first turn's `init` event yields a `conversation_id`, and every later
 * turn resumes it via `--conversation`. That id is also exposed as the
 * session's `resumeCursor` so threads survive T3 server restarts.
 *
 * Turn lifecycle: `sendTurn` spawns the process in a per-turn scope and
 * blocks until it exits (mirroring the Grok adapter, whose prompt RPC also
 * resolves at end of turn). `interruptTurn` closes the turn scope, which
 * kills the child process.
 *
 * Headless mode cannot surface interactive approvals — tools either run
 * (with `--dangerously-skip-permissions`, the default) or are soft-denied
 * by the CLI, so `respondToRequest` / `respondToUserInput` always fail.
 *
 * @module provider/Layers/AgyAdapter
 */
import {
  EventId,
  type ProviderRuntimeEvent,
  type ProviderSession,
  ProviderDriverKind,
  type ProviderInstanceId,
  RuntimeItemId,
  type ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import { ServerConfig } from "../../config.ts";
import {
  type ProviderAdapterError,
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import type { AgySettings } from "../Drivers/AgySettings.ts";
import { agyBinary } from "./AgyProvider.ts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

const PROVIDER = ProviderDriverKind.make("agy");
const AGY_RESUME_VERSION = 1 as const;
const AGY_PRINT_TIMEOUT = "60m";

/**
 * Context-window sizes by model slug prefix, longest-prefix first. The CLI
 * does not expose per-model limits, so these mirror the published windows of
 * the model families Antigravity serves. Unknown models fall back to "no
 * limit known" — the UI then shows absolute token counts without a
 * percentage meter.
 */
const CONTEXT_WINDOW_BY_MODEL_PREFIX: ReadonlyArray<readonly [string, number]> = [
  ["gemini-", 1_048_576],
  ["claude-", 200_000],
  ["gpt-oss-", 131_072],
];

function contextWindowForModel(model: string | undefined): number | undefined {
  if (!model) {
    return undefined;
  }
  for (const [prefix, contextWindow] of CONTEXT_WINDOW_BY_MODEL_PREFIX) {
    if (model.startsWith(prefix)) {
      return contextWindow;
    }
  }
  return undefined;
}

export interface AgyAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {}

export interface AgyAdapterLiveOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly instanceId: ProviderInstanceId;
}

/** Persisted resume payload — lets a thread reattach to its Antigravity
 * conversation after a T3 server restart. */
const AgyResumeCursor = Schema.Struct({
  version: Schema.Literal(AGY_RESUME_VERSION),
  conversationId: Schema.String,
});
type AgyResumeCursor = typeof AgyResumeCursor.Type;
const decodeResumeCursor = Schema.decodeUnknownExit(AgyResumeCursor);

interface AgyActiveTurn {
  readonly turnId: TurnId;
  readonly scope: Scope.Closeable;
}

interface AgySessionContext {
  readonly threadId: ThreadId;
  session: ProviderSession;
  conversationId: string | undefined;
  activeTurn: AgyActiveTurn | undefined;
  /** Turns already interrupted; the blocked sendTurn must not emit a second
   * terminal event for them. */
  readonly interruptedTurnIds: Set<TurnId>;
  turns: Array<{ id: TurnId; items: Array<unknown> }>;
  /** Cumulative tokens processed across all turns of this session. */
  totalProcessedTokens: number;
  stopped: boolean;
}

// ── stream-json event parsing ────────────────────────────────────────────
// Schemas are deliberately loose: unknown fields and unknown step types must
// never fail a turn — the CLI's output surface is not a stable contract.

const AgyInitEvent = Schema.Struct({
  event: Schema.Literal("init"),
  conversation_id: Schema.String,
});
const AgyStepUpdateEvent = Schema.Struct({
  event: Schema.Literal("step_update"),
  step_update: Schema.Struct({
    step_index: Schema.optional(Schema.Number),
    state: Schema.optional(Schema.String),
    step_type: Schema.optional(Schema.String),
    text_delta: Schema.optional(Schema.String),
  }),
});
const AgyUsage = Schema.Struct({
  input_tokens: Schema.optional(Schema.Number),
  output_tokens: Schema.optional(Schema.Number),
  thinking_tokens: Schema.optional(Schema.Number),
  cache_read_tokens: Schema.optional(Schema.Number),
  total_tokens: Schema.optional(Schema.Number),
});
const AgyResultEvent = Schema.Struct({
  event: Schema.Literal("result"),
  result: Schema.Struct({
    conversation_id: Schema.optional(Schema.String),
    status: Schema.optional(Schema.String),
    response: Schema.optional(Schema.String),
    error: Schema.optional(Schema.String),
    usage: Schema.optional(AgyUsage),
  }),
});

const decodeInit = Schema.decodeUnknownExit(AgyInitEvent);
const decodeStepUpdate = Schema.decodeUnknownExit(AgyStepUpdateEvent);
const decodeResult = Schema.decodeUnknownExit(AgyResultEvent);
const decodeJsonUnknown = Schema.decodeExit(Schema.UnknownFromJsonString);

type AgyStreamEvent =
  | { readonly _tag: "init"; readonly conversationId: string }
  | { readonly _tag: "delta"; readonly text: string }
  | {
      readonly _tag: "result";
      readonly status: string | undefined;
      readonly response: string | undefined;
      readonly error: string | undefined;
      readonly usage: typeof AgyUsage.Type | undefined;
    };

function parseAgyStreamLine(line: string): AgyStreamEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }
  const json = decodeJsonUnknown(trimmed);
  if (!Exit.isSuccess(json)) {
    return undefined;
  }
  const value = json.value;
  const init = decodeInit(value);
  if (Exit.isSuccess(init)) {
    return { _tag: "init", conversationId: init.value.conversation_id };
  }
  const step = decodeStepUpdate(value);
  if (Exit.isSuccess(step)) {
    const update = step.value.step_update;
    if (update.step_type === "agent_response" && update.text_delta) {
      return { _tag: "delta", text: update.text_delta };
    }
    return undefined;
  }
  const result = decodeResult(value);
  if (Exit.isSuccess(result)) {
    return {
      _tag: "result",
      status: result.value.result.status,
      response: result.value.result.response,
      error: result.value.result.error,
      usage: result.value.result.usage,
    };
  }
  return undefined;
}

function splitLaunchArgs(launchArgs: string): ReadonlyArray<string> {
  return launchArgs
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter((arg) => arg.length > 0);
}

export const makeAgyAdapter = Effect.fn("makeAgyAdapter")(function* (
  agySettings: AgySettings,
  options: AgyAdapterLiveOptions,
) {
  const crypto = yield* Crypto.Crypto;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const serverConfig = yield* ServerConfig;
  const environment = options.environment ?? process.env;
  const boundInstanceId = options.instanceId;

  const sessions = new Map<ThreadId, AgySessionContext>();
  const threadLocksRef = yield* SynchronizedRef.make(new Map<string, Semaphore.Semaphore>());
  const runtimeEventPubSub = yield* PubSub.unbounded<ProviderRuntimeEvent>();

  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
  const randomUUIDv4 = crypto.randomUUIDv4.pipe(
    Effect.mapError(
      (cause) =>
        new ProviderAdapterRequestError({
          provider: PROVIDER,
          method: "crypto/randomUUIDv4",
          detail: "Failed to generate Antigravity runtime identifier.",
          cause,
        }),
    ),
  );
  const nextEventId = Effect.map(randomUUIDv4, (id) => EventId.make(id));
  const makeEventStamp = () => Effect.all({ eventId: nextEventId, createdAt: nowIso });

  const offerRuntimeEvent = (event: ProviderRuntimeEvent) =>
    PubSub.publish(runtimeEventPubSub, event).pipe(Effect.asVoid);

  const getThreadSemaphore = (threadId: string) =>
    SynchronizedRef.modifyEffect(threadLocksRef, (current) => {
      const existing = Option.fromNullishOr(current.get(threadId));
      return Option.match(existing, {
        onNone: () =>
          Semaphore.make(1).pipe(
            Effect.map((semaphore) => {
              const next = new Map(current);
              next.set(threadId, semaphore);
              return [semaphore, next] as const;
            }),
          ),
        onSome: (semaphore) => Effect.succeed([semaphore, current] as const),
      });
    });

  const withThreadLock = <A, E, R>(threadId: string, effect: Effect.Effect<A, E, R>) =>
    Effect.flatMap(getThreadSemaphore(threadId), (semaphore) => semaphore.withPermit(effect));

  const requireSession = (threadId: ThreadId) =>
    Effect.suspend(() => {
      const ctx = sessions.get(threadId);
      return ctx
        ? Effect.succeed(ctx)
        : Effect.fail(
            new ProviderAdapterSessionNotFoundError({
              provider: PROVIDER,
              threadId,
            }),
          );
    });

  const makeResumeCursor = (conversationId: string): AgyResumeCursor => ({
    version: AGY_RESUME_VERSION,
    conversationId,
  });

  const startSession: AgyAdapterShape["startSession"] = (input) =>
    withThreadLock(
      input.threadId,
      Effect.gen(function* () {
        const existing = sessions.get(input.threadId);
        if (existing) {
          return existing.session;
        }

        const createdAt = yield* nowIso;
        const resumed = decodeResumeCursor(input.resumeCursor);
        const conversationId = Exit.isSuccess(resumed)
          ? resumed.value.conversationId
          : undefined;

        const session: ProviderSession = {
          provider: PROVIDER,
          providerInstanceId: boundInstanceId,
          status: "ready",
          runtimeMode: input.runtimeMode,
          ...(input.cwd ? { cwd: input.cwd } : {}),
          ...(input.modelSelection?.model ? { model: input.modelSelection.model } : {}),
          threadId: input.threadId,
          ...(conversationId ? { resumeCursor: makeResumeCursor(conversationId) } : {}),
          createdAt,
          updatedAt: createdAt,
        };

        const ctx: AgySessionContext = {
          threadId: input.threadId,
          session,
          conversationId,
          activeTurn: undefined,
          interruptedTurnIds: new Set(),
          turns: [],
          totalProcessedTokens: 0,
          stopped: false,
        };
        sessions.set(input.threadId, ctx);

        yield* offerRuntimeEvent({
          type: "session.started",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          providerInstanceId: boundInstanceId,
          threadId: input.threadId,
          payload: conversationId ? { resume: makeResumeCursor(conversationId) } : {},
        });
        yield* offerRuntimeEvent({
          type: "session.state.changed",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          providerInstanceId: boundInstanceId,
          threadId: input.threadId,
          payload: { state: "ready", reason: "Antigravity session ready" },
        });
        yield* offerRuntimeEvent({
          type: "thread.started",
          ...(yield* makeEventStamp()),
          provider: PROVIDER,
          providerInstanceId: boundInstanceId,
          threadId: input.threadId,
          payload: conversationId ? { providerThreadId: conversationId } : {},
        });

        return session;
      }),
    );

  const settleTurn = (
    ctx: AgySessionContext,
    turnId: TurnId,
    outcome:
      | {
          readonly _tag: "completed";
          readonly usage?: typeof AgyUsage.Type | undefined;
          readonly model?: string | undefined;
        }
      | { readonly _tag: "failed"; readonly errorMessage: string }
      | { readonly _tag: "interrupted" },
  ) =>
    Effect.gen(function* () {
      if (ctx.activeTurn?.turnId === turnId) {
        ctx.activeTurn = undefined;
      }
      const updatedAt = yield* nowIso;
      const { activeTurnId: _activeTurnId, ...readySession } = ctx.session;
      ctx.session = { ...readySession, status: "ready", updatedAt };

      switch (outcome._tag) {
        case "completed": {
          const usage = outcome.usage;
          if (usage?.total_tokens !== undefined) {
            // `input_tokens` of a turn already includes the whole
            // conversation history, so the turn's total is the current
            // context fill; the per-session accumulator feeds the "total
            // processed" line in the context-window popover.
            ctx.totalProcessedTokens += usage.total_tokens;
            const maxTokens = contextWindowForModel(outcome.model ?? ctx.session.model);
            const usedTokens =
              maxTokens !== undefined
                ? Math.min(usage.total_tokens, maxTokens)
                : usage.total_tokens;
            yield* offerRuntimeEvent({
              type: "thread.token-usage.updated",
              ...(yield* makeEventStamp()),
              provider: PROVIDER,
              providerInstanceId: boundInstanceId,
              threadId: ctx.threadId,
              turnId,
              payload: {
                usage: {
                  usedTokens,
                  ...(maxTokens !== undefined ? { maxTokens } : {}),
                  ...(ctx.totalProcessedTokens > usedTokens
                    ? { totalProcessedTokens: ctx.totalProcessedTokens }
                    : {}),
                  lastUsedTokens: usage.total_tokens,
                  ...(usage.input_tokens !== undefined
                    ? { inputTokens: usage.input_tokens, lastInputTokens: usage.input_tokens }
                    : {}),
                  ...(usage.output_tokens !== undefined
                    ? { outputTokens: usage.output_tokens, lastOutputTokens: usage.output_tokens }
                    : {}),
                  ...(usage.thinking_tokens !== undefined
                    ? { reasoningOutputTokens: usage.thinking_tokens }
                    : {}),
                  ...(usage.cache_read_tokens !== undefined
                    ? { cachedInputTokens: usage.cache_read_tokens }
                    : {}),
                },
              },
            });
          }
          yield* offerRuntimeEvent({
            type: "turn.completed",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            providerInstanceId: boundInstanceId,
            threadId: ctx.threadId,
            turnId,
            payload: { state: "completed", stopReason: null, ...(usage ? { usage } : {}) },
          });
          return;
        }
        case "failed": {
          yield* offerRuntimeEvent({
            type: "turn.completed",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            providerInstanceId: boundInstanceId,
            threadId: ctx.threadId,
            turnId,
            payload: { state: "failed", errorMessage: outcome.errorMessage },
          });
          return;
        }
        case "interrupted": {
          yield* offerRuntimeEvent({
            type: "turn.aborted",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            providerInstanceId: boundInstanceId,
            threadId: ctx.threadId,
            turnId,
            payload: { reason: "Turn interrupted by user." },
          });
          return;
        }
      }
    });

  const sendTurn: AgyAdapterShape["sendTurn"] = (input) =>
    Effect.gen(function* () {
      const prepared = yield* withThreadLock(
        input.threadId,
        Effect.gen(function* () {
          const ctx = yield* requireSession(input.threadId);
          if (ctx.activeTurn) {
            return yield* new ProviderAdapterRequestError({
              provider: PROVIDER,
              method: "agy/print",
              detail:
                "Antigravity runs one turn at a time. Stop the active turn before sending a new message.",
            });
          }

          const text = input.input?.trim() ?? "";
          const attachmentPaths: Array<string> = [];
          for (const attachment of input.attachments ?? []) {
            const attachmentPath = resolveAttachmentPath({
              attachmentsDir: serverConfig.attachmentsDir,
              attachment,
            });
            if (!attachmentPath) {
              return yield* new ProviderAdapterRequestError({
                provider: PROVIDER,
                method: "agy/print",
                detail: `Invalid attachment id '${attachment.id}'.`,
              });
            }
            attachmentPaths.push(attachmentPath);
          }
          const prompt =
            attachmentPaths.length > 0
              ? `${text}${text ? "\n\n" : ""}Attached files (read them from disk):\n${attachmentPaths
                  .map((p) => `- ${p}`)
                  .join("\n")}`
              : text;
          if (!prompt) {
            return yield* new ProviderAdapterValidationError({
              provider: PROVIDER,
              operation: "sendTurn",
              issue: "Turn requires non-empty text or attachments.",
            });
          }

          const turnId = TurnId.make(yield* randomUUIDv4);
          const turnModel =
            input.modelSelection?.instanceId === boundInstanceId
              ? input.modelSelection.model
              : ctx.session.model;

          const turnScope = yield* Scope.make();
          ctx.activeTurn = { turnId, scope: turnScope };
          ctx.turns.push({
            id: turnId,
            items: [{ type: "user_message", text: prompt }],
          });
          ctx.session = {
            ...ctx.session,
            status: "running",
            activeTurnId: turnId,
            ...(turnModel ? { model: turnModel } : {}),
            updatedAt: yield* nowIso,
          };

          yield* offerRuntimeEvent({
            type: "turn.started",
            ...(yield* makeEventStamp()),
            provider: PROVIDER,
            providerInstanceId: boundInstanceId,
            threadId: input.threadId,
            turnId,
            payload: turnModel ? { model: turnModel } : {},
          });

          return { ctx, turnId, prompt, turnModel, turnScope };
        }),
      );

      const { ctx, turnId, prompt, turnModel, turnScope } = prepared;

      const runTurn = Effect.gen(function* () {
        const args: Array<string> = [
          "-p",
          prompt,
          "--output-format",
          "stream-json",
          "--print-timeout",
          AGY_PRINT_TIMEOUT,
          "--disable-slash-commands",
          ...(ctx.conversationId ? ["--conversation", ctx.conversationId] : []),
          ...(turnModel ? ["--model", turnModel] : []),
          ...(agySettings.skipPermissions ? ["--dangerously-skip-permissions"] : []),
          ...splitLaunchArgs(agySettings.launchArgs),
        ];
        const spawnCommand = yield* resolveSpawnCommand(agyBinary(agySettings), args, {
          env: environment,
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ProviderAdapterProcessError({
                provider: PROVIDER,
                threadId: ctx.threadId,
                detail: "Failed to resolve Antigravity CLI command.",
                cause,
              }),
          ),
        );

        const child = yield* spawner
          .spawn(
            ChildProcess.make(spawnCommand.command, spawnCommand.args, {
              env: environment,
              ...(ctx.session.cwd ? { cwd: ctx.session.cwd } : {}),
              shell: spawnCommand.shell,
              // `agy` blocks for as long as its stdin pipe stays open —
              // always close stdin for non-interactive invocations.
              stdin: "ignore",
            }),
          )
          .pipe(
            Scope.provide(turnScope),
            Effect.mapError(
              (cause) =>
                new ProviderAdapterProcessError({
                  provider: PROVIDER,
                  threadId: ctx.threadId,
                  detail: "Failed to spawn Antigravity CLI process.",
                  cause,
                }),
            ),
          );

        const assistantItemId = `${turnId}:assistant`;
        let assistantText = "";
        let assistantItemStarted = false;
        // Boxed because the assignment happens inside a closure TS cannot
        // track — a plain `let` narrows back to `undefined` at the return.
        const resultBox: {
          value: Extract<AgyStreamEvent, { readonly _tag: "result" }> | undefined;
        } = { value: undefined };

        const handleStreamEvent = (event: AgyStreamEvent) =>
          Effect.gen(function* () {
            switch (event._tag) {
              case "init": {
                const isFirstConversation = ctx.conversationId === undefined;
                ctx.conversationId = event.conversationId;
                ctx.session = {
                  ...ctx.session,
                  resumeCursor: makeResumeCursor(event.conversationId),
                };
                if (isFirstConversation) {
                  yield* offerRuntimeEvent({
                    type: "thread.metadata.updated",
                    ...(yield* makeEventStamp()),
                    provider: PROVIDER,
                    providerInstanceId: boundInstanceId,
                    threadId: ctx.threadId,
                    turnId,
                    payload: { metadata: { conversationId: event.conversationId } },
                  });
                }
                return;
              }
              case "delta": {
                if (!assistantItemStarted) {
                  assistantItemStarted = true;
                  yield* offerRuntimeEvent({
                    type: "item.started",
                    ...(yield* makeEventStamp()),
                    provider: PROVIDER,
                    providerInstanceId: boundInstanceId,
                    threadId: ctx.threadId,
                    turnId,
                    itemId: RuntimeItemId.make(assistantItemId),
                    payload: { itemType: "assistant_message", status: "inProgress" },
                  });
                }
                assistantText += event.text;
                yield* offerRuntimeEvent({
                  type: "content.delta",
                  ...(yield* makeEventStamp()),
                  provider: PROVIDER,
                  providerInstanceId: boundInstanceId,
                  threadId: ctx.threadId,
                  turnId,
                  itemId: RuntimeItemId.make(assistantItemId),
                  payload: { streamKind: "assistant_text", delta: event.text },
                });
                return;
              }
              case "result": {
                resultBox.value = event;
                return;
              }
            }
          });

        let lineBuffer = "";
        const consumeChunk = (chunk: string) =>
          Effect.gen(function* () {
            lineBuffer += chunk;
            let newlineIndex = lineBuffer.indexOf("\n");
            while (newlineIndex >= 0) {
              const line = lineBuffer.slice(0, newlineIndex);
              lineBuffer = lineBuffer.slice(newlineIndex + 1);
              const event = parseAgyStreamLine(line);
              if (event) {
                yield* handleStreamEvent(event);
              }
              newlineIndex = lineBuffer.indexOf("\n");
            }
          });

        const [, stderrText, exitCode] = yield* Effect.all(
          [
            child.stdout.pipe(Stream.decodeText(), Stream.runForEach(consumeChunk), Effect.ignore),
            child.stderr.pipe(
              Stream.decodeText(),
              Stream.runFold(
                () => "",
                (acc, chunk) => (acc.length > 8_192 ? acc : acc + chunk),
              ),
              Effect.orElseSucceed(() => ""),
            ),
            child.exitCode.pipe(
              Effect.map(Number),
              Effect.orElseSucceed(() => -1),
            ),
          ],
          { concurrency: "unbounded" },
        );

        const trailing = parseAgyStreamLine(lineBuffer);
        if (trailing) {
          yield* handleStreamEvent(trailing);
        }

        return {
          assistantText,
          assistantItemStarted,
          assistantItemId,
          sawResult: resultBox.value,
          stderrText,
          exitCode,
        };
      });

      const runExit = yield* Effect.exit(runTurn);

      return yield* withThreadLock(
        input.threadId,
        Effect.gen(function* () {
          const liveCtx = sessions.get(input.threadId);
          yield* Scope.close(turnScope, Exit.void).pipe(Effect.ignore);
          if (!liveCtx) {
            return yield* new ProviderAdapterSessionNotFoundError({
              provider: PROVIDER,
              threadId: input.threadId,
            });
          }

          const wasInterrupted = liveCtx.interruptedTurnIds.has(turnId);

          if (Exit.isFailure(runExit)) {
            if (!wasInterrupted) {
              yield* settleTurn(liveCtx, turnId, {
                _tag: "failed",
                errorMessage: "Antigravity CLI turn failed. Check server logs for details.",
              });
            }
            if (liveCtx.activeTurn?.turnId === turnId) {
              liveCtx.activeTurn = undefined;
            }
            return yield* new ProviderAdapterProcessError({
              provider: PROVIDER,
              threadId: input.threadId,
              detail: "Antigravity CLI turn failed.",
              cause: runExit.cause,
            });
          }

          const outcome = runExit.value;
          const turnRecord = liveCtx.turns.find((turn) => turn.id === turnId);
          if (turnRecord && outcome.assistantText) {
            turnRecord.items.push({ type: "assistant_message", text: outcome.assistantText });
          }

          if (outcome.assistantItemStarted) {
            yield* offerRuntimeEvent({
              type: "item.completed",
              ...(yield* makeEventStamp()),
              provider: PROVIDER,
              providerInstanceId: boundInstanceId,
              threadId: liveCtx.threadId,
              turnId,
              itemId: RuntimeItemId.make(outcome.assistantItemId),
              payload: {
                itemType: "assistant_message",
                status: wasInterrupted ? "declined" : "completed",
              },
            });
          }

          if (wasInterrupted) {
            // interruptTurn already emitted turn.aborted and reset the session.
            return {
              threadId: input.threadId,
              turnId,
              ...(liveCtx.conversationId
                ? { resumeCursor: makeResumeCursor(liveCtx.conversationId) }
                : {}),
            };
          }

          const sawResult = outcome.sawResult;
          if (sawResult && sawResult.status === "SUCCESS") {
            yield* settleTurn(liveCtx, turnId, {
              _tag: "completed",
              usage: sawResult.usage,
              model: turnModel,
            });
          } else {
            const errorMessage =
              sawResult?.error ??
              (outcome.exitCode !== 0
                ? outcome.stderrText.trim() ||
                  `Antigravity CLI exited with code ${outcome.exitCode}.`
                : "Antigravity CLI finished without a result event.");
            yield* settleTurn(liveCtx, turnId, { _tag: "failed", errorMessage });
          }

          return {
            threadId: input.threadId,
            turnId,
            ...(liveCtx.conversationId
              ? { resumeCursor: makeResumeCursor(liveCtx.conversationId) }
              : {}),
          };
        }),
      );
    });

  const interruptTurn: AgyAdapterShape["interruptTurn"] = (threadId, turnId) =>
    withThreadLock(
      threadId,
      Effect.gen(function* () {
        const ctx = yield* requireSession(threadId);
        const activeTurn = ctx.activeTurn;
        if (!activeTurn || (turnId !== undefined && activeTurn.turnId !== turnId)) {
          return;
        }
        ctx.interruptedTurnIds.add(activeTurn.turnId);
        // Closing the turn scope kills the CLI process; the blocked sendTurn
        // observes the exit and skips its own terminal event.
        yield* Scope.close(activeTurn.scope, Exit.void).pipe(Effect.ignore);
        yield* settleTurn(ctx, activeTurn.turnId, { _tag: "interrupted" });
      }),
    );

  const respondToRequest: AgyAdapterShape["respondToRequest"] = (threadId) =>
    Effect.fail(
      new ProviderAdapterRequestError({
        provider: PROVIDER,
        method: "agy/respondToRequest",
        detail: `Antigravity headless mode does not support interactive approvals (thread ${threadId}).`,
      }),
    );

  const respondToUserInput: AgyAdapterShape["respondToUserInput"] = (threadId) =>
    Effect.fail(
      new ProviderAdapterRequestError({
        provider: PROVIDER,
        method: "agy/respondToUserInput",
        detail: `Antigravity headless mode does not support interactive user input (thread ${threadId}).`,
      }),
    );

  const readThread: AgyAdapterShape["readThread"] = (threadId) =>
    Effect.gen(function* () {
      const ctx = yield* requireSession(threadId);
      return {
        threadId,
        turns: ctx.turns.map((turn) => ({ id: turn.id, items: [...turn.items] })),
      };
    });

  const rollbackThread: AgyAdapterShape["rollbackThread"] = (threadId) =>
    Effect.fail(
      new ProviderAdapterRequestError({
        provider: PROVIDER,
        method: "agy/rollbackThread",
        detail: `Antigravity does not support thread rollback (thread ${threadId}).`,
      }),
    );

  const stopSessionInternal = (ctx: AgySessionContext) =>
    Effect.gen(function* () {
      if (ctx.stopped) {
        return;
      }
      ctx.stopped = true;
      const activeTurn = ctx.activeTurn;
      if (activeTurn) {
        ctx.interruptedTurnIds.add(activeTurn.turnId);
        yield* Scope.close(activeTurn.scope, Exit.void).pipe(Effect.ignore);
        yield* settleTurn(ctx, activeTurn.turnId, { _tag: "interrupted" });
      }
      sessions.delete(ctx.threadId);
      ctx.session = { ...ctx.session, status: "closed", updatedAt: yield* nowIso };
      yield* offerRuntimeEvent({
        type: "session.exited",
        ...(yield* makeEventStamp()),
        provider: PROVIDER,
        providerInstanceId: boundInstanceId,
        threadId: ctx.threadId,
        payload: { reason: "Session stopped.", exitKind: "graceful" },
      });
    });

  const stopSession: AgyAdapterShape["stopSession"] = (threadId) =>
    withThreadLock(
      threadId,
      Effect.gen(function* () {
        const ctx = sessions.get(threadId);
        if (!ctx) {
          return;
        }
        yield* stopSessionInternal(ctx);
      }),
    );

  const listSessions: AgyAdapterShape["listSessions"] = () =>
    Effect.sync(() => Array.from(sessions.values(), (ctx) => ctx.session));

  const hasSession: AgyAdapterShape["hasSession"] = (threadId) =>
    Effect.sync(() => sessions.has(threadId));

  const stopAll: AgyAdapterShape["stopAll"] = () =>
    Effect.forEach(Array.from(sessions.values()), stopSessionInternal, { discard: true });

  yield* Effect.addFinalizer(() =>
    Effect.ignore(stopAll()).pipe(Effect.tap(() => PubSub.shutdown(runtimeEventPubSub))),
  );

  const streamEvents = Stream.fromPubSub(runtimeEventPubSub);

  return {
    provider: PROVIDER,
    capabilities: { sessionModelSwitch: "in-session" },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions,
    hasSession,
    readThread,
    rollbackThread,
    stopAll,
    streamEvents,
  } satisfies AgyAdapterShape;
});
