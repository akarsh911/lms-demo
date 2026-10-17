import type { ExamMarkRow } from '@/types/exam-marks';
import type { ExamRow, ExamSittingRow, ExamSubjectRow } from '@/types/exams';
import type {
  ResultComponent,
  ResultComponentAssignmentLink,
  ResultComponentExamLink,
  ResultScheme,
} from '@/types/result-scheme';

import { seedId } from '../ids';
import { SUBJECT_ENROLLMENTS } from './classroom';
import { PAST_ENROLLMENTS } from './enrollment';
import { TEACHERS } from './people';
import { BRANCH, CURRENT_SESSION, OFFERINGS, PAST_SESSION, ROOMS, gradeSequenceOf, SECTIONS } from './structure';
import { CALENDAR_DAYS, PERIODS } from './timetable';

const exam = (key: string, name: string, code: string, type: ExamRow['exam_type'], start: string, end: string, status: ExamRow['status'], kind: ExamRow['assessment_kind'] = 'evaluative', sessionId = CURRENT_SESSION.id): ExamRow => ({
  id: seedId('exam', key),
  academic_session_id: sessionId,
  branch_id: BRANCH.id,
  name,
  code,
  exam_type: type,
  start_at: `${start}T00:00:00Z`,
  end_at: `${end}T00:00:00Z`,
  status,
  assessment_kind: kind,
});

export const EXAMS: ExamRow[] = [
  exam('ut1', 'Unit Test 1', 'UT1', 'unit_test', '2026-07-13', '2026-07-17', 'published'),
  exam('hy', 'Half-yearly examination', 'HY', 'term', '2026-09-21', '2026-09-30', 'published'),
  exam('annual', 'Annual examination', 'ANN', 'term', '2027-03-01', '2027-03-19', 'draft'),
  exam('quiz', 'Weekly practice quiz', 'QUIZ', 'practice', '2026-09-07', '2026-09-07', 'published', 'practice'),
  // Last year's three, all held, so a closed year has a complete record to read.
  exam('ut1-2526', 'Unit Test 1', 'UT1', 'unit_test', '2025-07-14', '2025-07-18', 'published', 'evaluative', PAST_SESSION.id),
  exam('hy-2526', 'Half-yearly examination', 'HY', 'term', '2025-09-22', '2025-10-01', 'published', 'evaluative', PAST_SESSION.id),
  exam('annual-2526', 'Annual examination', 'ANN', 'term', '2026-03-02', '2026-03-20', 'published', 'evaluative', PAST_SESSION.id),
];

const [UT1, HY, ANNUAL, , PUT1, PHY, PANNUAL] = EXAMS as [ExamRow, ExamRow, ExamRow, ExamRow, ExamRow, ExamRow, ExamRow];
const MAX: Readonly<Record<string, number>> = { [UT1.id]: 25, [HY.id]: 80, [ANNUAL.id]: 100, [PUT1.id]: 25, [PHY.id]: 80, [PANNUAL.id]: 100 };

export const EXAM_SUBJECTS: ExamSubjectRow[] = [UT1, HY, ANNUAL, PUT1, PHY, PANNUAL].flatMap((e) =>
  OFFERINGS.filter((o) => o.academic_session_id === e.academic_session_id).map((o) => ({
    id: seedId('exam-subject', e.id, o.id),
    exam_id: e.id,
    subject_offering_id: o.id,
    maximum_marks: MAX[e.id] ?? 100,
    pass_marks: Math.round((MAX[e.id] ?? 100) * 0.33),
    grading_scheme_id: o.grading_scheme_id,
  })),
);

const examDays = CALENDAR_DAYS.filter((d) => d.day_type === 'exam' && (d.calendar_date ?? '') >= '2026-09-21' && (d.calendar_date ?? '') <= '2026-09-30' && d.forenoon_open);
const firstPeriod = PERIODS.find((p) => p.code === 'P1');

export const EXAM_SITTINGS: ExamSittingRow[] = EXAM_SUBJECTS.filter((s) => s.exam_id === HY.id).map((s, i) => {
  const offering = OFFERINGS.find((o) => o.id === s.subject_offering_id);
  const section = SECTIONS.find((x) => x.id === offering?.section_id);
  return {
    id: seedId('exam-sitting', s.id),
    exam_subject_id: s.id,
    calendar_day_id: examDays[i % Math.max(examDays.length, 1)]?.id,
    period_id: firstPeriod?.id,
    section_id: offering?.section_id,
    room_id: section?.room_id ?? ROOMS[0]?.id,
  };
});

const roll = (...parts: (string | number)[]): number => Number.parseInt(seedId(...parts).slice(0, 6), 16) / 0xffffff;

const enrolledIn = new Map<string, string[]>();
for (const e of SUBJECT_ENROLLMENTS) {
  const list = enrolledIn.get(e.subject_offering_id ?? '') ?? [];
  list.push(e.student_id ?? '');
  enrolledIn.set(e.subject_offering_id ?? '', list);
}
// Last year's pupils sat every subject their section offered.
const pastOfferings = new Map<string, string[]>();
for (const o of OFFERINGS.filter((o) => o.academic_session_id === PAST_SESSION.id)) pastOfferings.set(o.section_id ?? '', [...(pastOfferings.get(o.section_id ?? '') ?? []), o.id]);
for (const e of PAST_ENROLLMENTS) {
  if (e.status === 'withdrawn' || !e.section_id) continue;
  for (const offeringId of pastOfferings.get(e.section_id) ?? []) enrolledIn.set(offeringId, [...(enrolledIn.get(offeringId) ?? []), e.student_id ?? '']);
}

