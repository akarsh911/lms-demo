import { formatDay } from '@/lib/dates';
import { fixPath } from '@/lib/school/structure';
import { workingDaysLine } from '@/lib/school/working-week';
import type {
  OverviewAttention,
  SchoolOverview,
  SchoolProfile,
  SchoolProfileWrite,
  SchoolSetup,
  SetupItem,
} from '@/types/foundation';
import type { Room } from '@/types/school';

import { AGENDA, SCHOOL_PROFILE, TODAY_COUNTS } from './data/foundation';
import { STAFF, TEACHERS } from './data/people';
import { ROOMS, SESSIONS, SUBJECTS } from './data/structure';
import { TIMETABLE, TIMETABLES } from './data/timetable';
import { roomInsights, yearSummary } from './foundation';
import { seedId } from './ids';
import { fail } from './rows';
import { lifecycleOf, pendingTasks, yearRegister } from './year-register';
import { yearTeaching } from './year-teaching';

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

// Whichever year the school is running in now. Read each time, because activating a year changes it.
const activeYear = () => SESSIONS.find((year) => year.is_current);

// --- the setup checklist -----------------------------------------------------------

export function schoolSetup(): SchoolSetup {
  const year = activeYear();
  const register = year ? yearRegister(year.id) : null;
  const calendar = year ? yearSummary(year.id) : null;
  const liveRooms = ROOMS.filter((r) => r.status !== 'archived');
  const labs = liveRooms.filter((r) => r.room_type === 'laboratory').length;
  const tight = roomInsights().filter((r) => r.issues.some((i) => i.code === 'over_capacity')).length;
  const published = TIMETABLES.some((t) => t.status === 'published' && t.academic_session_id === year?.id);
  const noTeacher = register ? register.sections - register.sections_with_class_teacher : 0;
  const teaching = year ? yearTeaching(year.id) : null;
  const untaught = teaching ? teaching.assignments.total - teaching.assignments.value : 0;

  const item = (
    key: string, title: string, explanation: string, done: boolean, detail: string, route: string | null, attention = false, id?: string,
  ): SetupItem => ({ key, title, explanation, detail, route, id, status: attention ? 'attention' : done ? 'complete' : 'not_started' });

  const items: SetupItem[] = [
    item('profile', 'School profile', 'The name and contact details people see.', SCHOOL_PROFILE.name !== '', SCHOOL_PROFILE.name, 'school-profile'),
    // An active year is not a finished one: it carries its own open work for as long as it runs.
    item(
      'year', year ? `Academic year ${year.name}` : 'Academic year', 'The session everything else is filed under.', Boolean(year),
      register ? `Active · ${register.areas_ready} of ${register.areas_total} areas ready · ${plural(register.pending_items, 'pending item')}` : 'No year is active',
      'school-years', Boolean(register && register.pending_items > 0), year?.id,
    ),
    item(
      'day', 'Working days and bell schedule', 'Which days school runs, and how each day is divided.',
      Boolean(calendar && calendar.working_days.length > 0 && calendar.schedule_count > 0),
      calendar && calendar.schedule_count > 0 ? `${workingDaysLine(calendar.working_days)} · ${calendar.default_schedule} schedule` : 'No bell schedule yet',
      'school-years', !calendar || calendar.working_days.length === 0 || calendar.schedule_count === 0, year?.id,
    ),
    item(
      'rooms', 'Rooms and spaces', 'Classrooms, labs and shared spaces.', liveRooms.length > 0,
      tight > 0 ? `${plural(tight, 'class', 'classes')} ${tight === 1 ? 'does' : 'do'} not fit ${tight === 1 ? 'its' : 'their'} room` : `${plural(liveRooms.length, 'room')} · ${plural(labs, 'lab')}`,
      'school-rooms', tight > 0,
    ),
    item(
      'classes', 'Classes and sections', 'Every class a pupil can be placed in.', Boolean(register && register.sections > 0),
      noTeacher > 0 ? `${plural(register?.sections ?? 0, 'section')} · ${noTeacher} without a class teacher` : plural(register?.sections ?? 0, 'section'),
      'sections', noTeacher > 0,
    ),
    item('subjects', 'Subjects', 'What the school teaches.', SUBJECTS.length > 0, plural(SUBJECTS.length, 'subject'), 'school-offerings'),
    item('staff', 'Teachers and staff', 'Everyone who works at the school.', STAFF.length > 0, `${plural(TEACHERS.length, 'teacher')} · ${STAFF.length} staff in all`, 'people-teachers'),
    item(
      'students', 'Students', 'Every pupil on this year’s roll.', Boolean(register && register.active > 0),
      register && register.unassigned > 0 ? `${plural(register.active, 'student')} · ${register.unassigned} without a section` : plural(register?.active ?? 0, 'student'),
      'people-students', Boolean(register && register.unassigned > 0),
    ),
    item(
      'teaching', 'Teaching assignments', 'Who teaches each subject to each class.', Boolean(teaching && teaching.assignments.total > 0),
      teaching && untaught > 0 ? `${plural(untaught, 'subject')} without a teacher` : `${plural(teaching?.assignments.total ?? 0, 'subject')} assigned`,
      'school-offerings', untaught > 0,
    ),
    item('timetable', 'Timetable', 'The published week for every class.', published, published ? `${TIMETABLE.name} is published` : 'Not published', 'school-timetable'),
    item('access', 'Student access', 'Sign-ins for pupils and parents.', false, 'Available later', null),
  ];

  return { items, complete: items.filter((i) => i.status === 'complete').length, total: items.length };
}

