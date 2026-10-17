import type { CalendarDay } from '@/types/school';

export interface Holiday {
  key: string;
  name: string;
  from: string;
  to: string;
  notes: string;
  days: CalendarDay[];
}

const dateOf = (day: CalendarDay): string => (day.calendar_date ?? '').slice(0, 10);

const nextDay = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

// The school records one row per closed date. A person thinks of "Diwali break", so consecutive dates sharing a name are one holiday.
export function groupHolidays(days: readonly CalendarDay[]): Holiday[] {
  const closed = days
    .filter((day) => day.day_type === 'holiday' || day.day_type === 'vacation')
    .sort((a, b) => dateOf(a).localeCompare(dateOf(b)));

  const out: Holiday[] = [];
  for (const day of closed) {
    const last = out[out.length - 1];
    const name = day.name ?? 'Holiday';
    if (last && last.name === name && nextDay(last.to) === dateOf(day)) {
      last.to = dateOf(day);
      last.days.push(day);
    } else {
      out.push({ key: day.id, name, from: dateOf(day), to: dateOf(day), notes: day.notes ?? '', days: [day] });
    }
  }
  return out;
}

// Every date from `from` to `to`, inclusive.
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let date = from; date <= to && out.length < 400; date = nextDay(date)) out.push(date);
  return out;
}
