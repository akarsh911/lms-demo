import type {
  EnrollmentStatus,
  NextYearDisposition,
  PendingTask,
  SetupAreaKey,
  SetupAreaState,
  YearClassRow,
  YearEnrollment,
  YearLifecycle,
  YearRegister,
  YearSetupArea,
  YearTransition,
  DocumentState,
} from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';
import { seesSection } from '@/lib/reach/reach';

import { ENROLLMENTS, NEXT_ENROLLMENTS, PAST_ENROLLMENTS, type EnrollmentRecord } from './data/enrollment';
import { STUDENTS } from './data/people';
import { CURRENT_SESSION, GRADE_LEVELS, NEXT_SESSION, OFFERINGS, PAST_SESSION, ROOMS, SECTIONS, SESSIONS } from './data/structure';
import { TIMETABLES, teacherAssignmentsOf } from './data/timetable';
import { copyYearStructure, roomInsights, yearSummary } from './foundation';
import { yearStructure } from './year-structure';
import { seedId } from './ids';
import { reachNow } from './reach';
import { fail, insert, must } from './rows';

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

export const lifecycleOf = (year: AcademicSession): YearLifecycle =>
  year.is_current ? 'active' : year.status === 'closed' ? 'closed' : 'draft';

// The one collection per year. Admissions, withdrawals, the unassigned and the roll are all filters over it.
export const rowsOf = (yearId: string): EnrollmentRecord[] =>
  yearId === CURRENT_SESSION.id ? ENROLLMENTS : yearId === PAST_SESSION.id ? PAST_ENROLLMENTS : yearId === NEXT_SESSION.id ? NEXT_ENROLLMENTS : [];

const FINAL_GRADE = GRADE_LEVELS[GRADE_LEVELS.length - 1]?.id;
const sectionsOf = (yearId: string) => SECTIONS.filter((section) => section.academic_session_id === yearId);
const className = (gradeId: string | undefined): string => GRADE_LEVELS.find((grade) => grade.id === gradeId)?.name ?? 'Class';

function statusOf(row: EnrollmentRecord, closed: boolean): EnrollmentStatus {
  if (row.status === 'withdrawn') return 'withdrawn';
  if (!closed) return row.entry;
  // A closed year is read by how it ended, not by how each pupil came into it.
  if (row.promotion_status === 'retained') return 'retained';
  return row.grade_level_id === FINAL_GRADE ? 'graduated' : 'promoted';
}

// What the caller may list: the whole year for the office, the pupils of their own sections for a teacher.
export function visibleEnrollments(yearId: string): YearEnrollment[] {
  const reach = reachNow();
  return yearEnrollments(yearId).filter((row) => seesSection(reach, row.section_id));
}

export function yearEnrollments(yearId: string): YearEnrollment[] {
  const closed = lifecycleOf(must(SESSIONS, yearId, 'academic year')) === 'closed';
  const students = new Map(STUDENTS.map((student) => [student.id, student]));
  const sections = new Map(SECTIONS.map((section) => [section.id, section]));
  const grades = new Map(GRADE_LEVELS.map((grade) => [grade.id, grade]));

  return rowsOf(yearId).map((row) => {
    const student = students.get(row.student_id ?? '');
    const section = sections.get(row.section_id ?? '');
    const grade = grades.get(row.grade_level_id);
    const left = row.status === 'withdrawn';
    const documents = row.documents ?? [];
    return {
      id: row.id,
      student_id: row.student_id ?? '',
      name: student?.edges?.person?.display_name ?? 'Name not recorded',
      admission_number: student?.admission_number ?? '',
      grade_level_id: row.grade_level_id,
      class_name: grade?.name ?? 'Class',
      class_order: grade?.sequence ?? 0,
      section_id: section?.id ?? null,
      section_name: section?.name ?? null,
      roll_number: row.roll_number ?? null,
      status: statusOf(row, closed),
      joined: row.enrollment_date ?? '',
      left: left ? (row.exit_date ?? null) : null,
      leaving_reason: row.leaving_reason ?? null,
      destination: row.destination ?? null,
      documents,
      next_year: row.next_year ?? null,
      moves: (row.history ?? []).map((move) => ({
        date: move.date,
        from: `${className(row.grade_level_id).replace('Class ', '')}${SECTIONS.find((s) => s.id === move.from_section_id)?.name ?? ''}`,
        to: `${className(row.grade_level_id).replace('Class ', '')}${SECTIONS.find((s) => s.id === move.to_section_id)?.name ?? ''}`,
        reason: move.reason,
      })),
      pending: [
        ...(!left && !section ? ['Placement required'] : []),
        ...documents.filter((document) => document.state === 'pending').map((document) => `${document.label} pending`),
      ],
    };
  });
}

