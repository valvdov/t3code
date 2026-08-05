/**
 * providerRateLimits — turn vendor-native quota payloads into the normalized
 * `ProviderRateLimits` contract.
 *
 * Fork-added (see FORK.md). `account.rate-limits.updated` carries whatever the
 * provider CLI emitted, typed as `unknown`; the two shapes we actually see:
 *
 *   Codex   { rateLimits: { planType, credits, primary|secondary:
 *             { usedPercent, resetsAt (unix s), windowDurationMins } } }
 *   Claude  { type: "rate_limit_event", rate_limit_info:
 *             { status, rateLimitType, resetsAt (unix s) } }
 *
 * Parsing is deliberately forgiving: a payload we do not recognise yields
 * `null` and the previous snapshot stays untouched — a vendor changing its
 * event shape must never break the provider list.
 *
 * @module provider/providerRateLimits
 */
import {
  formatRateLimitWindowLabel,
  type ProviderRateLimits,
  type ProviderRateLimitState,
  type ProviderRateLimitWindow,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

const WARNING_PERCENT = 80;
const EXHAUSTED_PERCENT = 100;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Provider stamps are unix seconds; the contract wants ISO. */
function isoFromUnixSeconds(value: unknown): string | undefined {
  const seconds = asFiniteNumber(value);
  if (seconds === undefined || seconds <= 0) return undefined;
  return DateTime.make(seconds * 1000).pipe(
    Option.match({ onNone: () => undefined, onSome: DateTime.formatIso }),
  );
}

function stateFromPercent(usedPercent: number): ProviderRateLimitState {
  if (usedPercent >= EXHAUSTED_PERCENT) return "exhausted";
  return usedPercent >= WARNING_PERCENT ? "warning" : "ok";
}

/** Codex reports one or two windows; both carry a percentage. */
function codexWindow(value: unknown): ProviderRateLimitWindow | null {
  const window = asRecord(value);
  if (!window) return null;
  const usedPercent = asFiniteNumber(window.usedPercent);
  const windowMinutes = asFiniteNumber(window.windowDurationMins);
  const resetsAt = isoFromUnixSeconds(window.resetsAt);
  if (usedPercent === undefined && windowMinutes === undefined) return null;
  return {
    label: windowMinutes === undefined ? "—" : formatRateLimitWindowLabel(windowMinutes),
    ...(windowMinutes === undefined ? {} : { windowMinutes }),
    ...(usedPercent === undefined ? {} : { usedPercent }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    state: usedPercent === undefined ? "ok" : stateFromPercent(usedPercent),
  };
}

function parseCodexRateLimits(payload: Record<string, unknown>, observedAt: string) {
  // The adapter forwards the whole notification, whose body is itself keyed
  // `rateLimits` — hence the double hop.
  const limits = asRecord(payload.rateLimits) ?? payload;
  const windows = [codexWindow(limits.primary), codexWindow(limits.secondary)].filter(
    (window): window is ProviderRateLimitWindow => window !== null,
  );
  if (windows.length === 0) return null;

  const credits = asRecord(limits.credits);
  const creditBalance = credits ? asNonEmptyString(credits.balance) : undefined;
  const hasCredits = credits?.hasCredits === true;
  const plan = asNonEmptyString(limits.planType);

  return {
    observedAt,
    ...(plan === undefined ? {} : { plan }),
    windows,
    ...(hasCredits && creditBalance !== undefined ? { note: `credits: ${creditBalance}` } : {}),
  } satisfies ProviderRateLimits;
}

/** `five_hour` / `seven_day` / `sevenDayOpus` → a compact label. */
function claudeWindowLabel(rateLimitType: string | undefined): string {
  switch (rateLimitType) {
    case "five_hour":
      return "5h";
    case "seven_day":
      return "7d";
    case "seven_day_opus":
    case "sevenDayOpus":
      return "7d Opus";
    default:
      return rateLimitType ?? "—";
  }
}

function claudeWindowMinutes(rateLimitType: string | undefined): number | undefined {
  switch (rateLimitType) {
    case "five_hour":
      return 5 * 60;
    case "seven_day":
    case "seven_day_opus":
    case "sevenDayOpus":
      return 7 * 24 * 60;
    default:
      return undefined;
  }
}

function claudeState(status: string | undefined): ProviderRateLimitState {
  switch (status) {
    case "rejected":
    case "exhausted":
      return "exhausted";
    case "allowed_warning":
    case "warning":
      return "warning";
    default:
      return "ok";
  }
}

function parseClaudeRateLimits(payload: Record<string, unknown>, observedAt: string) {
  const info = asRecord(payload.rate_limit_info);
  if (!info) return null;
  const rateLimitType = asNonEmptyString(info.rateLimitType);
  const windowMinutes = claudeWindowMinutes(rateLimitType);
  const resetsAt = isoFromUnixSeconds(info.resetsAt);
  // Claude reports no percentage — only how the window feels right now.
  const window: ProviderRateLimitWindow = {
    label: claudeWindowLabel(rateLimitType),
    ...(windowMinutes === undefined ? {} : { windowMinutes }),
    ...(resetsAt === undefined ? {} : { resetsAt }),
    state: claudeState(asNonEmptyString(info.status)),
  };
  return {
    observedAt,
    windows: [window],
    ...(info.isUsingOverage === true ? { note: "using overage" } : {}),
  } satisfies ProviderRateLimits;
}

/**
 * Normalize one `account.rate-limits.updated` payload. Returns `null` when the
 * payload carries nothing we can show.
 */
export function parseProviderRateLimits(input: {
  readonly rateLimits: unknown;
  readonly observedAt: string;
}): ProviderRateLimits | null {
  const payload = asRecord(input.rateLimits);
  if (!payload) return null;
  if (payload.rate_limit_info !== undefined) {
    return parseClaudeRateLimits(payload, input.observedAt);
  }
  if (payload.rateLimits !== undefined || payload.primary !== undefined) {
    return parseCodexRateLimits(payload, input.observedAt);
  }
  return null;
}

/**
 * Merge a fresh reading into what we already knew for that instance.
 *
 * Claude sends one window per event (`five_hour` now, `seven_day` later), so
 * replacing wholesale would make windows flicker in and out. Windows are
 * therefore merged by label, newest wins.
 */
export function mergeProviderRateLimits(
  previous: ProviderRateLimits | undefined,
  next: ProviderRateLimits,
): ProviderRateLimits {
  if (!previous) return next;
  const byLabel = new Map(previous.windows.map((window) => [window.label, window] as const));
  for (const window of next.windows) {
    byLabel.set(window.label, window);
  }
  return {
    ...previous,
    ...next,
    windows: [...byLabel.values()],
  };
}
