import { describe, expect, it } from "vitest";
import {
  providerUsageSchema,
  usageWindowSchema as footerWindowSchema,
} from "./usage-schema.js";
import { usageMeasurementSchema as sourceMeasurementSchema } from "./usage-source-contract.js";

const adapterWindows = [
  {
    label: "Cursor Models",
    usedPercent: 23,
    resetsAt: "2026-11-21T23:22:24.000Z",
    cycleStartsAt: "2026-10-21T23:22:24.000Z",
  },
  {
    label: "Other Models",
    usedPercent: 33,
    resetsAt: "2026-11-21T23:22:24.000Z",
    cycleStartsAt: "2026-10-21T23:22:24.000Z",
  },
];

describe("Cursor usage contract chain", () => {
  it("keeps two pools and cycle bounds through source RPC and footer schema", () => {
    const source = sourceMeasurementSchema.parse({
      accountKey: null,
      observedAt: 1,
      usage: {
        status: "ok",
        plan: null,
        accountEmail: "cursor@example.com",
        planLabel: "Ultra",
        windows: adapterWindows.map((window, index) => ({
          id: `${index}:${window.label}`,
          kind: "custom",
          label: window.label,
          usedPercent: window.usedPercent,
          resetsAt: window.resetsAt,
          cycleStartsAt: window.cycleStartsAt,
          model: null,
          cost: null,
        })),
      },
    });
    expect(source.usage.status).toBe("ok");
    if (source.usage.status !== "ok") throw new Error("expected ok source");
    expect(source.usage.windows.map((window) => window.label)).toEqual([
      "Cursor Models",
      "Other Models",
    ]);
    expect(source.usage.windows.map((window) => window.cycleStartsAt)).toEqual([
      "2026-10-21T23:22:24.000Z",
      "2026-10-21T23:22:24.000Z",
    ]);

    const footerUsage = providerUsageSchema.parse({
      status: "ok",
      accountEmail: source.usage.accountEmail,
      planLabel: source.usage.planLabel,
      windows: source.usage.windows.map((window) => ({
        label: window.label,
        usedPercent: window.usedPercent,
        resetsAt: window.resetsAt,
        cycleStartsAt: window.cycleStartsAt ?? null,
        cost: window.cost,
      })),
    });
    expect(footerUsage.status).toBe("ok");
    if (footerUsage.status !== "ok") throw new Error("expected ok footer");
    expect(
      footerUsage.windows.map((window) => footerWindowSchema.parse(window)),
    ).toEqual(footerUsage.windows);
    expect(JSON.stringify(footerUsage)).not.toContain("Plan usage");
    expect(JSON.stringify(footerUsage)).not.toContain("23.18784");
  });

  it("accepts Codex and Claude windows that omit cycleStartsAt", () => {
    const usage = providerUsageSchema.parse({
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
    });
    expect(usage).toMatchObject({
      windows: [{ label: "Weekly limit", usedPercent: 37 }],
    });
    if (usage.status !== "ok") throw new Error("expected ok usage");
    expect(usage.windows[0]).not.toHaveProperty("cycleStartsAt");
  });
});
