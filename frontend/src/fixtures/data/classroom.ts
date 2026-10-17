import type {
  AssignmentItemRow,
  AssignmentRow,
  AssignmentSubmissionRow,
  StreamCommentRow,
  StreamPostRow,
  StreamPostType,
  StreamTargetType,
} from '@/types/classroom';
import type { AttendanceDayRow, AttendancePeriodRow, SubjectEnrollmentRow } from '@/types/people-detail';
import type { TimetableDeviationRow } from '@/types/section-calendar';

import { seedId } from '../ids';
import { ENROLLMENTS, SEATED } from './enrollment';
import { STAFF_PEOPLE, TEACHERS } from './people';
import { CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS, OFFERINGS } from './structure';
import { CALENDAR_DAYS, SLOTS } from './timetable';

const clampDate = (s: string): string => {
  const min = '2026-05-04';
  const max = '2027-03-31';
  return s < min ? min : s > max ? max : s;
};

// The school's own date, not UTC's: from midnight to 05:30 in India the two are a day apart.
export const TODAY = clampDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));

const roll = (...parts: (string | number)[]): number => Number.parseInt(seedId(...parts).slice(0, 6), 16) / 0xffffff;

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const allSchoolDays = CALENDAR_DAYS.filter((d) => d.forenoon_open && (d.calendar_date ?? '').slice(0, 10) <= TODAY).map((d) => ({
  date: (d.calendar_date ?? '').slice(0, 10),
  afternoon: d.afternoon_open ?? false,
}));
// The school-wide table keeps the last twenty days; one pupil's whole year is generated on request instead (`attendanceOf`).
const schoolDays = allSchoolDays.slice(-20);

// Indexed once: with two thousand pupils a scan per pupil is the difference between instant and a visible pause.
const offeringsIn = new Map<string, typeof OFFERINGS>();
for (const offering of OFFERINGS) offeringsIn.set(offering.section_id ?? '', [...(offeringsIn.get(offering.section_id ?? '') ?? []), offering]);

export const SUBJECT_ENROLLMENTS: SubjectEnrollmentRow[] = SEATED.flatMap((enrollment) =>
  (offeringsIn.get(enrollment.section_id ?? '') ?? []).map((offering) => ({
    id: seedId('subject-enrollment', enrollment.id, offering.id),
    student_id: enrollment.student_id,
    student_enrollment_id: enrollment.id,
    subject_offering_id: offering.id,
    academic_session_id: CURRENT_SESSION.id,
    status: 'active',
  })),
);

function statusFor(student: string, date: string): string {
  const r = roll('attendance', student, date);
  return r < 0.92 ? 'present' : r < 0.96 ? 'absent' : r < 0.98 ? 'late' : 'excused';
}

// What a parent gave as the reason, where one was given; about one absence in four goes unexplained.
const REASONS = ['Unwell', 'Fever', 'Family function', 'Travelling', 'Medical appointment', 'Religious observance'] as const;
const REMARKS = ['Note from parent received', 'Informed by phone', 'Doctor\u2019s certificate submitted'] as const;
const reasonFor = (student: string, date: string): { reason_code?: string; remarks?: string } => {
  const r = roll('reason', student, date);
  if (r < 0.25) return {};
  return { reason_code: REASONS[Math.floor(r * 97) % REASONS.length], remarks: r > 0.6 ? REMARKS[Math.floor(r * 31) % REMARKS.length] : undefined };
};

const dayRow = (e: (typeof SEATED)[number], date: string, afternoon: boolean): AttendanceDayRow => {
  const morning = statusFor(e.student_id ?? '', date);
  const pm = afternoon ? (morning === 'absent' ? 'absent' : statusFor(`${e.student_id}pm`, date)) : undefined;
  return {
    ...(morning === 'absent' || pm === 'absent' ? reasonFor(e.student_id ?? '', date) : {}),
    id: seedId('attendance-day', e.id, date),
    student_id: e.student_id,
    academic_session_id: CURRENT_SESSION.id,
    section_id: e.section_id,
    attendance_date: `${date}T00:00:00Z`,
    forenoon_status: morning,
    afternoon_status: pm,
    source: 'teacher',
  };
};

// Every school day of the session so far for one pupil, the same marks the school-wide table holds for its last twenty.
export function attendanceOf(studentId: string): AttendanceDayRow[] {
  const enrollment = SEATED.find((e) => e.student_id === studentId);
  if (!enrollment) return [];
  const joined = (enrollment.enrollment_date ?? '').slice(0, 10);
  return allSchoolDays.filter(({ date }) => date >= joined).map(({ date, afternoon }) => dayRow(enrollment, date, afternoon));
}

