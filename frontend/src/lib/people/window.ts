export function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DateWindow {
  from: string;
  to: string;
}

export function trailingWindow(days: number, now: Date = new Date()): DateWindow {
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  return { from: isoDay(start), to: isoDay(now) };
}

export function forwardWindow(days: number, now: Date = new Date()): DateWindow {
  const end = new Date(now);
  end.setDate(end.getDate() + (days - 1));
  return { from: isoDay(now), to: isoDay(end) };
}

export function formatMinuteOfDay(minute: number | undefined): string | null {
  if (typeof minute !== 'number' || !Number.isFinite(minute)) return null;
  const at = new Date();
  at.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatTimestamp(iso: string | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(iso: string | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}
