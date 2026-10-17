/**
 * Dates as a person reads them.
 *
 * Pure, so anything can use it: an ISO date is what services speak, and it is
 * never what a student or a teacher should be shown. The browser's own locale
 * decides the wording, so a school in Kochi and one in Manchester each get
 * their own.
 */

/** `2026-09-12` -> `Saturday, 12 September`. Falls back to the input if unparseable. */
export function formatLongDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** `2026-09-12` -> `Sat 12 Sep`, for a tight space. */
export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * "12 minutes ago" — what a list called "recent" is actually asking. Falls
 * back to a date once relative time stops being meaningful.
 */
export function formatRelativeTime(isoTimestamp: string, now = Date.now()): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return isoTimestamp;
  const minutes = Math.round((now - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

// One fixed locale, so the server and the browser can never disagree about a date.
export function formatDay(iso: string | undefined): string {
  if (!iso) return 'Not set';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const dayRange = (from: string | undefined, to: string | undefined): string => `${formatDay(from)} to ${formatDay(to)}`;

// `YYYY-MM-DD` for a date input, from whatever the wire sent.
export const dateInput = (iso: string | undefined): string => (iso ?? '').slice(0, 10);

// Minutes past midnight as a 24-hour clock time, and back.
export const clockOf = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export function minutesOf(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < 24 * 60 ? minutes : null;
}

// `Tue 7 Oct, 08:00`, in one fixed locale.
export function formatMoment(iso: string | null | undefined): string {
  if (!iso) return 'Not set';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
