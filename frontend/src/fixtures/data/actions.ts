import { seedId } from '../ids';
import { TODAY } from './classroom';
import { SEATED } from './enrollment';
import { TEACHERS } from './people';
import { CURRENT_SECTIONS, GRADE_LEVELS, ROOMS } from './structure';

// What no other part of the school records yet: fees, conduct, complaints, staff leave, upkeep and deadlines.

const roll = (...parts: (string | number)[]): number => Number.parseInt(seedId(...parts).slice(0, 6), 16) / 0xffffff;
export const dayFrom = (offset: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const pupil = (i: number): (typeof SEATED)[number] | undefined => SEATED[Math.floor(roll('pupil', i) * SEATED.length)];
const teacher = (i: number): string => TEACHERS[i % TEACHERS.length]?.id ?? '';
const section = (code: string): string => CURRENT_SECTIONS.find((s) => s.code === code)?.id ?? '';
const grade = (n: number): string => GRADE_LEVELS.find((g) => g.sequence === n)?.id ?? '';

export interface FeeDue {
  student_id: string;
  section_id: string;
  term: string;
  amount: number;
  days_overdue: number;
}

// About one family in forty is behind, some for a whole term.
export const FEES_DUE: FeeDue[] = SEATED.filter((e) => roll('fee', e.id) < 0.025).map((e) => {
  const r = roll('fee-days', e.id);
  return { student_id: e.student_id ?? '', section_id: e.section_id ?? '', term: r > 0.55 ? 'Term 1 and Term 2' : 'Term 2', amount: r > 0.55 ? 48_600 : 24_300, days_overdue: Math.round(8 + r * 95) };
});

export const LATE_FEE_PER_DAY = 50;
export const LATE_FEE_CAP = 2_000;

export const CONCESSIONS = [
  { student: 0, kind: 'Sibling concession, 10%', asked: -6 },
  { student: 1, kind: 'Staff ward concession, 50%', asked: -4 },
  { student: 2, kind: 'Financial hardship: fee waiver for Term 2', asked: -2 },
  { student: 3, kind: 'Merit scholarship renewal', asked: -1 },
].map((c) => ({ ...c, pupil: pupil(c.student + 40) }));

export type IncidentKind = 'Fight' | 'Bullying' | 'Mobile phone in class' | 'Uniform' | 'Damage to property' | 'Unfair means in a test' | 'Repeated late arrival' | 'Leaving campus without permission';
export const SERIOUS: readonly IncidentKind[] = ['Fight', 'Bullying', 'Unfair means in a test', 'Leaving campus without permission'];

const KINDS: readonly IncidentKind[] = ['Mobile phone in class', 'Uniform', 'Repeated late arrival', 'Mobile phone in class', 'Damage to property', 'Uniform', 'Fight', 'Bullying', 'Unfair means in a test', 'Leaving campus without permission'];
export const INCIDENTS = Array.from({ length: 22 }, (_, i) => {
  const kind = KINDS[i % KINDS.length] ?? 'Uniform';
  // A few pupils appear more than once: the repeat offenders.
  const who = pupil(i % 9 === 0 ? 900 : i % 7 === 0 ? 901 : i + 100);
  return { id: seedId('incident', i), kind, student_id: who?.student_id ?? '', section_id: who?.section_id ?? '', date: dayFrom(-Math.floor(roll('incident-day', i) * 12)), reported_by: teacher(i * 5 + 3), open: SERIOUS.includes(kind) ? i % 4 !== 3 : i % 3 !== 0 };
});

export const COMPLAINTS = [
  { id: 'c1', from: 'Parent of', who: 1, about: 'Bullying on the school bus, route 4', text: 'My daughter says older students on the route 4 bus take her lunch and push her. This has happened three days running.', urgent: true, at: -1 },
  { id: 'c2', from: 'Parent of', who: 2, about: 'Mathematics marks for the half-yearly', text: 'We believe question 14 was marked wrongly. We request a re-evaluation of the answer sheet.', urgent: false, at: -3 },
  { id: 'c3', from: 'Parent of', who: 3, about: 'Canteen food quality', text: 'The canteen served stale food on Tuesday; two children in 7C complained of stomach ache.', urgent: true, at: -2 },
  { id: 'c4', from: 'Parent of', who: 4, about: 'Homework load in Class 8', text: 'Four subjects set long assignments for the same weekend. Can the deadlines be spread out?', urgent: false, at: -5 },
  { id: 'c5', from: 'Parent of', who: 5, about: 'Classroom fan not working in 9D', text: 'The fan in 9D has not worked for a week and the children are uncomfortable in the afternoon.', urgent: false, at: -4 },
].map((c) => ({ ...c, pupil: pupil(c.who + 300) }));

export const CLASS_REPORTS = [
  { id: 'r1', section: 'G10C', teacher: 7, text: 'Attendance in 10C has dropped in the last fortnight and a group of five students is regularly late. Requesting a parents’ meeting.', urgent: true, at: -1 },
  { id: 'r2', section: 'G07A', teacher: 18, text: 'Two students in 7A appear withdrawn and anxious; recommending a counsellor session.', urgent: true, at: -2 },
  { id: 'r3', section: 'G09B', teacher: 25, text: 'Science practical work is behind because the lab was booked for the exhibition. Need two extra lab periods.', urgent: false, at: -3 },
  { id: 'r4', section: 'G06E', teacher: 33, text: 'The class is doing well this month; reading levels have improved after the library hour.', urgent: false, at: -6 },
];

// Who is away today and what their lessons need.
export const STAFF_AWAY = [
  { teacher: 4, reason: 'Medical leave', periods: 6, covered: 2 },
  { teacher: 19, reason: 'Family emergency, informed at 7:40', periods: 5, covered: 0 },
  { teacher: 52, reason: 'On duty: CBSE evaluation centre', periods: 4, covered: 4 },
];

export const LEAVE_REQUESTS = [
  { teacher: 11, from: 3, to: 5, reason: 'Sister’s wedding' },
  { teacher: 29, from: 1, to: 1, reason: 'Medical appointment' },
  { teacher: 61, from: 8, to: 12, reason: 'Paternity leave' },
];

export const ADMISSIONS_PENDING = [
  { name: 'Ishita Rao', grade: 6, applied: -9, missing: 'Birth certificate' },
  { name: 'Aarush Menon', grade: 9, applied: -6, missing: 'Previous school report card' },
  { name: 'Tanvi Kulkarni', grade: 11, applied: -4, missing: 'Class 10 marksheet, stream choice' },
  { name: 'Reyansh Gill', grade: 7, applied: -2, missing: null },
  { name: 'Myra Sethi', grade: 8, applied: -1, missing: null },
].map((a) => ({ ...a, grade_level_id: grade(a.grade) }));

export const TC_REQUESTS = [
  { who: 7, asked: -5, reason: 'Family moving to Pune', needed_by: 3 },
  { who: 8, asked: -2, reason: 'Admission elsewhere confirmed', needed_by: 6 },
].map((t) => ({ ...t, pupil: pupil(t.who + 500) }));

export const MAINTENANCE = [
  { room: 'Room 9D', issue: 'Ceiling fan not working', reported: -7, severity: 'normal' as const },
  { room: 'Chemistry Lab', issue: 'Gas leak smell near bench 4; supply shut off', reported: 0, severity: 'urgent' as const },
  { room: 'Girls’ washroom, Floor 2', issue: 'Two taps leaking, one door lock broken', reported: -3, severity: 'high' as const },
  { room: 'Computer Lab', issue: 'Six computers will not start', reported: -5, severity: 'normal' as const },
].map((m) => ({ ...m, room_id: ROOMS.find((r) => r.name === m.room)?.id ?? null }));

export const TRANSPORT = [{ route: 'Route 4', issue: 'Bus broke down this morning; 31 students reached 50 minutes late', at: 0 }];

export const DEADLINES = [
  { title: 'CBSE registration for Class 9 and Class 11', due: 4, detail: 'Upload the candidate list with photographs on the CBSE portal.' },
  { title: 'Class 10 and 12 List of Candidates (LOC)', due: 12, detail: 'Final board exam candidate list and subject choices to CBSE.' },
  { title: 'Fire drill for the term', due: 2, detail: 'The term’s evacuation drill is overdue by the safety calendar.' },
  { title: 'School bus fitness certificates', due: 18, detail: 'Three buses need renewed fitness certificates from the RTO.' },
  { title: 'POCSO committee quarterly meeting', due: 9, detail: 'Minutes must be on file for the quarter.' },
  { title: 'UDISE+ annual data upload', due: 25, detail: 'Enrolment, staff and facility data for the government return.' },
];

export const MARKS_PENDING = [
  { exam: 'Half-yearly examination', teacher: 14, section: 'G09C', subject: 'Social Science', due: -2 },
  { exam: 'Half-yearly examination', teacher: 38, section: 'G11B', subject: 'Chemistry', due: -1 },
  { exam: 'Half-yearly examination', teacher: 70, section: 'G06G', subject: 'Hindi', due: 1 },
];

export const SYLLABUS_BEHIND = [
  { section: 'G10B', subject: 'Science', planned: 9, done: 6 },
  { section: 'G12A', subject: 'Physics', planned: 8, done: 5 },
  { section: 'G08E', subject: 'Mathematics', planned: 7, done: 5 },
  { section: 'G10C', subject: 'Mathematics', planned: 8, done: 6 },
];

export const STAFF_DOCUMENTS = [
  { teacher: 23, document: 'Police verification', expires: 6 },
  { teacher: 47, document: 'Police verification', expires: 14 },
  { teacher: 80, document: 'First-aid certificate', expires: -3 },
  { teacher: 0, document: 'First-aid certificate', expires: 9 },
];

export const sectionId = section;
export const teacherId = teacher;