// --- the twelve areas of a year ---------------------------------------------------

const TITLES: Readonly<Record<SetupAreaKey, string>> = {
  basic: 'Basic Setup',
  structure: 'Bring Forward School Structure',
  classes: 'Classes & Sections',
  students: 'Students & Promotion',
  admissions: 'New Admissions',
  teachers: 'Teachers & Assignments',
  rooms: 'Rooms',
  subjects: 'Subjects',
  learning: 'Learning Setup',
  access: 'Access Setup',
  timetable: 'Timetable Readiness',
  review: 'Review & Activate',
};

// Areas whose detailed workspace belongs to a module that is not part of the year yet.
const MODULE: Readonly<Partial<Record<SetupAreaKey, string>>> = {
  classes: 'Classes',
  students: 'Students',
  admissions: 'Students',
  teachers: 'Teachers',
  subjects: 'Subjects',
  learning: 'Learning Library',
  access: 'Access',
  timetable: 'Timetable',
};

const ROUTE: Readonly<Partial<Record<SetupAreaKey, string>>> = {
  classes: 'sections',
  admissions: 'people-students',
  teachers: 'school-offerings',
  rooms: 'school-rooms',
  subjects: 'school-offerings',
  timetable: 'school-timetable',
};

// Activation needs these three; the rest can be finished while the year runs.
const REQUIRED: readonly SetupAreaKey[] = ['basic', 'classes', 'students'];

function area(key: SetupAreaKey, state: SetupAreaState, summary: string, extra: Partial<YearSetupArea> = {}): YearSetupArea {
  return { key, title: TITLES[key], state, summary, issues: 0, blocked_by: null, module: MODULE[key] ?? null, route: ROUTE[key] ?? null, facts: [], ...extra };
}

interface TeachingGaps {
  offered: number;
  assigned: number;
  untaught: string[];
}

function teachingGaps(yearId: string): TeachingGaps {
  const offerings = OFFERINGS.filter((offering) => offering.academic_session_id === yearId);
  const taught = new Set(teacherAssignmentsOf(yearId).map((a) => a.subject_offering_id));
  const sections = new Map(SECTIONS.map((section) => [section.id, section]));
  const untaught = offerings
    .filter((offering) => !taught.has(offering.id))
    .map((offering) => {
      const section = sections.get(offering.section_id ?? '');
      return `${offering.edges?.subject?.name ?? 'Subject'}, ${className(section?.grade_level_id)} ${section?.name ?? ''}`.trim();
    });
  return { offered: offerings.length, assigned: offerings.length - untaught.length, untaught };
}

