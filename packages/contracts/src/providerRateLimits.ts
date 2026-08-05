/**
 * Provider rate limits — normalized view of the account quotas providers
 * report while they work.
 *
 * Fork-added (see FORK.md). Upstream already transports the vendor-native
 * payload as `account.rate-limits.updated` with an opaque `rateLimits:
 * unknown`, but nothing renders it. Each vendor uses a different shape
 * (Codex: percent + window minutes; Claude: a status + reset stamp), so the
 * server normalizes them into the structure below and hangs it off the
 * provider snapshot — that way every client (web, desktop, mobile) gets it
 * through the channel it already consumes.
 *
 * @module providerRateLimits
 */
import * as Schema from "effect/Schema";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * How close a window is to its ceiling. Providers that only report a
 * coarse state (Claude) map onto this; providers with a percentage
 * (Codex) get it derived.
 */
export const ProviderRateLimitState = Schema.Literals(["ok", "warning", "exhausted"]);
export type ProviderRateLimitState = typeof ProviderRateLimitState.Type;

/**
 * One quota window, e.g. "5 hours" or "7 days". `usedPercent` is absent for
 * providers that never report it — consumers then fall back to `state`.
 */
export const ProviderRateLimitWindow = Schema.Struct({
  /** Human-readable window label, e.g. "5h" or "7d". */
  label: TrimmedNonEmptyString,
  /** Window length in minutes, when the provider reports it. */
  windowMinutes: Schema.optional(Schema.Number),
  usedPercent: Schema.optional(Schema.Number),
  resetsAt: Schema.optional(IsoDateTime),
  state: ProviderRateLimitState,
});
export type ProviderRateLimitWindow = typeof ProviderRateLimitWindow.Type;

export const ProviderRateLimits = Schema.Struct({
  /** When the provider last told us about these numbers. */
  observedAt: IsoDateTime,
  /** Plan label the provider reports, e.g. "plus" or "max". */
  plan: Schema.optional(TrimmedNonEmptyString),
  windows: Schema.Array(ProviderRateLimitWindow),
  /** Free-form extra, e.g. a credit balance. */
  note: Schema.optional(TrimmedNonEmptyString),
});
export type ProviderRateLimits = typeof ProviderRateLimits.Type;

/** Worst state across the windows — drives the summary badge. */
export function providerRateLimitState(limits: ProviderRateLimits): ProviderRateLimitState {
  if (limits.windows.some((window) => window.state === "exhausted")) return "exhausted";
  if (limits.windows.some((window) => window.state === "warning")) return "warning";
  return "ok";
}

/** Compact window label from a duration in minutes ("5h", "7d", "45m"). */
export function formatRateLimitWindowLabel(windowMinutes: number): string {
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) return "—";
  if (windowMinutes % (60 * 24) === 0) return `${windowMinutes / (60 * 24)}d`;
  if (windowMinutes % 60 === 0) return `${windowMinutes / 60}h`;
  return `${Math.round(windowMinutes)}m`;
}
