import { WEEKDAYS, type Weekday } from '@/types/foundation';

export const WEEKDAY_LABEL: Readonly<Record<Weekday, string>> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

// "Monday to Saturday" for an unbroken run, the days by name otherwise.
export function workingDaysLine(days: readonly Weekday[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (!first || !last) return 'No working days';
  const unbroken = WEEKDAYS.indexOf(last) - WEEKDAYS.indexOf(first) === days.length - 1;
  return unbroken && days.length > 2 ? `${WEEKDAY_LABEL[first]} to ${WEEKDAY_LABEL[last]}` : days.map((day) => WEEKDAY_LABEL[day]).join(', ');
}

// The weekday of a `YYYY-MM-DD` date, read as a plain calendar date rather than an instant.
export function weekdayOf(date: string): Weekday {
  const day = new Date(`${date.slice(0, 10)}T00:00:00`).getDay();
  return WEEKDAYS[(day + 6) % 7] ?? 'monday';
}
