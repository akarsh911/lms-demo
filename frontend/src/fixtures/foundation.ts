import type {
  RoomAvailability,
  RoomInsight,
  RoomUsageEntry,
  WorkingDays,
  WorkingWeek,
  YearIssue,
  YearSummary,
} from '@/types/foundation';
import { WEEKDAYS } from '@/types/foundation';
import type { Room } from '@/types/school';

import { WORKING_WEEKS } from './data/foundation';
import { CURRENT_SECTIONS, OFFERINGS, ROOMS, SESSIONS } from './data/structure';
import { BELLS, BELL_PERIODS, CALENDAR_DAYS, PERIOD_SCHEMES, SLOTS, TIMETABLE } from './data/timetable';
import { fail, insert, must, remove } from './rows';
import { cloneScheme } from './week';

const NO_DAYS: WorkingDays = { monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false, sunday: false };

const today = (): string => new Date().toLocaleDateString('en-CA');

const clock = (minute: number): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

// --- the working week ------------------------------------------------------------

export const workingWeek = (sessionId: string): WorkingWeek =>
  WORKING_WEEKS.find((w) => w.academic_session_id === sessionId) ?? { academic_session_id: sessionId, days: { ...NO_DAYS } };

export function saveWorkingWeek(sessionId: string, days: WorkingDays): WorkingWeek {
  must(SESSIONS, sessionId, 'academic year');
  const existing = WORKING_WEEKS.find((w) => w.academic_session_id === sessionId);
  if (existing) return Object.assign(existing, { days: { ...days } });
  const made = { academic_session_id: sessionId, days: { ...days } };
  WORKING_WEEKS.push(made);
  return made;
}

// --- a year at a glance --------------------------------------------------------

const schemesOf = (sessionId: string) => PERIOD_SCHEMES.filter((s) => s.academic_session_id === sessionId);

const bellsOf = (sessionId: string) => {
  const schemeIds = new Set(schemesOf(sessionId).map((s) => s.id));
  return BELLS.filter((b) => schemeIds.has(b.period_scheme_id ?? ''));
};

// A holiday is counted once however many dates it spans: a run of closed days sharing a name.
function holidayCount(sessionId: string): number {
  const closed = CALENDAR_DAYS.filter(
    (d) => d.academic_session_id === sessionId && (d.day_type === 'holiday' || d.day_type === 'vacation'),
  ).sort((a, b) => (a.calendar_date ?? '').localeCompare(b.calendar_date ?? ''));
  return closed.filter((day, i) => day.name !== closed[i - 1]?.name || i === 0).length;
}

export function yearSummary(sessionId: string): YearSummary {
  const days = WEEKDAYS.filter((day) => workingWeek(sessionId).days[day]);
  const bells = bellsOf(sessionId);
  const now = today();

  const issues: YearIssue[] = [];
  if (days.length === 0) issues.push({ code: 'no_working_days', message: 'No working days are set.', part: 'working-days' });
  if (bells.length === 0) issues.push({ code: 'no_schedule', message: 'There is no bell schedule.', part: 'bell-schedules' });

  return {
    academic_session_id: sessionId,
    working_days: days,
    holiday_count: holidayCount(sessionId),
    schedule_count: bells.length,
    default_schedule: (bells.find((b) => b.is_default) ?? bells[0])?.name ?? null,
    issues,
  };
}

// Foundation only: the working week and the shape of the day. Never classes, people or a timetable.
// Each piece is copied only if the target year has none of its own, so bringing forward twice changes nothing.
export function copyYearStructure(fromId: string, toId: string): YearSummary {
  const source = must(SESSIONS, fromId, 'academic year');
  const target = must(SESSIONS, toId, 'academic year');
  const shift = Number((target.start_date ?? '').slice(0, 4)) - Number((source.start_date ?? '').slice(0, 4));
  const moved = (date: string): string => `${Number(date.slice(0, 4)) + shift}${date.slice(4)}`;

  if (!WORKING_WEEKS.some((week) => week.academic_session_id === toId)) saveWorkingWeek(toId, workingWeek(fromId).days);
  if (schemesOf(toId).length === 0) {
    for (const scheme of schemesOf(fromId)) {
      const copy = cloneScheme(scheme.id, { name: scheme.name ?? 'School day', code: scheme.code ?? 'DAY' });
      copy.academic_session_id = toId;
    }
  }
  return yearSummary(toId);
}

// --- rooms -----------------------------------------------------------------------

const sectionName = (sectionId: string | undefined): string | null => {
  const section = CURRENT_SECTIONS.find((s) => s.id === sectionId);
  return section ? `${section.edges?.grade_level?.name ?? 'Class'} ${section.name ?? ''}`.trim() : null;
};

const subjectOf = (offeringId: string | undefined): string | undefined =>
  OFFERINGS.find((o) => o.id === offeringId)?.edges?.subject?.name;

const regularBell = BELLS.find((b) => b.is_default);

// One weekday of the published week in this room, with the default bell schedule's times.
function usageOn(roomId: string, isoDay: number): RoomUsageEntry[] {
  return SLOTS.filter((slot) => slot.timetable_id === TIMETABLE.id && slot.room_id === roomId && slot.day_of_week === isoDay)
    .flatMap((slot) => {
      const time = BELL_PERIODS.find((bp) => bp.bell_schedule_id === regularBell?.id && bp.period_id === slot.period_id);
      if (time?.start_minute === undefined || time.end_minute === undefined) return [];
      const what = [sectionName(slot.section_id), slot.label ?? subjectOf(slot.subject_offering_id)].filter(Boolean).join(' · ');
      return [{ id: slot.id, starts: clock(time.start_minute), ends: clock(time.end_minute), title: what }];
    })
    .sort((a, b) => a.starts.localeCompare(b.starts));
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

function roomInsight(room: Room): RoomInsight {
  const home = CURRENT_SECTIONS.find((s) => s.room_id === room.id);
  const isoDay = ((new Date().getDay() + 6) % 7) + 1;
  const next = (isoDay % 7) + 1;
  const todays = usageOn(room.id, isoDay);
  const now = clock(new Date().getHours() * 60 + new Date().getMinutes());
  const blocked = room.status === 'maintenance' || room.status === 'unavailable';

  const availability: RoomAvailability = blocked
    ? (room.status as 'maintenance' | 'unavailable')
    : todays.some((entry) => entry.starts <= now && now < entry.ends)
      ? 'in_use'
      : 'available';

  const issues: RoomInsight['issues'] = [];
  if (home && room.capacity !== undefined && (home.capacity ?? 0) > room.capacity) {
    issues.push({
      code: 'over_capacity',
      message: `${sectionName(home.id)} is planned for ${home.capacity} pupils. This room seats ${room.capacity}.`,
    });
  }
  if (blocked && room.unavailable) {
    issues.push({ code: 'unavailable', message: `${room.unavailable.reason}. ${plural(todays.length, 'lesson')} today need another room.` });
  }

  return {
    room_id: room.id,
    primary_use: home ? sectionName(home.id) : room.room_type === 'classroom' ? null : 'Shared',
    primary_size: home?.capacity ?? null,
    availability,
    today: todays,
    upcoming: usageOn(room.id, next).map((entry) => ({ ...entry, title: `${DAY_NAMES[next - 1]} · ${entry.title}` })),
    issues,
  };
}

export const roomInsights = (): RoomInsight[] => ROOMS.map(roomInsight);

export const roomInsightOf = (roomId: string): RoomInsight => roomInsight(must(ROOMS, roomId, 'room'));