export function setupAreas(yearId: string): YearSetupArea[] {
  const year = must(SESSIONS, yearId, 'academic year');
  const life = lifecycleOf(year);
  const calendar = yearSummary(yearId);
  const sections = sectionsOf(yearId);
  const noRoom = sections.filter((section) => !section.room_id);
  const noTeacher = sections.filter((section) => !section.class_teacher_id);
  const rooms = ROOMS.filter((room) => room.status !== 'archived').length;
  const teaching = teachingGaps(yearId);
  const published = TIMETABLES.some((t) => t.status === 'published' && t.academic_session_id === yearId);
  const label = (rows: readonly { grade_level_id?: string; name?: string }[]): string[] =>
    rows.map((section) => `${className(section.grade_level_id)} ${section.name ?? ''}`.trim());

  if (life === 'closed') {
    const rows = rowsOf(yearId);
    return (Object.keys(TITLES) as SetupAreaKey[]).map((key) =>
      area(key, 'ready', key === 'students' ? `${plural(rows.length, 'enrolment')} on record` : 'Closed with the year'),
    );
  }

  const basic = area(
    'basic',
    calendar.issues.length === 0 ? 'ready' : 'in_progress',
    calendar.issues.length === 0 ? 'Dates, working days and a bell schedule are set' : `Dates are set · ${plural(calendar.issues.length, 'part')} of the week and day still to do`,
    { issues: calendar.issues.length, facts: calendar.issues.map((issue) => issue.message) },
  );

  const source = year.previous_session_id ? sectionsOf(year.previous_session_id) : [];
  const from = SESSIONS.find((other) => other.id === year.previous_session_id);
  const structure = area(
    'structure',
    sections.length > 0 ? 'ready' : 'not_started',
    sections.length > 0 ? (from ? `Started from ${from.name}` : 'The structure is in place') : 'Nothing has been brought forward yet',
  );

  let areas: YearSetupArea[];

  if (life === 'active') {
    const rows = yearEnrollments(yearId);
    const active = rows.filter((row) => row.status !== 'withdrawn');
    const unassigned = active.filter((row) => !row.section_id).length;
    const admitted = active.filter((row) => row.status === 'new_admission').length;
    const left = rows.length - active.length;
    const owed = rows.filter((row) => row.documents.some((document) => document.state === 'pending')).length;

    areas = [
      basic,
      structure,
      area('classes', noTeacher.length > 0 ? 'attention' : 'ready', noTeacher.length > 0 ? `${plural(sections.length, 'section')} · ${plural(noTeacher.length, 'class', 'classes')} without a class teacher` : `${plural(sections.length, 'section')} running`, {
        issues: noTeacher.length,
        facts: label(noTeacher).map((name) => `${name} has no class teacher`),
      }),
      area('students', unassigned > 0 ? 'attention' : 'ready', unassigned > 0 ? `${plural(active.length, 'student')} enrolled · ${unassigned} need a section` : `${plural(active.length, 'student')} enrolled`, { issues: unassigned }),
      area('admissions', owed > 0 ? 'attention' : 'ready', `${plural(admitted, 'new admission')} · ${plural(left, 'withdrawal')}${owed > 0 ? ` · ${owed} with documents pending` : ''}`, { issues: owed }),
      area('teachers', teaching.untaught.length > 0 ? 'attention' : 'ready', teaching.untaught.length > 0 ? `${plural(teaching.untaught.length, 'subject')} with no teacher assigned` : `${plural(teaching.assigned, 'teaching assignment')} made`, {
        issues: teaching.untaught.length,
        facts: teaching.untaught,
      }),
      area('rooms', noRoom.length > 0 ? 'attention' : 'ready', `${plural(rooms, 'space')} available · ${sections.length - noRoom.length} of ${sections.length} sections have a room`, {
        issues: noRoom.length,
        facts: label(noRoom).map((name) => `${name} has no room`),
      }),
      area('subjects', teaching.offered > 0 ? 'ready' : 'not_started', teaching.offered > 0 ? `${plural(teaching.offered, 'subject')} offered across ${plural(sections.length, 'section')}` : 'No subjects are offered yet'),
      area('learning', 'not_started', 'Set up with the Learning Library'),
      area('access', 'not_started', 'Set up with Access'),
      area('timetable', published ? 'ready' : 'blocked', published ? 'A week is published' : 'No week is published', { blocked_by: published ? null : TITLES.teachers }),
    ];
  } else {
    // A draft year reads last year's plans: who is expected to move up into it.
    const before = year.previous_session_id ? rowsOf(year.previous_session_id).filter((row) => row.status === 'active') : [];
    const undecided = before.filter((row) => row.next_year === 'undecided').length;
    const classesReady = source.length > 0 && sections.length >= source.length;

    areas = [
      basic,
      structure,
      area('classes', sections.length === 0 ? 'not_started' : classesReady ? 'ready' : 'in_progress', source.length > 0 ? `${sections.length} of ${source.length} sections created` : plural(sections.length, 'section'), {
        facts: classesReady ? [] : ['Bring the structure forward to create the rest, or add sections class by class below.'],
      }),
      area('students', before.length === 0 ? 'not_started' : undecided > 0 ? 'attention' : 'ready', before.length === 0 ? 'No students to promote yet' : `${plural(before.length - undecided, 'promotion decision')} made · ${undecided} still needed`, { issues: undecided }),
      area('admissions', 'not_started', 'No admissions recorded for this year yet'),
      area('teachers', teaching.offered === 0 ? 'not_started' : teaching.untaught.length > 0 ? 'in_progress' : 'ready', teaching.offered === 0 ? 'No teaching assignments yet' : `${teaching.assigned} of ${teaching.offered} assignments made`),
      area('rooms', sections.length === 0 ? 'not_started' : noRoom.length > 0 ? 'in_progress' : 'ready', `${plural(rooms, 'space')} available · ${plural(noRoom.length, 'section')} without a room`, { issues: noRoom.length }),
      area('subjects', teaching.offered > 0 ? 'ready' : 'not_started', teaching.offered > 0 ? `${plural(teaching.offered, 'subject')} offered` : 'No subjects are offered to a class yet'),
      area('learning', 'not_started', 'Set up with the Learning Library'),
      area('access', 'not_started', 'Set up with Access'),
      area('timetable', 'blocked', 'Waiting for teacher assignments', { blocked_by: TITLES.teachers }),
    ];
  }

  const open = areas.filter((a) => a.state !== 'ready');
  const blockers = areas.filter((a) => REQUIRED.includes(a.key) && a.state !== 'ready').map((a) => a.title);
  const review =
    life === 'active'
      ? area('review', 'ready', 'This year is active')
      : area('review', blockers.length > 0 ? 'blocked' : 'in_progress', blockers.length > 0 ? `${areas.length - open.length} of ${areas.length} areas ready` : 'Ready to activate', {
          blocked_by: blockers.length > 0 ? blockers.join(', ') : null,
          facts: open.filter((a) => !REQUIRED.includes(a.key)).map((a) => `${a.title} can be finished after the year starts.`),
        });
  return [...areas, review];
}