export const ATTENDANCE_DAYS: AttendanceDayRow[] = SEATED.flatMap((e) =>
  schoolDays.map(({ date, afternoon }) => {
    const morning = statusFor(e.student_id ?? '', date);
    return {
      id: seedId('attendance-day', e.id, date),
      student_id: e.student_id,
      academic_session_id: CURRENT_SESSION.id,
      section_id: e.section_id,
      attendance_date: `${date}T00:00:00Z`,
      forenoon_status: morning,
      afternoon_status: afternoon ? (morning === 'absent' ? 'absent' : statusFor(`${e.student_id}pm`, date)) : undefined,
      source: 'teacher',
    };
  }),
);

const isoDay = (date: string): number => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

const lessonsOn = new Map<string, typeof SLOTS>();
for (const slot of SLOTS) {
  if (!slot.subject_offering_id) continue;
  const key = `${slot.section_id}|${slot.day_of_week}`;
  lessonsOn.set(key, [...(lessonsOn.get(key) ?? []), slot]);
}

export const ATTENDANCE_PERIODS: AttendancePeriodRow[] = SEATED.flatMap((e) =>
  schoolDays.slice(-3).flatMap(({ date }) =>
    (lessonsOn.get(`${e.section_id}|${isoDay(date)}`) ?? []).map((slot) => ({
      id: seedId('attendance-period', e.id, date, slot.id),
      student_id: e.student_id,
      academic_session_id: CURRENT_SESSION.id,
      subject_offering_id: slot.subject_offering_id,
      period_id: slot.period_id,
      attendance_date: `${date}T00:00:00Z`,
      status: statusFor(e.student_id ?? '', date),
      timetable_slot_id: slot.id,
      teacher_id: slot.teacher_id,
      source: 'teacher',
    })),
  ),
);

const author = (i: number): string => STAFF_PEOPLE[i % STAFF_PEOPLE.length]?.id ?? '';
const senior = CURRENT_SECTIONS.find((s) => s.code === 'G10A');
const grade9 = GRADE_LEVELS.find((g) => g.sequence === 9);
export const SCHOOL_TARGET = seedId('school', 'dev');

interface PostSeed {
  title: string;
  body: string;
  type: StreamPostType;
  pinned?: boolean;
  target: { type: StreamTargetType; id: string };
  ago: number;
}

const POSTS: readonly PostSeed[] = [
  { title: 'Half-yearly examination schedule', body: 'The half-yearly examinations run from 21 to 30 September. Timetables are on the notice board.', type: 'announcement', pinned: true, target: { type: 'school', id: SCHOOL_TARGET }, ago: 9 },
  { title: 'Science fair registration', body: 'Class 9 students may register a project with their science teacher by Friday.', type: 'announcement', target: { type: 'grade', id: grade9?.id ?? '' }, ago: 6 },
  { title: 'Chapter 4 revision notes', body: 'Notes for Chapter 4 are attached. Read them before Monday.', type: 'resource', target: { type: 'section', id: senior?.id ?? '' }, ago: 5 },
  { title: 'Which chapter should we revise first?', body: 'Tell me which chapter you would like to start with in the revision week.', type: 'question', target: { type: 'section', id: senior?.id ?? '' }, ago: 3 },
  { title: 'Parent-teacher meeting', body: 'The parent-teacher meeting is on the first Saturday of next month.', type: 'announcement', target: { type: 'school', id: SCHOOL_TARGET }, ago: 2 },
  { title: 'Sports day rehearsal', body: 'House captains report to the ground at 3 pm for rehearsal.', type: 'announcement', target: { type: 'school', id: SCHOOL_TARGET }, ago: 1 },
];

export const STREAM_POSTS: StreamPostRow[] = POSTS.map((p, i) => {
  const id = seedId('stream-post', i);
  return {
    id,
    author_person_id: author(i),
    academic_session_id: CURRENT_SESSION.id,
    post_type: p.type,
    title: p.title,
    body: p.body,
    pinned: p.pinned ?? false,
    published_at: `${addDays(TODAY, -p.ago)}T09:00:00Z`,
    status: 'published',
    created_at: `${addDays(TODAY, -p.ago)}T08:50:00Z`,
    edges: { targets: [{ id: seedId('stream-target', i), post_id: id, target_type: p.target.type, target_id: p.target.id }] },
  };
});

