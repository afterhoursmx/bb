import { describe, expect, it } from "vitest";
import {
  computeUsagePace,
  formatPaceCompact,
  formatPaceMargin,
  nextLocalMidnight,
  zonedDateTimeToUtc,
} from "./usage-pace.js";

const OBSERVED_CYCLE_START = "2026-10-21T23:22:24.000Z";
const OBSERVED_CYCLE_END = "2026-11-21T23:22:24.000Z";
const OBSERVED_AUTO = 22.7656666667;
const OBSERVED_API = 33.32;

function pace(input: {
  usedPercent?: number;
  cycleStartsAt?: string | null;
  cycleEndsAt?: string | null;
  now: string;
  timeZone: string;
}) {
  return computeUsagePace({
    usedPercent: input.usedPercent ?? OBSERVED_AUTO,
    cycleStartsAt:
      input.cycleStartsAt === undefined
        ? OBSERVED_CYCLE_START
        : input.cycleStartsAt,
    cycleEndsAt:
      input.cycleEndsAt === undefined ? OBSERVED_CYCLE_END : input.cycleEndsAt,
    now: new Date(input.now),
    timeZone: input.timeZone,
  });
}

describe("local midnight conversion", () => {
  it("maps civil midnights through New York DST", () => {
    expect(
      zonedDateTimeToUtc(2026, 3, 8, 0, 0, 0, "America/New_York").toISOString(),
    ).toBe("2026-03-08T05:00:00.000Z");
    expect(
      zonedDateTimeToUtc(2026, 3, 9, 0, 0, 0, "America/New_York").toISOString(),
    ).toBe("2026-03-09T04:00:00.000Z");
    expect(
      zonedDateTimeToUtc(2026, 11, 1, 0, 0, 0, "America/New_York").toISOString(),
    ).toBe("2026-11-01T04:00:00.000Z");
    expect(
      zonedDateTimeToUtc(2026, 11, 2, 0, 0, 0, "America/New_York").toISOString(),
    ).toBe("2026-11-02T05:00:00.000Z");
  });

  it("advances to the next local midnight, not the current civil day", () => {
    expect(
      nextLocalMidnight(
        new Date("2026-11-02T18:42:00.000Z"),
        "Europe/Madrid",
      ).toISOString(),
    ).toBe("2026-11-02T23:00:00.000Z");
    expect(
      nextLocalMidnight(
        new Date("2026-03-08T06:30:00.000Z"),
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-03-09T04:00:00.000Z");
    expect(
      nextLocalMidnight(
        new Date("2026-03-08T08:30:00.000Z"),
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-03-09T04:00:00.000Z");
    expect(
      nextLocalMidnight(
        new Date("2026-11-01T06:30:00.000Z"),
        "America/New_York",
      ).toISOString(),
    ).toBe("2026-11-02T05:00:00.000Z");
  });
});

describe("usage pace", () => {
  it("uses the observed monthly cycle and local close of today, not a calendar-day count", () => {
    const start = Date.parse(OBSERVED_CYCLE_START);
    const end = Date.parse(OBSERVED_CYCLE_END);
    const target = Date.parse("2026-11-02T23:00:00.000Z");
    const expectedIdeal = (100 * (target - start)) / (end - start);
    const result = pace({
      now: "2026-11-02T18:42:00.000Z",
      timeZone: "Europe/Madrid",
    });
    expect(result).not.toBeNull();
    expect(result!.targetAt.toISOString()).toBe("2026-11-02T23:00:00.000Z");
    expect(result!.idealPercent).toBeCloseTo(expectedIdeal, 10);
    expect(result!.idealPercent).toBeLessThan(100);
    expect(result!.marginPercent).toBeCloseTo(expectedIdeal - OBSERVED_AUTO, 10);
    expect(result!.usedPercent).toBe(OBSERVED_AUTO);
  });

  it("keeps Cursor Models and Other Models on the same cycle with independent margins", () => {
    const now = "2026-11-02T18:42:00.000Z";
    const auto = pace({
      usedPercent: OBSERVED_AUTO,
      now,
      timeZone: "Europe/Madrid",
    });
    const api = pace({
      usedPercent: OBSERVED_API,
      now,
      timeZone: "Europe/Madrid",
    });
    expect(auto?.targetAt).toEqual(api?.targetAt);
    expect(auto?.idealPercent).toBe(api?.idealPercent);
    expect(auto!.marginPercent).toBeGreaterThan(api!.marginPercent);
    expect(auto!.marginPercent).not.toBe(0);
    expect(api!.marginPercent).not.toBe(0);
  });

  it("does not reach 100% before the real cycle end", () => {
    const beforeLastMidnight = pace({
      now: "2026-11-21T14:00:00.000Z",
      timeZone: "Europe/Madrid",
    });
    expect(beforeLastMidnight!.targetAt.toISOString()).toBe(
      "2026-11-21T23:00:00.000Z",
    );
    expect(beforeLastMidnight!.idealPercent).toBeLessThan(100);

    const afterLastMidnight = pace({
      now: "2026-11-21T23:10:00.000Z",
      timeZone: "Europe/Madrid",
    });
    expect(afterLastMidnight!.targetAt.toISOString()).toBe(OBSERVED_CYCLE_END);
    expect(afterLastMidnight!.idealPercent).toBe(100);
  });

  it("caps the target at cycle end on a weekly mid-afternoon restart", () => {
    const start = "2026-10-21T19:22:24.000Z";
    const end = "2026-10-28T19:22:24.000Z";
    const sameAfternoon = pace({
      usedPercent: 4,
      cycleStartsAt: start,
      cycleEndsAt: end,
      now: "2026-10-21T20:00:00.000Z",
      timeZone: "America/New_York",
    });
    expect(sameAfternoon!.targetAt.toISOString()).toBe(
      "2026-10-22T04:00:00.000Z",
    );
    expect(sameAfternoon!.idealPercent).toBeCloseTo(
      (100 *
        (Date.parse("2026-10-22T04:00:00.000Z") - Date.parse(start))) /
        (Date.parse(end) - Date.parse(start)),
      10,
    );
    expect(sameAfternoon!.idealPercent).toBeLessThan(20);

    const lastHours = pace({
      usedPercent: 88,
      cycleStartsAt: start,
      cycleEndsAt: end,
      now: "2026-10-28T18:00:00.000Z",
      timeZone: "America/New_York",
    });
    expect(lastHours!.targetAt.toISOString()).toBe(end);
    expect(lastHours!.idealPercent).toBe(100);
    expect(lastHours!.marginPercent).toBe(12);
  });

  it("reports positive, negative, and zero margins", () => {
    const now = "2026-11-02T18:42:00.000Z";
    const timeZone = "Europe/Madrid";
    const under = pace({ usedPercent: 10, now, timeZone });
    const over = pace({ usedPercent: 90, now, timeZone });
    const exact = pace({
      usedPercent: under!.idealPercent,
      now,
      timeZone,
    });
    expect(under!.marginPercent).toBeGreaterThan(0);
    expect(over!.marginPercent).toBeLessThan(0);
    expect(exact!.marginPercent).toBe(0);
    expect(formatPaceMargin(under!.marginPercent).startsWith("+")).toBe(true);
    expect(formatPaceMargin(over!.marginPercent).startsWith("-")).toBe(true);
    expect(formatPaceMargin(0)).toBe("0");
    expect(formatPaceCompact(22.77, under!.idealPercent)).toMatch(
      /^\d+ \/ \d+%$/u,
    );
    expect(formatPaceCompact(22.77, 39.6)).toBe("23 / 40%");
    expect(formatPaceCompact(48.2, 39.6)).toBe("48 / 40%");
  });

  it("uses each client's local close of 2 Nov 2026, not the host timezone", () => {
    const now = "2026-11-02T18:42:00.000Z";
    const host = pace({ now, timeZone: "Europe/Berlin" });
    const zones = {
      "America/Mexico_City": {
        targetAt: "2026-11-03T06:00:00.000Z",
        idealPercent: 39.60035842293907,
      },
      "Europe/Madrid": {
        targetAt: "2026-11-02T23:00:00.000Z",
        idealPercent: 38.6594982078853,
      },
      "America/New_York": {
        targetAt: "2026-11-03T05:00:00.000Z",
        idealPercent: 39.46594982078853,
      },
    } as const;
    for (const [timeZone, expected] of Object.entries(zones)) {
      const auto = pace({
        usedPercent: OBSERVED_AUTO,
        now,
        timeZone,
      });
      const api = pace({
        usedPercent: OBSERVED_API,
        now,
        timeZone,
      });
      expect(auto!.targetAt.toISOString()).toBe(expected.targetAt);
      expect(auto!.idealPercent).toBeCloseTo(expected.idealPercent, 8);
      expect(auto!.idealPercent).toBeLessThan(100);
      expect(auto!.marginPercent).toBeCloseTo(
        expected.idealPercent - OBSERVED_AUTO,
        8,
      );
      expect(api!.marginPercent).toBeCloseTo(
        expected.idealPercent - OBSERVED_API,
        8,
      );
      if (timeZone !== "Europe/Madrid") {
        expect(auto!.targetAt.toISOString()).not.toBe(
          host!.targetAt.toISOString(),
        );
      }
    }
    expect(host!.targetAt.toISOString()).toBe("2026-11-02T23:00:00.000Z");
    expect(host!.idealPercent).toBeCloseTo(38.6594982078853, 8);
    expect(
      pace({ now, timeZone: "America/Mexico_City" })!.marginPercent,
    ).toBeCloseTo(16.8346917562724, 8);
    expect(
      pace({
        usedPercent: OBSERVED_API,
        now,
        timeZone: "America/Mexico_City",
      })!.marginPercent,
    ).toBeCloseTo(6.280358422939068, 8);
  });

  it("does not keep the previous cycle after a reset", () => {
    const nextStart = OBSERVED_CYCLE_END;
    const nextEnd = "2026-12-21T23:22:24.000Z";
    const afterReset = pace({
      usedPercent: 2,
      cycleStartsAt: nextStart,
      cycleEndsAt: nextEnd,
      now: "2026-11-22T15:00:00.000Z",
      timeZone: "America/Mexico_City",
    });
    const stalePrevious = pace({
      usedPercent: 2,
      now: "2026-11-22T15:00:00.000Z",
      timeZone: "America/Mexico_City",
    });
    expect(afterReset!.targetAt.toISOString()).not.toBe(OBSERVED_CYCLE_END);
    expect(afterReset!.idealPercent).toBeLessThan(10);
    expect(stalePrevious!.targetAt.toISOString()).toBe(OBSERVED_CYCLE_END);
    expect(stalePrevious!.idealPercent).toBe(100);
  });

  it("returns null when cycle bounds or timezone are missing or invalid", () => {
    const now = "2026-11-02T18:42:00.000Z";
    expect(
      pace({ cycleStartsAt: null, now, timeZone: "Europe/Madrid" }),
    ).toBeNull();
    expect(
      pace({ cycleEndsAt: null, now, timeZone: "Europe/Madrid" }),
    ).toBeNull();
    expect(
      pace({
        cycleStartsAt: "not-a-date",
        now,
        timeZone: "Europe/Madrid",
      }),
    ).toBeNull();
    expect(
      pace({
        cycleStartsAt: OBSERVED_CYCLE_END,
        cycleEndsAt: OBSERVED_CYCLE_START,
        now,
        timeZone: "Europe/Madrid",
      }),
    ).toBeNull();
    expect(pace({ now, timeZone: "Not/AZone" })).toBeNull();
    expect(
      computeUsagePace({
        usedPercent: Number.NaN,
        cycleStartsAt: OBSERVED_CYCLE_START,
        cycleEndsAt: OBSERVED_CYCLE_END,
        now: new Date(now),
        timeZone: "UTC",
      }),
    ).toBeNull();
  });
});
