/**
 * AgySettings — driver-specific configuration for the Antigravity (`agy`)
 * CLI provider (fork-added driver, not part of upstream t3code).
 *
 * Lives in contracts (own file, exported append-only from index.ts) so both
 * the server driver and the web settings UI can consume the same schema,
 * while keeping the fork's diff against upstream minimal.
 *
 * @module agySettings
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TrimmedString } from "./baseSchemas.ts";
import { makeProviderSettingsSchema } from "./settings.ts";

const trimmedStringWithDefault = TrimmedString.pipe(
  Schema.withDecodingDefault(Effect.succeed("")),
);

export const AgySettings = makeProviderSettingsSchema(
  {
    // Default-disabled (like Cursor upstream): machines without the `agy`
    // CLI never get probed, and enabling is a one-time Settings toggle that
    // persists via `providerInstances`.
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: trimmedStringWithDefault.pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the Antigravity CLI binary used by this instance.",
        providerSettingsForm: { placeholder: "agy", clearWhenEmpty: "omit" },
      }),
    ),
    launchArgs: trimmedStringWithDefault.pipe(
      Schema.annotateKey({
        title: "Launch arguments",
        description: "Additional CLI arguments passed to `agy` on every turn.",
        providerSettingsForm: { placeholder: "e.g. --sandbox", clearWhenEmpty: "omit" },
      }),
    ),
    skipPermissions: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(true)),
      Schema.annotateKey({
        title: "Auto-approve tool calls",
        description:
          "Pass --dangerously-skip-permissions so headless turns can run tools without interactive approval. When off, tools requiring approval are soft-denied by the CLI.",
      }),
    ),
    customModels: Schema.Array(Schema.String).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath", "launchArgs", "skipPermissions"],
  },
);
export type AgySettings = typeof AgySettings.Type;