// --- pending work: derived, never stored -------------------------------------------

export function pendingTasks(yearId: string): PendingTask[] {
  const year = must(SESSIONS, yearId, 'academic year');
  if (lifecycleOf(year) !== 'active') return [];

  const rows = yearEnrollments(yearId);
  const unassigned = rows.filter((row) => row.status !== 'withdrawn' && !row.section_id).length;
  const owed = rows.filter((row) => row.documents.some((document) => document.state === 'pending')).length;
  const task = (key: string, scope: PendingTask['scope'], count: number, title: string, detail: string, tab: PendingTask['tab'], view?: string): PendingTask[] =>
    count > 0 ? [{ id: seedId('task', yearId, key), kind: key, scope, count, title, detail, tab, view }] : [];

  return [
    ...task('placement', 'student', unassigned, `${plural(unassigned, 'student')} ${unassigned === 1 ? 'needs' : 'need'} a section`, 'Enrolled this year and not placed in a section yet', 'students', 'unassigned'),
    ...task('documents', 'student', owed, `${plural(owed, 'leaver')} ${owed === 1 ? 'has' : 'have'} documents pending`, 'A transfer or character certificate is still to be issued', 'students', 'withdrawn'),
    // Every section-level gap, one card each, opening the class or section where it is fixed.
    ...yearStructure(yearId)
      .classes.flatMap((c) => c.issues)
      .filter((issue) => issue.fix !== 'arrange')
      .map((issue) => ({
        id: issue.id,
        kind: issue.fix,
        scope: issue.fix === 'teaching' || issue.fix === 'teacher' ? ('teacher' as const) : ('class' as const),
        count: issue.count,
        title: issue.title,
        detail: issue.detail,
        tab: 'classes' as const,
        target: { grade_level_id: issue.grade_level_id, section_id: issue.section_id, fix: issue.fix },
      })),
    ...yearSummary(yearId).issues.map((issue) => ({
      id: seedId('task', yearId, issue.code),
      kind: issue.code,
      scope: 'year' as const,
      count: 1,
      title: issue.message.replace(/\.$/, ''),
      detail: 'Set from Periods and bells',
      tab: 'actions' as const,
      route: 'school-periods',
    })),
  ];
}

