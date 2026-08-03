/**
 * AgyProvider — snapshot/probe helpers for the Antigravity (`agy`) CLI driver.
 *
 * Mirrors GrokProvider: builds `ServerProviderDraft`s from probe results.
 * Probing is two cheap CLI invocations:
 *
 *   1. `agy --version`  — installed / version
 *   2. `agy models`     — model inventory; doubles as the auth check because
 *      headless mode only works with cached credentials from a prior
 *      interactive `agy` session.
 *
 * @module provider/Layers/AgyProvider
 */
import { type ModelCapabilities, type ServerProviderModel } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createModelCapabilities } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import type { AgySettings } from "../Drivers/AgySettings.ts";
import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";

export const AGY_PRESENTATION = {
  displayName: "Antigravity",
  badgeLabel: "Fork",
  showInteractionModeToggle: false,
  requiresNewThreadForModelChange: false,
} as const;

const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const MODELS_PROBE_TIMEOUT_MS = 30_000;

/** Preferred default model, matched by prefix against the discovered list. */
const DEFAULT_MODEL_PREFERENCE = ["gemini-3.1-pro", "gemini-3", "claude", "gemini"] as const;

export function agyBinary(agySettings: AgySettings): string {
  return agySettings.binaryPath || "agy";
}

function prettifyModelSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function markDefaultModel(
  models: ReadonlyArray<ServerProviderModel>,
): ReadonlyArray<ServerProviderModel> {
  if (models.length === 0 || models.some((model) => model.isDefault)) {
    return models;
  }
  for (const prefix of DEFAULT_MODEL_PREFERENCE) {
    const match = models.find((model) => model.slug.startsWith(prefix));
    if (match) {
      return models.map((model) =>
        model.slug === match.slug ? { ...model, isDefault: true } : model,
      );
    }
  }
  return models.map((model, index) => (index === 0 ? { ...model, isDefault: true } : model));
}

export function agyModelsFromSettings(
  customModels: ReadonlyArray<string> | undefined,
  discoveredModels: ReadonlyArray<ServerProviderModel> = [],
): ReadonlyArray<ServerProviderModel> {
  return markDefaultModel(
    providerModelsFromSettings(discoveredModels, customModels ?? [], EMPTY_CAPABILITIES),
  );
}

export function parseAgyModelList(output: string): ReadonlyArray<ServerProviderModel> {
  const seen = new Set<string>();
  const models: Array<ServerProviderModel> = [];
  for (const line of output.split("\n")) {
    const slug = line.trim();
    // Model slugs are bare tokens like `gemini-3.1-pro-high`; skip anything
    // that looks like log output or prose.
    if (!slug || slug.includes(" ") || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    models.push({
      slug,
      name: prettifyModelSlug(slug),
      isCustom: false,
      capabilities: EMPTY_CAPABILITIES,
    });
  }
  return models;
}

const runAgyCommand = (
  agySettings: AgySettings,
  args: ReadonlyArray<string>,
  environment: NodeJS.ProcessEnv,
) =>
  Effect.gen(function* () {
    const command = agyBinary(agySettings);
    const spawnCommand = yield* resolveSpawnCommand(command, [...args], {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
        // `agy` blocks for as long as its stdin pipe stays open — always
        // close stdin for non-interactive invocations.
        stdin: "ignore",
      }),
    );
  });

export function buildInitialAgyProviderSnapshot(
  agySettings: AgySettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = agyModelsFromSettings(agySettings.customModels);

    if (!agySettings.enabled) {
      return buildServerProvider({
        presentation: AGY_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "Antigravity is disabled in T3 Code settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: AGY_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking Antigravity CLI availability...",
      },
    });
  });
}

export const checkAgyProviderStatus = Effect.fn("checkAgyProviderStatus")(function* (
  agySettings: AgySettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = agyModelsFromSettings(agySettings.customModels);

  if (!agySettings.enabled) {
    return buildServerProvider({
      presentation: AGY_PRESENTATION,
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Antigravity is disabled in T3 Code settings.",
      },
    });
  }

  const versionResult = yield* runAgyCommand(agySettings, ["--version"], environment).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning("Antigravity CLI health check failed.", {
      errorTag: error._tag,
    });
    return buildServerProvider({
      presentation: AGY_PRESENTATION,
      enabled: agySettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "Antigravity CLI (`agy`) is not installed or not on PATH."
          : "Failed to execute Antigravity CLI health check.",
      },
    });
  }

  if (Option.isNone(versionResult.success)) {
    return buildServerProvider({
      presentation: AGY_PRESENTATION,
      enabled: agySettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "Antigravity CLI is installed but timed out while running `agy --version`.",
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    return buildServerProvider({
      presentation: AGY_PRESENTATION,
      enabled: agySettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "Antigravity CLI is installed but failed to run.",
      },
    });
  }

  const modelsResult = yield* runAgyCommand(agySettings, ["models"], environment).pipe(
    Effect.timeoutOption(MODELS_PROBE_TIMEOUT_MS),
    Effect.result,
  );

  if (
    Result.isFailure(modelsResult) ||
    Option.isNone(modelsResult.success) ||
    modelsResult.success.value.code !== 0
  ) {
    const detail = Result.isSuccess(modelsResult)
      ? Option.match(modelsResult.success, {
          onNone: () => "timed out",
          onSome: (output) => output.stderr.trim() || `exit code ${output.code}`,
        })
      : modelsResult.failure._tag;
    yield* Effect.logWarning("Antigravity model discovery failed.", { detail });
    return buildServerProvider({
      presentation: AGY_PRESENTATION,
      enabled: agySettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "warning",
        auth: { status: "unauthenticated" },
        message:
          "Antigravity CLI could not list models. Headless mode needs cached credentials — run `agy` interactively once and sign in.",
      },
    });
  }

  const discoveredModels = parseAgyModelList(modelsResult.success.value.stdout);
  const models =
    discoveredModels.length > 0
      ? agyModelsFromSettings(agySettings.customModels, discoveredModels)
      : fallbackModels;

  return buildServerProvider({
    presentation: AGY_PRESENTATION,
    enabled: agySettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version,
      status: "ready",
      auth: { status: "authenticated", type: "oauth" },
    },
  });
});