// Half-yearly Hindi is deliberately unmarked, so a report card shows an in-progress subject.
const HINDI_HY = new Set(OFFERINGS.filter((o) => o.edges?.subject?.code === 'HIN').map((o) => seedId('exam-subject', HY.id, o.id)));

// A pupil has one general standing plus a lean per subject, both fixed, so totals spread widely and trends read as real rather than noise.
const ability = (student: string, subjectCode: string): number => 0.3 + roll('general', student) * 0.5 + (roll('lean', student, subjectCode) - 0.5) * 0.3;
// Papers differ: a unit test is kinder than an annual, and Mathematics is harder than Physical Education.
const EXAM_SHIFT: Readonly<Record<string, number>> = { UT1: 0.04, HY: 0, ANN: -0.03 };
const SUBJECT_SHIFT: Readonly<Record<string, number>> = { MATH: -0.07, PHY: -0.05, CHE: -0.03, SCI: -0.02, ENG: 0.02, HIN: 0.04, SST: 0, CS: 0.03, PE: 0.12, BIO: 0 };
const subjectCodeOf = new Map(OFFERINGS.map((o) => [o.id, o.edges?.subject?.code ?? '']));
const examOf = new Map(EXAMS.map((e) => [e.id, e]));

export const EXAM_MARKS: ExamMarkRow[] = EXAM_SUBJECTS.filter((s) => s.exam_id !== ANNUAL.id && !HINDI_HY.has(s.id)).flatMap((s) =>
  (enrolledIn.get(s.subject_offering_id ?? '') ?? []).map((student) => {
    const r = roll('mark', s.id, student);
    const status = r < 0.02 ? 'absent' : r < 0.03 ? 'exempt' : 'marked';
    const code = subjectCodeOf.get(s.subject_offering_id ?? '') ?? '';
    const base = ability(student, code) + (EXAM_SHIFT[examOf.get(s.exam_id ?? '')?.code ?? ''] ?? 0) + (SUBJECT_SHIFT[code] ?? 0);
    const swing = (roll('score', s.id, student) - 0.5) * 0.24;
    const max = s.maximum_marks ?? 100;
    const held = (examOf.get(s.exam_id ?? '')?.end_at ?? '').slice(0, 10);
    return {
      id: seedId('exam-mark', s.id, student),
      exam_subject_id: s.id,
      student_id: student,
      status: status as ExamMarkRow['status'],
      marks_obtained: status === 'marked' ? Math.max(0, Math.min(max, Math.round((base + swing) * max))) : undefined,
      provisional: false,
      marked_by: TEACHERS[Number.parseInt(s.id.slice(0, 4), 16) % TEACHERS.length]?.id,
      marked_at: `${held}T10:00:00Z`,
    };
  }),
);

const scheme = (key: string, name: string, code: string): ResultScheme => ({
  id: seedId('result-scheme', key),
  academic_session_id: CURRENT_SESSION.id,
  name,
  code,
  total_marks: 100,
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
});

export const SCHEME_FULL = scheme('full', 'Term, half-yearly and annual', 'FULL');
export const SCHEME_HALF = scheme('half', 'Unit test and half-yearly', 'HALF');
export const RESULT_SCHEMES: ResultScheme[] = [SCHEME_FULL, SCHEME_HALF];

const component = (schemeId: string, key: string, name: string, max: number, weight: number, position: number): ResultComponent => ({
  id: seedId('result-component', schemeId, key),
  result_scheme_id: schemeId,
  name,
  maximum_marks: max,
  weight,
  aggregation: 'single',
  position,
});

export const RESULT_COMPONENTS: ResultComponent[] = [
  component(SCHEME_FULL.id, 'ut', 'Unit test', 25, 20, 1),
  component(SCHEME_FULL.id, 'hy', 'Half-yearly', 80, 30, 2),
  component(SCHEME_FULL.id, 'ann', 'Annual', 100, 50, 3),
  component(SCHEME_HALF.id, 'ut', 'Unit test', 25, 40, 1),
  component(SCHEME_HALF.id, 'hy', 'Half-yearly', 80, 60, 2),
];

const link = (schemeId: string, key: string, examRow: ExamRow): ResultComponentExamLink => ({
  id: seedId('component-exam', schemeId, key),
  result_component_id: seedId('result-component', schemeId, key),
  exam_id: examRow.id,
});

export const COMPONENT_EXAMS: ResultComponentExamLink[] = [
  link(SCHEME_FULL.id, 'ut', UT1),
  link(SCHEME_FULL.id, 'hy', HY),
  link(SCHEME_FULL.id, 'ann', ANNUAL),
  link(SCHEME_HALF.id, 'ut', UT1),
  link(SCHEME_HALF.id, 'hy', HY),
];

export const COMPONENT_ASSIGNMENTS: ResultComponentAssignmentLink[] = [];
