import type { ProviderRateLimits } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderPlanUsageLimits } from "./ProviderPlanUsageLimits";

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

describe("ProviderPlanUsageLimits", () => {
  it("renders a Codex-style window with its percentage and bar", () => {
    const rateLimits: ProviderRateLimits = {
      observedAt: new Date().toISOString(),
      plan: "plus",
      windows: [
        {
          label: "7d",
          windowMinutes: 10080,
          usedPercent: 21,
          resetsAt: inHours(50),
          state: "ok",
        },
      ],
    };

    const markup = renderToStaticMarkup(<ProviderPlanUsageLimits rateLimits={rateLimits} />);
    expect(markup).toContain("Plan usage limits");
    expect(markup).toContain("plus");
    expect(markup).toContain("Weekly");
    expect(markup).toContain("21%");
    expect(markup).toContain('aria-valuenow="21"');
  });

  it("spells out the reset countdown for a window inside a day", () => {
    const rateLimits: ProviderRateLimits = {
      observedAt: new Date().toISOString(),
      windows: [
        {
          label: "5h",
          windowMinutes: 300,
          usedPercent: 45,
          resetsAt: inHours(4.5),
          state: "ok",
        },
      ],
    };

    const markup = renderToStaticMarkup(<ProviderPlanUsageLimits rateLimits={rateLimits} />);
    expect(markup).toContain("5-hour limit");
    expect(markup).toMatch(/Resets in 4 hr \d+ min/);
  });

  it("falls back to a state word when the provider reports no percentage", () => {
    const rateLimits: ProviderRateLimits = {
      observedAt: new Date().toISOString(),
      windows: [{ label: "5h", windowMinutes: 300, resetsAt: inHours(2), state: "exhausted" }],
    };

    const markup = renderToStaticMarkup(<ProviderPlanUsageLimits rateLimits={rateLimits} />);
    expect(markup).toContain("reached");
    // No percentage means no bar to draw.
    expect(markup).not.toContain("progressbar");
  });

  it("renders nothing without windows", () => {
    const markup = renderToStaticMarkup(
      <ProviderPlanUsageLimits
        rateLimits={{ observedAt: new Date().toISOString(), windows: [] }}
      />,
    );
    expect(markup).toBe("");
  });
});