// --- the year at a glance ----------------------------------------------------------

export function yearRegister(yearId: string): YearRegister {
  const year = must(SESSIONS, yearId, 'academic year');
  const rows = yearEnrollments(yearId);
  const active = rows.filter((row) => row.status !== 'withdrawn');
  const sections = sectionsOf(yearId);
  const areas = setupAreas(yearId).filter((a) => a.key !== 'review');
  const count = (status: EnrollmentStatus): number => rows.filter((row) => row.status === status).length;
  const teachers = new Set(teacherAssignmentsOf(yearId).map((a) => a.teacher_id));

  return {
    academic_session_id: yearId,
    lifecycle: lifecycleOf(year),
    enrolled: rows.length,
    active: active.length,
    new_admissions: count('new_admission'),
    withdrawn: count('withdrawn'),
    retained: count('retained'),
    promoted: count('promoted'),
    graduated: count('graduated'),
    final_grade: active.filter((row) => row.grade_level_id === FINAL_GRADE).length,
    unassigned: active.filter((row) => !row.section_id).length,
    documents_pending: rows.filter((row) => row.documents.some((document) => document.state === 'pending')).length,
    sections: sections.length,
    sections_with_room: sections.filter((section) => section.room_id).length,
    sections_with_class_teacher: sections.filter((section) => section.class_teacher_id).length,
    teachers: teachers.size > 0 ? teachers.size : null,
    areas_ready: areas.filter((a) => a.state === 'ready').length,
    areas_total: areas.length,
    pending_items: pendingTasks(yearId).reduce((sum, task) => sum + task.count, 0),
    open_areas: areas.filter((a) => a.state === 'attention' || a.state === 'in_progress').slice(0, 2).map((a) => `${a.title}: ${a.summary}`),
  };
}

export const yearRegisters = (): YearRegister[] => SESSIONS.map((year) => yearRegister(year.id));

export function yearClasses(yearId: string): YearClassRow[] {
  must(SESSIONS, yearId, 'academic year');
  const rows = yearEnrollments(yearId).filter((row) => row.status !== 'withdrawn');
  const sections = sectionsOf(yearId);
  return GRADE_LEVELS.map((grade) => {
    const inGrade = sections.filter((section) => section.grade_level_id === grade.id);
    const pupils = rows.filter((row) => row.grade_level_id === grade.id);
    return {
      grade_level_id: grade.id,
      class_name: grade.name ?? 'Class',
      sections: inGrade.length,
      students: pupils.length,
      unassigned: pupils.filter((row) => !row.section_id).length,
      rooms_assigned: inGrade.filter((section) => section.room_id).length,
      class_teachers: inGrade.filter((section) => section.class_teacher_id).length,
    };
  }).filter((row) => row.sections > 0 || row.students > 0);
}

export function yearTransition(yearId: string): YearTransition {
  const year = must(SESSIONS, yearId, 'academic year');
  const rows = yearEnrollments(yearId);
  const life = lifecycleOf(year);
  // A draft year has no enrolments of its own yet, so its plans are the outgoing year's: who is expected to arrive.
  const from = life === 'draft' && year.previous_session_id ? yearEnrollments(year.previous_session_id) : rows;
  const active = from.filter((row) => row.status !== 'withdrawn');
  const next = SESSIONS.find((other) => other.previous_session_id === yearId);
  const nextRegister = next ? yearRegister(next.id) : null;
  const plan = (disposition: NextYearDisposition): number => active.filter((row) => row.next_year === disposition).length;
  const ended = (status: EnrollmentStatus): number => rows.filter((row) => row.status === status).length;

  return {
    lifecycle: life,
    next: next && nextRegister ? { id: next.id, name: next.name ?? next.code ?? '', areas_ready: nextRegister.areas_ready, areas_total: nextRegister.areas_total } : null,
    plans: { promote: plan('promote'), retain: plan('retain'), graduate: plan('graduate'), not_returning: plan('not_returning'), undecided: plan('undecided') },
    outcome: { promoted: ended('promoted'), retained: ended('retained'), graduated: ended('graduated'), withdrawn: ended('withdrawn'), not_continued: 0 },
  };
}