export const STREAM_COMMENTS: StreamCommentRow[] = [
  { id: seedId('comment', 0), post_id: seedId('stream-post', 3), author_person_id: author(5), body: 'Chapter 4, please.', status: 'visible', created_at: `${addDays(TODAY, -2)}T10:00:00Z` },
  { id: seedId('comment', 1), post_id: seedId('stream-post', 3), author_person_id: author(9), body: 'Chapter 6 is the one I find hardest.', status: 'visible', created_at: `${addDays(TODAY, -2)}T11:30:00Z` },
];

const ASSIGNMENT_TITLES = ['Worksheet 1', 'Practice set', 'Chapter reading'] as const;

export const ASSIGNMENTS: AssignmentRow[] = OFFERINGS.filter(
  (o) => o.academic_session_id === CURRENT_SESSION.id && CURRENT_SECTIONS.slice(0, 6).some((s) => s.id === o.section_id),
)
  .slice(0, 18)
  .map((offering, i) => ({
    id: seedId('assignment-row', offering.id),
    academic_session_id: CURRENT_SESSION.id,
    teacher_id: TEACHERS[i % TEACHERS.length]?.id,
    subject_offering_id: offering.id,
    title: `${offering.edges?.subject?.name ?? 'Subject'}: ${ASSIGNMENT_TITLES[i % ASSIGNMENT_TITLES.length]}`,
    description: 'Complete the set and submit before the due date.',
    assignment_type: (['worksheet', 'practice', 'reading'] as const)[i % 3],
    available_from: `${addDays(TODAY, -7)}T00:00:00Z`,
    due_at: `${addDays(TODAY, (i % 5) - 1)}T17:00:00Z`,
    late_submission_allowed: i % 2 === 0,
    max_attempts: 1,
    maximum_marks: 20,
    status: 'published',
    created_at: `${addDays(TODAY, -7)}T08:00:00Z`,
  }));

export const ASSIGNMENT_ITEMS: AssignmentItemRow[] = ASSIGNMENTS.flatMap((a) =>
  [1, 2, 3].map((position) => ({
    id: seedId('assignment-item', a.id, position),
    assignment_id: a.id,
    question_id: seedId('question', a.id, position),
    position,
    marks: position === 3 ? 10 : 5,
    required: true,
  })),
);

export const SUBMISSIONS: AssignmentSubmissionRow[] = ASSIGNMENTS.flatMap((a) => {
  const offering = OFFERINGS.find((o) => o.id === a.subject_offering_id);
  return ENROLLMENTS.filter((e) => e.section_id === offering?.section_id).flatMap((e) => {
    const r = roll('submission', a.id, e.id);
    if (r < 0.15) return [];
    const graded = r > 0.6;
    return [{
      id: seedId('submission', a.id, e.id),
      assignment_id: a.id,
      student_id: e.student_id,
      attempt_number: 1,
      submitted_at: `${addDays(TODAY, -1)}T15:00:00Z`,
      status: graded ? 'graded' : 'submitted',
      late: r < 0.3,
      total_marks: a.maximum_marks,
      marks_obtained: graded ? Math.round(8 + r * 12) : undefined,
      graded_at: graded ? `${TODAY}T08:00:00Z` : undefined,
    }];
  });
});

export const LESSON_DAY = [...schoolDays].reverse().find((d) => isoDay(d.date) <= 5)?.date ?? TODAY;
const someSlots = SLOTS.filter(
  (s) => s.subject_offering_id && s.section_id === senior?.id && s.day_of_week === isoDay(LESSON_DAY),
);

// The cover goes to the first teacher with no lesson of their own in that period, so nobody is booked twice.
const coverFor = (slot: (typeof someSlots)[number] | undefined): string | undefined =>
  TEACHERS.find((t) => !SLOTS.some((s) => s.teacher_id === t.id && s.day_of_week === slot?.day_of_week && s.period_id === slot?.period_id))?.id;

export const DEVIATIONS: TimetableDeviationRow[] = [
  { id: seedId('deviation', 0), timetable_slot_id: someSlots[0]?.id, deviation_date: LESSON_DAY, kind: 'cancelled', section_id: senior?.id, period_id: someSlots[0]?.period_id, reason: 'Teacher on leave' },
  { id: seedId('deviation', 1), timetable_slot_id: someSlots[1]?.id, deviation_date: LESSON_DAY, kind: 'substitution', section_id: senior?.id, period_id: someSlots[1]?.period_id, substitute_teacher_id: coverFor(someSlots[1]), reason: 'Covering for absent teacher' },
  { id: seedId('deviation', 2), timetable_slot_id: someSlots[2]?.id, deviation_date: LESSON_DAY, kind: 'room_change', section_id: senior?.id, period_id: someSlots[2]?.period_id, room_id: seedId('room', 'Library'), reason: 'Projector repair' },
];
