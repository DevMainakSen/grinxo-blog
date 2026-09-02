export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Offset (ms) a UTC instant is behind/ahead of `timeZone`, by reading the
 * timezone's wall-clock and diffing it against the source UTC instant.
 */
function zonedOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcMs));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - utcMs;
}

/**
 * Convert a wall-clock date/time given in `timeZone` into a UTC ISO string.
 * E.g. `(2026-09-02, "14:30", "Asia/Kolkata")` -> a UTC instant that reads
 * 14:30 in Kolkata, independent of the user's local clock.
 */
export function zonedTimeToUtc(
  dateValue: string, // yyyy-mm-dd
  timeValue: string, // HH:mm (24h)
  timeZone: string
): string {
  const [y, m, d] = dateValue.split('-').map(Number);
  const [hh, mm] = timeValue.split(':').map(Number);
  const desiredAsUtc = Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  // Start by pretending the wall clock is already UTC, then correct using the
  // zone offset — measured as the wall-clock (read as UTC) minus the current
  // guess. Converges once the wall-clock at `guess` matches what we want.
  let guess = desiredAsUtc;
  for (let i = 0; i < 8; i++) {
    const wallAsUtc = desiredAsUtc - zonedOffsetMs(guess, timeZone);
    if (wallAsUtc === guess) break;
    guess = wallAsUtc;
  }
  return new Date(guess).toISOString();
}

/**
 * Render an ISO instant as a wall-clock date+time string in `timeZone`.
 * Returns `{ date, time }` where date is yyyy-mm-dd and time is HH:mm.
 */
export function utcToZonedParts(
  isoString: string,
  timeZone: string
): { date: string; time: string } {
  const ms = Date.parse(isoString);
  if (Number.isNaN(ms)) return { date: '', time: '' };
  const part = (type: string, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone, ...opts })
      .formatToParts(new Date(ms))
      .find((p) => p.type === type)?.value ?? '';
  const year = part('year', { year: 'numeric' });
  const pad = (v: string) => (v.length === 1 ? `0${v}` : v);
  const month = pad(part('month', { month: 'numeric' }));
  const day = pad(part('day', { day: 'numeric' }));
  const hour = pad(part('hour', { hour: 'numeric', hourCycle: 'h23' }));
  const minute = pad(part('minute', { minute: 'numeric' }));
  return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
}

/** Human-friendly "Schedules for 02 Sep 2026, 8:30 pm IST" string. */
export function formatScheduledAt(
  isoString: string,
  timeZone: string,
  zoneLabel?: string
): string {
  const parts = utcToZonedParts(isoString, timeZone);
  if (!parts.date || !parts.time) return '';
  const [y, m, d] = parts.date.split('-').map(Number);
  const [hh, mm] = parts.time.split(':').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
  const h = date.getHours();
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'am' : 'pm';
  const label = zoneLabel ? ` ${zoneLabel}` : '';
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${hour12}:${String(mm).padStart(2, '0')} ${ampm}${label}`;
}

/** Date value (yyyy-mm-dd) for use in <input type="date">. */
export function toDateInputValue(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const tz = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tz).toISOString().slice(0, 10);
}