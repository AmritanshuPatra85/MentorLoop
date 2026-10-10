type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number };

function partsAt(instant: Date, timezone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day), hour: Number(value.hour), minute: Number(value.minute) };
}

export function isTimeZone(timezone: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); return true; } catch { return false; }
}

export function localDateKey(instant: Date, timezone: string): string {
  const p = partsAt(instant, timezone);
  return `${p.year.toString().padStart(4, "0")}-${p.month.toString().padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
}

/** Resolves a local wall time to the earliest matching instant; nonexistent DST times return null. */
export function localDateTimeToInstant(dateKey: string, wallTime: string, timezone: string): Date | null {
  if (!isTimeZone(timezone)) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = wallTime.split(":").map(Number);
  const target = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, -6, -1, 0, 1, 6, 12, 24, 36]) {
    const sample = target + hours * 3_600_000;
    const p = partsAt(new Date(sample), timezone);
    offsets.add(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - sample);
  }
  const matches = [...offsets].map((offset) => new Date(target - offset))
    .filter((candidate) => {
      const p = partsAt(candidate, timezone);
      return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;
    })
    .sort((a, b) => a.getTime() - b.getTime());
  return matches[0] ?? null;
}

export function weekdayForDateKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

export function nextDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