export const schoolProfile = (): SchoolProfile => ({ ...SCHOOL_PROFILE, current_year: activeYear()?.name ?? null });

export function updateSchoolProfile(body: SchoolProfileWrite): SchoolProfile {
  if (body.name.trim() === '') fail(422, 'validation_failed', 'The school needs a name.');
  Object.assign(SCHOOL_PROFILE, { ...body, name: body.name.trim(), short_name: body.short_name.trim() });
  return schoolProfile();
}

// --- the overview ------------------------------------------------------------------

export function schoolOverview(): SchoolOverview {
  const year = activeYear();
  const register = year ? yearRegister(year.id) : null;
  const insights = roomInsights();
  const roomOf = (id: string): Room | undefined => ROOMS.find((r) => r.id === id);

  // The year's own pending work, projected: the same tasks the year page lists, pointing at the same tabs.
  const yearWork: OverviewAttention[] = (year ? pendingTasks(year.id) : []).map((task) => ({
    id: task.id,
    kind: task.scope === 'student' ? 'attendance' : task.scope === 'teacher' ? 'staff' : task.scope === 'year' ? 'timetable' : 'room',
    title: task.title,
    detail: task.detail,
    action: 'Open',
    link: task.target
      ? (() => {
          // A class or section gap opens where it is fixed, under the sidebar's Classes & Sections for the current year.
          const { tail, query } = fixPath(task.target);
          return { route: 'sections', id: tail, ...query };
        })()
      : { route: 'school-years', id: year?.id, tab: task.tab, view: task.view },
  }));

  const blocked: OverviewAttention[] = ROOMS.filter((r) => r.status === 'maintenance' && r.unavailable).map((room) => ({
    id: seedId('attention', 'room', room.id),
    kind: 'room',
    title: `${room.name} is under maintenance`,
    detail: `${room.unavailable?.reason}${room.unavailable?.until ? ` · until ${formatDay(room.unavailable.until)}` : ''}`,
    action: 'Open',
    link: { route: 'school-rooms', id: room.id },
  }));

  const tight: OverviewAttention[] = insights.filter((i) => i.issues.some((x) => x.code === 'over_capacity')).map((insight) => ({
    id: seedId('attention', 'capacity', insight.room_id),
    kind: 'room',
    title: `${roomOf(insight.room_id)?.name} is too small for ${insight.primary_use}`,
    detail: `${insight.primary_size} pupils · ${roomOf(insight.room_id)?.capacity} seats`,
    action: 'Resolve',
    link: { route: 'school-rooms', id: insight.room_id },
  }));

  const drafts: OverviewAttention[] = SESSIONS.filter((s) => lifecycleOf(s) === 'draft').map((session) => {
    const draft = yearRegister(session.id);
    return {
      id: seedId('attention', 'year', session.id),
      kind: 'setup',
      title: `${session.name} is being set up`,
      detail: `${draft.areas_ready} of ${draft.areas_total} areas ready`,
      action: 'Continue',
      link: { route: 'school-years', id: session.id, setup: true },
    };
  });

  const cover: OverviewAttention[] = TODAY_COUNTS.staff_absent > 0
    ? [{
        id: seedId('attention', 'cover'),
        kind: 'staff',
        title: `${plural(TODAY_COUNTS.staff_absent, 'teacher')} absent today`,
        detail: `${plural(TODAY_COUNTS.lessons_uncovered, 'lesson')} need cover`,
        action: 'Arrange cover',
        link: null,
      }]
    : [];

  const pending = TODAY_COUNTS.sections_pending;
  const enrolled = register?.active ?? 0;
  const sections = register?.sections ?? 0;
  return {
    academic_year: year?.name ?? null,
    primary: pending > 0
      ? {
          id: seedId('attention', 'attendance'),
          kind: 'attendance',
          title: `${plural(pending, 'class', 'classes')} ${pending === 1 ? 'has' : 'have'} not submitted attendance today`,
          detail: 'Registers are due by the end of the first period.',
          action: 'Review',
          link: { route: 'attendance' },
        }
      : null,
    summary: {
      students: { value: enrolled - TODAY_COUNTS.students_absent, total: enrolled },
      staff: { value: STAFF.length - TODAY_COUNTS.staff_absent, total: STAFF.length },
      attendance: { value: sections - pending, total: sections },
      events_today: AGENDA.length,
    },
    needs: [...yearWork, ...blocked, ...tight, ...cover, ...drafts],
    agenda: AGENDA,
  };
}
