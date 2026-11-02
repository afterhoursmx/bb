export type UsagePaceInput = {
  usedPercent: number;
  cycleStartsAt: string | null | undefined;
  cycleEndsAt: string | null | undefined;
  now: Date | number;
  timeZone: string;
};

export type UsagePace = {
  targetAt: Date;
  idealPercent: number;
  usedPercent: number;
  marginPercent: number;
};

function parseInstant(value: string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function partNumber(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  return Number(parts.find((part) => part.type === type)?.value);
}

function zonedParts(instant: Date, timeZone: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
}

function zonedOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(
    partNumber(parts, "year"),
    partNumber(parts, "month") - 1,
    partNumber(parts, "day"),
    partNumber(parts, "hour"),
    partNumber(parts, "minute"),
    partNumber(parts, "second"),
  );
  return asUtc - instant.getTime();
}

export function resolveTimeZone(timeZone?: string): string {
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
      return timeZone;
    } catch {
      return "UTC";
    }
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = new Date(utcGuess - zonedOffsetMs(new Date(utcGuess), timeZone));
  const offset = zonedOffsetMs(first, timeZone);
  const corrected = new Date(utcGuess - offset);
  const confirmed = zonedOffsetMs(corrected, timeZone);
  return confirmed === offset ? corrected : new Date(utcGuess - confirmed);
}

export function nextLocalMidnight(now: Date, timeZone: string): Date {
  const parts = zonedParts(now, timeZone);
  const next = new Date(
    Date.UTC(
      partNumber(parts, "year"),
      partNumber(parts, "month") - 1,
      partNumber(parts, "day") + 1,
    ),
  );
  return zonedDateTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
    timeZone,
  );
}

export function computeUsagePace(input: UsagePaceInput): UsagePace | null {
  const cycleStart = parseInstant(input.cycleStartsAt);
  const cycleEnd = parseInstant(input.cycleEndsAt);
  if (cycleStart == null || cycleEnd == null) return null;
  const startMs = cycleStart.getTime();
  const endMs = cycleEnd.getTime();
  if (!(endMs > startMs)) return null;
  if (!Number.isFinite(input.usedPercent)) return null;
  const now =
    input.now instanceof Date ? input.now : new Date(input.now);
  if (!Number.isFinite(now.getTime())) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone });
  } catch {
    return null;
  }
  const targetMs = Math.min(
    nextLocalMidnight(now, input.timeZone).getTime(),
    endMs,
  );
  const idealPercent = Math.min(
    100,
    Math.max(0, (100 * (targetMs - startMs)) / (endMs - startMs)),
  );
  return {
    targetAt: new Date(targetMs),
    idealPercent,
    usedPercent: input.usedPercent,
    marginPercent: idealPercent - input.usedPercent,
  };
}

export function formatPaceCompact(
  usedPercent: number,
  idealPercent: number,
): string {
  return `${Math.round(usedPercent)} / ${Math.round(idealPercent)}%`;
}

export function formatPaceMargin(marginPercent: number): string {
  const rounded = Math.round(marginPercent);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded)}`;
}

export function describePaceMargin(marginPercent: number): string {
  const label = formatPaceMargin(marginPercent);
  if (label === "0") return "on today's pace";
  if (label.startsWith("+"))
    return `${label} remaining to stay on pace through today`;
  return `${label} over today's pace`;
}
