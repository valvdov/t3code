/**
 * AgySettings — driver-specific configuration for the Antigravity (`agy`) CLI
 * provider.
 *
 * Defined in apps/server (not @t3tools/contracts) on purpose: the contracts
 * layer treats driver config as an opaque envelope (see providerInstance.ts),
 * and keeping this schema out of contracts keeps the fork's diff against
 * upstream to a minimum.
 *
 * @module provider/Drivers/AgySettings
 */
import { makeProviderSettingsSchema, TrimmedString } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const trimmedStringWithDefault = TrimmedString.pipe(
  Schema.withDecodingDefault(Effect.succeed("")),
);

export const AgySettings = makeProviderSettingsSchema(
  {
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(true)),
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
