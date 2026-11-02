// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { ProviderUsageStatusContent } from "./app.js";
import {
  computeUsagePace,
  formatPaceMargin,
} from "./usage-pace.js";
import type { UsageProvider, UsageWindow } from "./usage-schema.js";

installTestPluginRuntime();

afterEach(() => {
  cleanup();
});

const NOW = Date.parse("2026-11-02T18:42:00.000Z");
const CYCLE_START = "2026-10-21T23:22:24.000Z";
const CYCLE_END = "2026-11-21T23:22:24.000Z";
const MEXICO = "America/Mexico_City";

function cursorAccount(windows: UsageWindow[]): UsageProvider {
  return {
    id: "acp-cursor",
    providerId: "acp-cursor",
    accountLabel: null,
    displayName: "Cursor",
    logoUrl: null,
    icon: null,
    strings: { iconTint: null },
    signInHint: "Sign in to Cursor.",
    expiredHint: "Sign in to Cursor again.",
    usage: {
      status: "ok",
      accountEmail: "cursor@example.com",
      planLabel: "Ultra",
      windows,
    },
  };
}

function renderFooter(providers: UsageProvider[], width: number) {
  const view = render(
    <div
      className="overflow-hidden rounded-xl border border-sidebar-border bg-sidebar text-sidebar-foreground"
      style={{ width }}
    >
      <ProviderUsageStatusContent
        pluginId="bb--provider-usage"
        dismiss={() => {}}
        snapshot={{
          data: {
            machines: [
              {
                id: "host-m4",
                displayName: "M4",
                status: "connected",
                error: null,
                providers,
              },
            ],
          },
          error: null,
          isRefreshing: false,
        }}
        threadMachineId={null}
        refreshEnabled={false}
        timeZone={MEXICO}
        now={NOW}
      />
    </div>,
  );
  return view;
}

describe("Cursor usage pace visual review", () => {
  it("pins America/Mexico_City so a Europe/Berlin host cannot shift close-of-day", () => {
    const under = renderFooter(
      [
        cursorAccount([
          {
            label: "Cursor Models",
            usedPercent: 23,
            resetsAt: CYCLE_END,
            cycleStartsAt: CYCLE_START,
            cost: null,
          },
          {
            label: "Other Models",
            usedPercent: 33,
            resetsAt: CYCLE_END,
            cycleStartsAt: CYCLE_START,
            cost: null,
          },
        ]),
      ],
      240,
    );
    const berlinIdeal = computeUsagePace({
      usedPercent: 23,
      cycleStartsAt: CYCLE_START,
      cycleEndsAt: CYCLE_END,
      now: NOW,
      timeZone: "Europe/Berlin",
    })!.idealPercent;
    const mexico = computeUsagePace({
      usedPercent: 23,
      cycleStartsAt: CYCLE_START,
      cycleEndsAt: CYCLE_END,
      now: NOW,
      timeZone: MEXICO,
    })!;
    expect(
      under.container
        .querySelector("[data-usage-timezone]")
        ?.getAttribute("data-usage-timezone"),
    ).toBe(MEXICO);
    expect(mexico.idealPercent).toBeCloseTo(39.60035842293907, 8);
    expect(mexico.idealPercent).not.toBeCloseTo(berlinIdeal, 4);
    expect(under.container.textContent).toContain("Cursor");
    expect(under.container.textContent).toContain("Other");
    expect(under.container.textContent).toContain("23%");
    expect(under.container.textContent).toContain("33%");
    expect(under.container.textContent).toContain(
      formatPaceMargin(mexico.marginPercent),
    );
    expect(under.container.textContent).toContain(
      formatPaceMargin(
        computeUsagePace({
          usedPercent: 33,
          cycleStartsAt: CYCLE_START,
          cycleEndsAt: CYCLE_END,
          now: NOW,
          timeZone: MEXICO,
        })!.marginPercent,
      ),
    );
    expect(under.container.textContent).not.toContain("Plan usage");
    expect(
      under.container.querySelectorAll("[data-usage-pace-ideal]"),
    ).toHaveLength(2);
    const cursorRow = under.container.querySelector(
      '[aria-label*="Cursor Models"]',
    );
    expect(cursorRow).not.toBeNull();
    fireEvent.click(cursorRow!);
    expect(under.container.textContent).toMatch(/Resets|Reset time/u);
    expect(under.container.textContent).toMatch(
      /remaining to stay on pace through today/u,
    );
    under.unmount();
  });

  it("keeps a negative margin compact at sidebar width and leaves Codex without a pace mark", () => {
    const over = renderFooter(
      [
        cursorAccount([
          {
            label: "Cursor Models",
            usedPercent: 55,
            resetsAt: CYCLE_END,
            cycleStartsAt: CYCLE_START,
            cost: null,
          },
        ]),
        {
          id: "codex",
          providerId: "codex",
          accountLabel: null,
          displayName: "Codex",
          logoUrl: null,
          icon: null,
          strings: { iconTint: null },
          signInHint: "Sign in to Codex.",
          expiredHint: "Sign in to Codex again.",
          usage: {
            status: "ok",
            accountEmail: "codex@example.com",
            planLabel: "Plus",
            windows: [
              {
                label: "Weekly limit",
                usedPercent: 37,
                resetsAt: null,
                cost: null,
              },
            ],
          },
        },
      ],
      303,
    );
    expect(over.container.textContent).toContain(
      formatPaceMargin(
        computeUsagePace({
          usedPercent: 55,
          cycleStartsAt: CYCLE_START,
          cycleEndsAt: CYCLE_END,
          now: NOW,
          timeZone: MEXICO,
        })!.marginPercent,
      ),
    );
    const cursorTab = over.container.querySelector(
      '[role="tab"][aria-label="Cursor"]',
    );
    const codexTab = over.container.querySelector(
      '[role="tab"][aria-label="Codex"]',
    );
    expect(cursorTab).not.toBeNull();
    expect(codexTab).not.toBeNull();
    fireEvent.click(codexTab!);
    expect(over.container.textContent).toContain("37%");
    expect(over.container.textContent).toContain("7d");
    expect(over.container.querySelector("[data-usage-pace-ideal]")).toBeNull();
    expect(over.container.textContent).not.toContain("Plan usage");
    over.unmount();
  });
});
