/**
 * providerRateLimitStore — last known account quotas per provider instance.
 *
 * Fork-added (see FORK.md). Providers only report quotas while they work, so
 * the numbers have to be remembered between turns (and across restarts, which
 * happen on every fork update) and then attached to the provider snapshots the
 * clients already consume.
 *
 * This is deliberately a module-level singleton rather than an Effect service:
 * it lets the two upstream touch points (the runtime-event fan-in and the
 * provider aggregator) stay one-liners without widening any layer's `R` or
 * disturbing upstream tests. The persistence side is captured once at
 * configure time, so recording stays requirement-free.
 *
 * @module provider/providerRateLimitStore
 */
import {
  type ProviderRateLimits,
  ProviderRateLimits as ProviderRateLimitsSchema,
  type ProviderRuntimeEvent,
  type ServerProvider,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";

import { mergeProviderRateLimits, parseProviderRateLimits } from "./providerRateLimits.ts";

const StoredRateLimits = Schema.Record(Schema.String, ProviderRateLimitsSchema);
const decodeStored = Schema.decodeEffect(Schema.fromJsonString(StoredRateLimits));
const encodeStored = Schema.encodeEffect(Schema.fromJsonString(StoredRateLimits));

let limitsByInstance = new Map<string, ProviderRateLimits>();
/** Captured at configure time so recording needs no services of its own. */
let persist: ((limits: Record<string, ProviderRateLimits>) => Effect.Effect<void>) | null = null;

/**
 * Point the store at its cache file and load whatever was persisted. Safe to
 * call more than once; a corrupt or missing file just starts an empty store.
 */
export const configureProviderRateLimitStore = Effect.fn("configureProviderRateLimitStore")(
  function* (filePath: string) {
    const fileSystem = yield* FileSystem.FileSystem;

    persist = (limits) =>
      encodeStored(limits).pipe(
        Effect.flatMap((content) => fileSystem.writeFileString(filePath, `${content}\n`)),
        // Losing the cache only costs us the values until the next turn.
        Effect.ignore,
      );

    const restored = yield* fileSystem
      .readFileString(filePath)
      .pipe(Effect.flatMap(decodeStored), Effect.option);
    if (restored._tag === "Some") {
      limitsByInstance = new Map(Object.entries(restored.value));
    }
  },
);

/**
 * Fold an `account.rate-limits.updated` event into the store. Any other event
 * type, or a payload we cannot read, is ignored.
 */
export const recordProviderRateLimitEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
  Effect.suspend(() => {
    if (event.type !== "account.rate-limits.updated") return Effect.void;
    const instanceId = event.providerInstanceId;
    if (!instanceId) return Effect.void;
    const parsed = parseProviderRateLimits({
      rateLimits: event.payload.rateLimits,
      observedAt: event.createdAt,
    });
    if (!parsed) return Effect.void;
    limitsByInstance.set(
      instanceId,
      mergeProviderRateLimits(limitsByInstance.get(instanceId), parsed),
    );
    // Writes are rare (a handful per turn) and the file is tiny, so they run
    // inline rather than behind a debounce fiber.
    return persist ? persist(Object.fromEntries(limitsByInstance)) : Effect.void;
  });

/** Attach the remembered quotas to provider snapshots on their way to clients. */
export function overlayProviderRateLimits(
  providers: ReadonlyArray<ServerProvider>,
): ReadonlyArray<ServerProvider> {
  if (limitsByInstance.size === 0) return providers;
  let changed = false;
  const overlaid = providers.map((provider) => {
    const rateLimits = limitsByInstance.get(provider.instanceId);
    if (!rateLimits || provider.rateLimits === rateLimits) return provider;
    changed = true;
    return { ...provider, rateLimits };
  });
  return changed ? overlaid : providers;
}

/** Testing seam — the singleton would otherwise leak between test cases. */
export function resetProviderRateLimitStoreForTests(): void {
  limitsByInstance = new Map();
  persist = null;
}
