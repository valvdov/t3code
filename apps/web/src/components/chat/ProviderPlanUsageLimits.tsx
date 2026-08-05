/**
 * ProviderPlanUsageLimits — the "Plan usage limits" block inside the
 * context-window popover.
 *
 * Fork-added (see FORK.md). Mirrors the layout the reference clients use:
 * one row per quota window with its name, when it resets and how much is
 * spent, plus a bar underneath.
 *
 * Vendors differ in what they report: Codex sends a percentage, Claude only
 * says whether the window is fine/close/rejected. Rows therefore render a bar
 * only when a percentage exists, and fall back to a state word otherwise.
 */
import type { ProviderRateLimits, ProviderRateLimitWindow } from "@t3tools/contracts";

import { cn } from "~/lib/utils";

/** "5h" / "7d" are compact for a settings row but terse for a popover. */
function windowTitle(window: ProviderRateLimitWindow): string {
  if (window.windowMinutes === 5 * 60) return "5-hour limit";
  if (window.windowMinutes === 7 * 24 * 60) {
    return window.label.includes(" ") ? `Weekly · ${window.label.split(" ")[1]}` : "Weekly";
  }
  if (window.windowMinutes !== undefined && window.windowMinutes % (60 * 24) === 0) {
    return `${window.windowMinutes / (60 * 24)}-day limit`;
  }
  if (window.windowMinutes !== undefined && window.windowMinutes % 60 === 0) {
    return `${window.windowMinutes / 60}-hour limit`;
  }
  return window.label;
}

function formatReset(resetsAt: string | undefined): string | null {
  if (!resetsAt) return null;
  const target = new Date(resetsAt);
  if (Number.isNaN(target.getTime())) return null;
  const minutes = Math.round((target.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "Resets now";
  if (minutes < 60) return `Resets in ${minutes} min`;
  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `Resets in ${hours} hr` : `Resets in ${hours} hr ${rest} min`;
  }
  return `Resets ${target.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

const BAR_STYLES = {
  ok: "bg-[var(--color-blue-600,#2563eb)]",
  warning: "bg-amber-500",
  exhausted: "bg-red-500",
} as const;

function PlanUsageRow({ window }: { window: ProviderRateLimitWindow }) {
  const resetLabel = formatReset(window.resetsAt);
  const percent =
    typeof window.usedPercent === "number" ? Math.max(0, Math.min(100, window.usedPercent)) : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-medium text-[13px] text-foreground/90">
          {windowTitle(window)}
        </span>
        <span className="flex shrink-0 items-baseline gap-2 text-[11px] text-muted-foreground/70">
          {resetLabel ? <span>{resetLabel}</span> : null}
          {percent === null ? (
            <span className={cn(window.state === "ok" ? "" : "font-medium")}>
              {window.state === "exhausted"
                ? "reached"
                : window.state === "warning"
                  ? "close"
                  : "ok"}
            </span>
          ) : (
            <span className="tabular-nums font-medium text-muted-foreground">
              {Math.round(percent)}%
            </span>
          )}
        </span>
      </div>
      {percent === null ? null : (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-label={`${windowTitle(window)} usage`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              BAR_STYLES[window.state],
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function ProviderPlanUsageLimits({ rateLimits }: { rateLimits: ProviderRateLimits }) {
  if (rateLimits.windows.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col gap-2 border-t border-border/60 pt-2">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium text-muted-foreground text-xs">
          Plan usage limits
          {rateLimits.plan ? ` · ${rateLimits.plan}` : null}
        </div>
        {rateLimits.note ? (
          <div className="text-[11px] text-muted-foreground/60">{rateLimits.note}</div>
        ) : null}
      </div>
      {rateLimits.windows.map((window) => (
        <PlanUsageRow key={window.label} window={window} />
      ))}
    </div>
  );
}