// --- writes ------------------------------------------------------------------------

const editable = (row: EnrollmentRecord): void => {
  const year = must(SESSIONS, row.academic_session_id, 'academic year');
  if (lifecycleOf(year) === 'closed') fail(409, 'year_closed', `${year.name} is closed and kept for reference only.`);
};

// Placing a pupil gives them a section and the next roll number in it. Nothing about their enrolment is recreated.
export function placeStudent(enrollmentId: string, sectionId: string): YearEnrollment {
  const row = must(ENROLLMENTS, enrollmentId, 'enrolment');
  editable(row);
  const section = must(SECTIONS, sectionId, 'section');
  if (section.grade_level_id !== row.grade_level_id || section.academic_session_id !== row.academic_session_id) {
    fail(422, 'wrong_class', `That section is not in ${className(row.grade_level_id)} this year.`);
  }
  const rolls = ENROLLMENTS.filter((other) => other.section_id === sectionId).map((other) => Number(other.roll_number) || 0);
  row.section_id = sectionId;
  row.roll_number = String(Math.max(0, ...rolls) + 1).padStart(2, '0');
  return yearEnrollments(row.academic_session_id ?? '').find((placed) => placed.id === row.id) ?? fail(404, 'not_found', 'enrolment not found');
}

// Issuing a paper changes the paper. The pupil left on the day they left, whatever is still owed.
export function setDocument(enrollmentId: string, key: string, state: DocumentState): YearEnrollment {
  const row = [...ENROLLMENTS, ...PAST_ENROLLMENTS].find((candidate) => candidate.id === enrollmentId) ?? fail(404, 'not_found', 'enrolment not found');
  editable(row);
  const document = row.documents?.find((candidate) => candidate.key === key) ?? fail(404, 'not_found', 'document not found');
  document.state = state;
  return yearEnrollments(row.academic_session_id ?? '').find((changed) => changed.id === row.id) ?? fail(404, 'not_found', 'enrolment not found');
}

// Class and section labels, the calendar and the shape of the day. Never a pupil, a teacher's timetable or a mark.
export function bringForward(fromId: string, toId: string): YearSetupArea[] {
  const target = must(SESSIONS, toId, 'academic year');
  if (lifecycleOf(target) !== 'draft') fail(409, 'not_draft', 'Structure can only be brought forward into a year that is still being set up.');
  const have = new Set(sectionsOf(toId).map((section) => `${section.grade_level_id}|${section.name}`));
  for (const section of sectionsOf(fromId)) {
    if (have.has(`${section.grade_level_id}|${section.name}`)) continue;
    insert(SECTIONS, {
      ...section,
      id: seedId('section', target.code ?? toId, section.code ?? ''),
      academic_session_id: toId,
      room_id: undefined,
      class_teacher_id: undefined,
      edges: { ...section.edges, academic_session: { id: target.id, name: target.name, code: target.code } },
    });
  }
  copyYearStructure(fromId, toId);
  target.previous_session_id ??= fromId;
  return setupAreas(toId);
}

// One year is active at a time: the outgoing one is closed in the same step, and from then on is read-only.
export function activateYear(yearId: string): AcademicSession {
  const year = must(SESSIONS, yearId, 'academic year');
  if (lifecycleOf(year) !== 'draft') fail(409, 'not_draft', 'Only a year that is being set up can be activated.');
  const review = setupAreas(yearId).find((a) => a.key === 'review');
  if (review?.blocked_by) fail(422, 'year_not_ready', `Finish these first: ${review.blocked_by}.`);
  for (const other of SESSIONS) {
    if (other.is_current) Object.assign(other, { is_current: false, status: 'closed' });
  }
  return Object.assign(year, { is_current: true, status: 'active' });
}
