// Timezone-aware conversions without extra dependencies. Windows are stored
// as UTC instants plus the location's IANA zone; forms use the zone's local
// wall-clock time ("YYYY-MM-DDTHH:mm", the datetime-local format).

export const US_TIMEZONES = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona" },
  { id: "America/Los_Angeles", label: "Pacific" },
  { id: "America/Anchorage", label: "Alaska" },
  { id: "Pacific/Honolulu", label: "Hawaii" },
] as const;

function offsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// "2026-11-03T08:00" in America/Chicago → the UTC instant.
export function zonedLocalToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`Invalid local datetime: ${local}`);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wall - offsetMs(wall, tz);
  // Re-check once in case the guess crossed a DST boundary.
  guess = wall - offsetMs(guess, tz);
  return new Date(guess);
}

export function utcToZonedLocal(d: Date, tz: string): string {
  const shifted = new Date(d.getTime() + offsetMs(d.getTime(), tz));
  return shifted.toISOString().slice(0, 16);
}

export function formatInZone(d: Date | null | undefined, tz: string, opts: { withZone?: boolean } = {}): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: opts.withZone === false ? undefined : "short",
  }).format(d);
}

export function formatWindow(
  start: Date | null | undefined,
  end: Date | null | undefined,
  tz: string,
): string {
  if (!start) return "Not set";
  if (!end) return formatInZone(start, tz);
  const sameDay = utcToZonedLocal(start, tz).slice(0, 10) === utcToZonedLocal(end, tz).slice(0, 10);
  const endText = sameDay
    ? new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(end)
    : formatInZone(end, tz);
  return `${formatInZone(start, tz, { withZone: false })} – ${endText}`;
}

export function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents % 100 ? 2 : 0 }).format(
    cents / 100,
  );
}
