import { describe, expect, it } from "@effect/vitest";

import { mergeProviderRateLimits, parseProviderRateLimits } from "./providerRateLimits.ts";

const observedAt = "2026-08-05T10:00:00.000Z";

// Payloads below are trimmed copies of what the adapters actually forwarded on
// a live server (see FORK.md).
const codexPayload = {
  rateLimits: {
    credits: { balance: "12", hasCredits: true, unlimited: false },
    planType: "plus",
    primary: { resetsAt: 1786396408, usedPercent: 0, windowDurationMins: 10080 },
    secondary: { resetsAt: 1785840600, usedPercent: 92, windowDurationMins: 300 },
  },
};

const claudePayload = {
  type: "rate_limit_event",
  rate_limit_info: {
    status: "rejected",
    resetsAt: 1785840600,
    rateLimitType: "five_hour",
    isUsingOverage: false,
  },
};

describe("providerRateLimits", () => {
  it("normalizes Codex windows, plan and credits", () => {
    const limits = parseProviderRateLimits({ rateLimits: codexPayload, observedAt });
    expect(limits).toEqual({
      observedAt,
      plan: "plus",
      note: "credits: 12",
      windows: [
        {
          label: "7d",
          windowMinutes: 10080,
          usedPercent: 0,
          resetsAt: "2026-08-10T21:13:28.000Z",
          state: "ok",
        },
        {
          label: "5h",
          windowMinutes: 300,
          usedPercent: 92,
          resetsAt: "2026-08-04T10:50:00.000Z",
          state: "warning",
        },
      ],
    });
  });

  it("marks a Codex window at 100% as exhausted", () => {
    const limits = parseProviderRateLimits({
      rateLimits: { rateLimits: { primary: { usedPercent: 100, windowDurationMins: 300 } } },
      observedAt,
    });
    expect(limits?.windows[0]?.state).toBe("exhausted");
  });

  it("normalizes a Claude rate limit event without a percentage", () => {
    const limits = parseProviderRateLimits({ rateLimits: claudePayload, observedAt });
    expect(limits).toEqual({
      observedAt,
      windows: [
        {
          label: "5h",
          windowMinutes: 300,
          resetsAt: "2026-08-04T10:50:00.000Z",
          state: "exhausted",
        },
      ],
    });
  });

  it("returns null for payloads it does not recognise", () => {
    expect(parseProviderRateLimits({ rateLimits: null, observedAt })).toBeNull();
    expect(parseProviderRateLimits({ rateLimits: { unrelated: true }, observedAt })).toBeNull();
    expect(parseProviderRateLimits({ rateLimits: { rateLimits: {} }, observedAt })).toBeNull();
  });

  it("merges windows by label so per-window events do not erase each other", () => {
    const fiveHour = parseProviderRateLimits({ rateLimits: claudePayload, observedAt })!;
    const sevenDay = parseProviderRateLimits({
      rateLimits: {
        rate_limit_info: { status: "allowed", rateLimitType: "seven_day", resetsAt: 1786396408 },
      },
      observedAt: "2026-08-05T11:00:00.000Z",
    })!;

    const merged = mergeProviderRateLimits(fiveHour, sevenDay);
    expect(merged.windows.map((window) => window.label)).toEqual(["5h", "7d"]);
    expect(merged.observedAt).toBe("2026-08-05T11:00:00.000Z");
  });

  it("replaces a window when a newer reading for the same label arrives", () => {
    const first = parseProviderRateLimits({ rateLimits: codexPayload, observedAt })!;
    const second = parseProviderRateLimits({
      rateLimits: { rateLimits: { primary: { usedPercent: 55, windowDurationMins: 10080 } } },
      observedAt: "2026-08-05T12:00:00.000Z",
    })!;

    const merged = mergeProviderRateLimits(first, second);
    expect(merged.windows.find((window) => window.label === "7d")?.usedPercent).toBe(55);
    expect(merged.windows.find((window) => window.label === "5h")?.usedPercent).toBe(92);
  });
});
