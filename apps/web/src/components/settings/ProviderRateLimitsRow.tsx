/**
 * ProviderRateLimitsRow — the account quotas a provider last reported.
 *
 * Fork-added (see FORK.md). The server normalizes every vendor's payload into
 * `ProviderRateLimits`; this renders one compact line per provider card:
 *
 *   Лимиты · 7d 12% · 5h 92% — сброс в 14:20        (обновлено 5 мин назад)
 *
 * Providers report quotas only while they work, so the line is explicitly a
 * "last known" reading with its own timestamp rather than something live.
 */
import type { ProviderRateLimits, ProviderRateLimitWindow } from "@t3tools/contracts";
import { providerRateLimitState } from "@t3tools/contracts";

import { cn } from "~/lib/utils";

function formatClock(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === new Date().toDateString();
  return date.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    ...(sameDay ? {} : { day: "numeric", month: "short" }),
  });
}

function formatObservedAt(iso: string): string | null {
  const observed = new Date(iso);
  if (Number.isNaN(observed.getTime())) return null;
  const minutes = Math.round((Date.now() - observed.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const WINDOW_STYLES = {
  ok: "text-muted-foreground/80",
  warning: "text-amber-600 dark:text-amber-500",
  exhausted: "text-red-600 dark:text-red-500",
} as const;

function windowText(window: ProviderRateLimitWindow): string {
  // Codex reports a percentage; Claude only reports how the window feels.
  if (typeof window.usedPercent === "number") {
    return `${window.label} ${Math.round(window.usedPercent)}%`;
  }
  return window.state === "exhausted" ? `${window.label} исчерпан` : window.label;
}

export function ProviderRateLimitsRow({ rateLimits }: { rateLimits: ProviderRateLimits }) {
  if (rateLimits.windows.length === 0) return null;

  const worst = providerRateLimitState(rateLimits);
  // The soonest reset is the one worth surfacing; the rest is in the tooltip.
  const nextReset = rateLimits.windows
    .map((window) => window.resetsAt)
    .filter((resetsAt): resetsAt is string => Boolean(resetsAt))
    .sort()[0];
  const resetLabel = formatClock(nextReset);
  const observedLabel = formatObservedAt(rateLimits.observedAt);

  return (
    <p
      className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-[13px] leading-[1.45] text-muted-foreground/80"
      title={
        observedLabel
          ? `Последние данные от провайдера, ${observedLabel}`
          : "Последние данные от провайдера"
      }
    >
      <span className={cn(worst === "ok" ? "text-muted-foreground/70" : WINDOW_STYLES[worst])}>
        Лимиты
      </span>
      {rateLimits.plan ? <span className="text-muted-foreground/60">{rateLimits.plan}</span> : null}
      {rateLimits.windows.map((window) => (
        <span key={window.label} className={cn("tabular-nums", WINDOW_STYLES[window.state])}>
          · {windowText(window)}
        </span>
      ))}
      {resetLabel ? <span className="text-muted-foreground/60">— сброс {resetLabel}</span> : null}
      {rateLimits.note ? (
        <span className="text-muted-foreground/60">· {rateLimits.note}</span>
      ) : null}
    </p>
  );
}
