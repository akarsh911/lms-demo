import type {
  AnswerKey,
  AnswerSheet,
  ExamDetail,
  ExamFilter,
  ExamMarkCell,
  ExamStudentRow,
  ExamSummary,
  MarkDetail,
  MarksAnalytics,
  NamedAverage,
  QuestionPaper,
  RankedStudent,
  ClassmateList,
  StudentGrades,
  StudentOption,
} from '@/types/grades';
import type { ExamSubjectRow } from '@/types/exams';
import { seesSection } from '@/lib/reach/reach';

import { ENROLLMENTS, PAST_ENROLLMENTS, type EnrollmentRecord } from './data/enrollment';
import { EXAM_MARKS, EXAM_SITTINGS, EXAM_SUBJECTS, EXAMS } from './data/exams';
import { STUDENTS, TEACHERS } from './data/people';
import { CURRENT_SESSION, GRADE_LEVELS, OFFERINGS, PAST_SESSION, SECTIONS, SESSIONS } from './data/structure';
import { CALENDAR_DAYS } from './data/timetable';
import { reachNow } from './reach';
import { fail, must } from './rows';

// --- indexes, built once --------------------------------------------------------

const grades = new Map(GRADE_LEVELS.map((grade) => [grade.id, grade]));
const sections = new Map(SECTIONS.map((section) => [section.id, section]));
const offerings = new Map(OFFERINGS.map((offering) => [offering.id, offering]));
const students = new Map(STUDENTS.map((student) => [student.id, student]));
const examSubjects = new Map<string, ExamSubjectRow>();
const subjectsOfExam = new Map<string, ExamSubjectRow[]>();
const marksByKey = new Map<string, (typeof EXAM_MARKS)[number]>();
const sittingDate = new Map<string, string>();
for (const sitting of EXAM_SITTINGS) {
  const day = CALENDAR_DAYS.find((d) => d.id === sitting.calendar_day_id);
  if (day?.calendar_date) sittingDate.set(sitting.exam_subject_id ?? '', day.calendar_date.slice(0, 10));
}

const subjectName = (offeringId: string | undefined): string => offerings.get(offeringId ?? '')?.edges?.subject?.name ?? 'Subject';
const sectionOf = (offeringId: string | undefined) => sections.get(offerings.get(offeringId ?? '')?.section_id ?? '');
const className = (gradeId: string | undefined): string => grades.get(gradeId ?? '')?.name ?? 'Class';
const classOrder = (gradeId: string | undefined): number => grades.get(gradeId ?? '')?.sequence ?? 0;
const pct = (value: number | null, max: number): number | null => (value === null || max === 0 ? null : Math.round((value / max) * 1000) / 10);
const round1 = (n: number): number => Math.round(n * 10) / 10;
const PASS = 33;

// "Classes 6 to 12" when the run is unbroken, otherwise each named.
function classesInWords(gradeIds: readonly string[]): string {
  const sorted = [...new Set(gradeIds)].sort((a, b) => classOrder(a) - classOrder(b));
  if (sorted.length === 0) return 'No classes';
  if (sorted.length === 1) return className(sorted[0]);
  const names = sorted.map((id) => className(id).replace('Class ', ''));
  const orders = sorted.map(classOrder);
  const unbroken = orders.every((o, i) => i === 0 || o === (orders[i - 1] ?? 0) + 1);
  if (unbroken && names.length > 2) return `Classes ${names[0]} to ${names[names.length - 1]}`;
  return `Classes ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Which papers came with a key: about two in three, fixed per paper.
const hasAnswerKey = (examSubjectId: string): boolean => Number.parseInt(examSubjectId.slice(0, 6), 16) % 3 !== 0;
const clock = (minute: number): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const durationOf = (max: number): number => (max <= 25 ? 60 : max <= 80 ? 150 : 180);

const rowsOf = (sessionId: string): EnrollmentRecord[] => (sessionId === CURRENT_SESSION.id ? ENROLLMENTS : sessionId === PAST_SESSION.id ? PAST_ENROLLMENTS : []);

const cell = (examSubjectId: string, studentId: string, max: number): ExamMarkCell => {
  const mark = marksByKey.get(`${examSubjectId}|${studentId}`);
  if (!mark) return { mark_id: null, marks: null, max, status: 'pending' };
  return { mark_id: mark.id, marks: mark.marks_obtained ?? null, max, status: mark.status ?? 'pending' };
};

const sum = (cells: readonly ExamMarkCell[]): { total: number | null; max: number } => {
  const marked = cells.filter((c) => c.marks !== null);
  return { total: marked.length === 0 ? null : marked.reduce((t, c) => t + (c.marks ?? 0), 0), max: marked.reduce((t, c) => t + c.max, 0) };
};

// Every pupil's marks in an examination, once per exam: the base every other answer here filters.
interface Scored {
  row: EnrollmentRecord;
  name: string;
  cells: Map<string, ExamMarkCell>;
}

const scoredCache = new Map<string, Scored[]>();

// Indexed again whenever a paper or a mark has been added in this tab, so a test a teacher sets shows up straight away.
let indexed = { subjects: -1, marks: -1 };
function reindex(): void {
  if (indexed.subjects === EXAM_SUBJECTS.length && indexed.marks === EXAM_MARKS.length) return;
  examSubjects.clear();
  subjectsOfExam.clear();
  marksByKey.clear();
  scoredCache.clear();
  for (const row of EXAM_SUBJECTS) {
    examSubjects.set(row.id, row);
    subjectsOfExam.set(row.exam_id ?? '', [...(subjectsOfExam.get(row.exam_id ?? '') ?? []), row]);
  }
  for (const mark of EXAM_MARKS) marksByKey.set(`${mark.exam_subject_id}|${mark.student_id}`, mark);
  indexed = { subjects: EXAM_SUBJECTS.length, marks: EXAM_MARKS.length };
}
function scored(examId: string): Scored[] {
  const cached = scoredCache.get(examId);
  if (cached) return cached;
  const exam = must(EXAMS, examId, 'examination');
  const bySection = new Map<string, ExamSubjectRow[]>();
  for (const row of subjectsOfExam.get(examId) ?? []) {
    const sectionId = offerings.get(row.subject_offering_id ?? '')?.section_id ?? '';
    bySection.set(sectionId, [...(bySection.get(sectionId) ?? []), row]);
  }
  const out = rowsOf(exam.academic_session_id ?? '')
    .filter((row) => row.status !== 'withdrawn' && row.section_id)
    .map((row) => ({
      row,
      name: students.get(row.student_id ?? '')?.edges?.person?.display_name ?? 'Student',
      cells: new Map((bySection.get(row.section_id ?? '') ?? []).map((subject) => [subjectName(subject.subject_offering_id), cell(subject.id, row.student_id ?? '', subject.maximum_marks ?? 100)])),
    }));
  scoredCache.set(examId, out);
  return out;
}

// --- analytics ------------------------------------------------------------------

const BANDS: readonly [string, number, number][] = [
  ['Below 33%', 0, 33],
  ['33 to 50%', 33, 50],
  ['50 to 70%', 50, 70],
  ['70 to 90%', 70, 90],
  ['90% and above', 90, 101],
];

function averages(list: readonly { key: string; name: string; pct: number | null }[]): NamedAverage[] {
  const groups = new Map<string, { name: string; pcts: number[]; appeared: number }>();
  for (const item of list) {
    const group = groups.get(item.key) ?? { name: item.name, pcts: [], appeared: 0 };
    group.appeared += 1;
    if (item.pct !== null) group.pcts.push(item.pct);
    groups.set(item.key, group);
  }
  return [...groups.entries()].map(([id, group]) => ({
    id,
    name: group.name,
    appeared: group.appeared,
    average_pct: group.pcts.length === 0 ? null : round1(group.pcts.reduce((t, p) => t + p, 0) / group.pcts.length),
    pass_pct: group.pcts.length === 0 ? null : round1((group.pcts.filter((p) => p >= PASS).length / group.pcts.length) * 100),
  }));
}

function analyse(rows: readonly ExamStudentRow[], columns: readonly { name: string; max: number }[]): MarksAnalytics {
  const pcts = rows.map((row) => row.pct).filter((p): p is number => p !== null).sort((a, b) => a - b);
  const ranked = rows
    .filter((row): row is ExamStudentRow & { pct: number } => row.pct !== null)
    .map((row) => ({ student_id: row.student_id, name: row.name, where: `${row.class_name}${row.section_name ? ` ${row.section_name}` : ''}`, pct: row.pct }))
    .sort((a, b) => b.pct - a.pct);
  const bySubject = columns.map((column, index) => {
    const marks = rows.map((row) => row.cells[index]).filter((c): c is ExamMarkCell => c !== undefined && c.marks !== null);
    const subjectPcts = marks.map((c) => (c.marks ?? 0) / c.max);
    return {
      id: column.name,
      name: column.name,
      appeared: marks.length,
      average_pct: subjectPcts.length === 0 ? null : round1((subjectPcts.reduce((t, p) => t + p, 0) / subjectPcts.length) * 100),
      pass_pct: subjectPcts.length === 0 ? null : round1((subjectPcts.filter((p) => p * 100 >= PASS).length / subjectPcts.length) * 100),
    };
  });
  return {
    appeared: rows.length,
    marked: pcts.length,
    absent: rows.length - pcts.length,
    average_pct: pcts.length === 0 ? null : round1(pcts.reduce((t, p) => t + p, 0) / pcts.length),
    median_pct: pcts.length === 0 ? null : (pcts[Math.floor(pcts.length / 2)] ?? null),
    pass_pct: pcts.length === 0 ? null : round1((pcts.filter((p) => p >= PASS).length / pcts.length) * 100),
    highest: ranked[0] ?? null,
    lowest: ranked[ranked.length - 1] ?? null,
    bands: BANDS.map(([label, from, to]) => ({ label, from, to, count: pcts.filter((p) => p >= from && p < to).length })),
    by_subject: bySubject,
    by_class: averages(rows.map((row) => ({ key: row.grade_level_id, name: row.class_name, pct: row.pct }))).sort((a, b) => classOrder(a.id) - classOrder(b.id)),
    by_section: averages(rows.map((row) => ({ key: row.section_id ?? '', name: `${row.class_name} ${row.section_name ?? ''}`.trim(), pct: row.pct }))).sort((a, b) => a.name.localeCompare(b.name)),
    top: ranked.slice(0, 5),
  };
}

// --- the catalogue ----------------------------------------------------------------

function summarise(examId: string): ExamSummary {
  const exam = must(EXAMS, examId, 'examination');
  const session = SESSIONS.find((row) => row.id === exam.academic_session_id);
  const subjects = subjectsOfExam.get(examId) ?? [];
  // A teacher's figures are their own sections'; the office's the whole school's.
  const reach = reachNow();
  const all = scored(examId).filter((item) => seesSection(reach, item.row.section_id)).map((item) => {
    const cells = [...item.cells.values()];
    const { total, max } = sum(cells);
    return pct(total, max);
  });
  const marked = all.filter((p): p is number => p !== null);
  return {
    id: exam.id,
    session_id: exam.academic_session_id ?? '',
    session_name: session?.name ?? '',
    name: exam.name ?? 'Examination',
    code: exam.code ?? '',
    exam_type: exam.exam_type ?? 'term',
    start: (exam.start_at ?? '').slice(0, 10),
    end: (exam.end_at ?? '').slice(0, 10),
    published: exam.status === 'published',
    subjects: new Set(subjects.map((row) => subjectName(row.subject_offering_id))).size,
    classes: new Set(subjects.map((row) => sectionOf(row.subject_offering_id)?.grade_level_id)).size,
    class_names: classesInWords(subjects.map((row) => sectionOf(row.subject_offering_id)?.grade_level_id ?? '')),
    appeared: marked.length,
    average_pct: marked.length === 0 ? null : round1(marked.reduce((t, p) => t + p, 0) / marked.length),
    pass_pct: marked.length === 0 ? null : round1((marked.filter((p) => p >= PASS).length / marked.length) * 100),
    highest_pct: marked.length === 0 ? null : Math.max(...marked),
  };
}

export function examCatalogue(sessionId?: string): ExamSummary[] {
  reindex();
  return EXAMS.filter((exam) => exam.assessment_kind !== 'practice' && (!sessionId || exam.academic_session_id === sessionId))
    .map((exam) => summarise(exam.id))
    .sort((a, b) => b.start.localeCompare(a.start));
}

// The dates each subject was sat on. Sittings where they were recorded; otherwise the window, a subject a day.
function schedule(examId: string): ExamDetail['schedule'] {
  const exam = must(EXAMS, examId, 'examination');
  const start = (exam.start_at ?? '').slice(0, 10);
  const names = [...new Set((subjectsOfExam.get(examId) ?? []).map((row) => subjectName(row.subject_offering_id)))].sort();
  return names.map((name, index) => {
    const rows = (subjectsOfExam.get(examId) ?? []).filter((row) => subjectName(row.subject_offering_id) === name);
    const recorded = rows.map((row) => sittingDate.get(row.id)).find(Boolean);
    const dayOffset = index + Math.floor(index / 6);
    const fallback = start ? new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)) + dayOffset)).toISOString().slice(0, 10) : null;
    const classIds = [...new Set(rows.map((row) => sectionOf(row.subject_offering_id)?.grade_level_id ?? ''))].sort((a, b) => classOrder(a) - classOrder(b));
    const papers = classIds.map((gradeId) => {
      const id = rows.find((row) => sectionOf(row.subject_offering_id)?.grade_level_id === gradeId)?.id ?? '';
      return { exam_subject_id: id, grade_level_id: gradeId, class_name: className(gradeId), answer_key: hasAnswerKey(id) };
    });
    const max = rows[0]?.maximum_marks ?? 100;
    return { subject: name, date: recorded ?? fallback, time: `${clock(9 * 60)} to ${clock(9 * 60 + durationOf(max))}`, max, classes: classesInWords(classIds), question_papers: papers };
  });
}

export function examDetail(examId: string, filter: ExamFilter = {}): ExamDetail {
  reindex();
  const exam = summarise(examId);
  // A teacher reads the marks of the sections they teach; the office reads the whole school.
  const reach = reachNow();
  const all = scored(examId).filter((item) => seesSection(reach, item.row.section_id));
  const inScope = all.filter((item) => (!filter.grade_level_id || item.row.grade_level_id === filter.grade_level_id) && (!filter.section_id || item.row.section_id === filter.section_id));
  const names = [...new Set(inScope.flatMap((item) => [...item.cells.keys()]))].sort();
  const wanted = (filter.subjects ?? []).filter((name) => names.includes(name));
  const subjectNames = wanted.length > 0 ? names.filter((name) => wanted.includes(name)) : names;
  const columns = subjectNames.map((name) => ({ name, max: Math.max(0, ...inScope.map((item) => item.cells.get(name)?.max ?? 0)) }));
  const rows: ExamStudentRow[] = inScope.map((item) => {
    const cells = subjectNames.map((name) => item.cells.get(name) ?? { mark_id: null, marks: null, max: 0, status: 'pending' as const });
    const { total, max } = sum(cells);
    const section = sections.get(item.row.section_id ?? '');
    return {
      student_id: item.row.student_id ?? '',
      name: item.name,
      roll_number: item.row.roll_number ?? null,
      admission_number: students.get(item.row.student_id ?? '')?.admission_number ?? '',
      grade_level_id: item.row.grade_level_id,
      class_name: className(item.row.grade_level_id),
      class_order: classOrder(item.row.grade_level_id),
      section_id: section?.id ?? null,
      section_name: section?.name ?? null,
      cells,
      total,
      max,
      pct: pct(total, max),
      rank: null,
    };
  });
  // Rank within what is on screen, ties sharing a place.
  const order = rows.filter((row) => row.pct !== null).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  order.forEach((row, index) => {
    row.rank = index > 0 && order[index - 1]?.pct === row.pct ? (order[index - 1]?.rank ?? index + 1) : index + 1;
  });
  rows.sort((a, b) => a.class_order - b.class_order || (a.section_name ?? '').localeCompare(b.section_name ?? '') || (a.roll_number ?? '').localeCompare(b.roll_number ?? ''));
  const classIds = [...new Set(all.map((item) => item.row.grade_level_id))].sort((a, b) => classOrder(a) - classOrder(b));
  const sectionRows = [...new Set(all.map((item) => item.row.section_id ?? ''))]
    .map((id) => sections.get(id))
    .filter((section): section is NonNullable<typeof section> => Boolean(section))
    .map((section) => ({ id: section.id, name: section.name ?? '', grade_level_id: section.grade_level_id ?? '', count: all.filter((item) => item.row.section_id === section.id).length }))
    .sort((a, b) => classOrder(a.grade_level_id) - classOrder(b.grade_level_id) || a.name.localeCompare(b.name));
  return {
    exam,
    schedule: schedule(examId),
    classes: classIds.map((id) => ({ id, name: className(id), order: classOrder(id), count: all.filter((item) => item.row.grade_level_id === id).length })),
    sections: sectionRows,
    subjects: names,
    columns,
    rows,
    analytics: analyse(rows, columns),
  };
}

// --- one pupil ------------------------------------------------------------------

// A pupil reads only their own grades; a teacher those of the pupils in the sections they teach.
function mayReadPupil(studentId: string): void {
  const reach = reachNow();
  if (reach.kind === 'self' && reach.studentId !== studentId) fail(403, 'forbidden', 'You can only see your own grades.');
  if (reach.kind === 'teaching' && !ENROLLMENTS.some((e) => e.student_id === studentId && e.status !== 'withdrawn' && seesSection(reach, e.section_id))) {
    fail(403, 'forbidden', 'This student is not in a section you teach.');
  }
}

export function studentGrades(studentId: string, sessionId?: string): StudentGrades {
  reindex();
  mayReadPupil(studentId);
  const student = students.get(studentId);
  if (!student) fail(404, 'not_found', 'That link does not name a student.');
  const sessionsWithRows = SESSIONS.filter((session) => rowsOf(session.id).some((row) => row.student_id === studentId)).sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));
  const chosen = sessionsWithRows.find((session) => session.id === sessionId) ?? sessionsWithRows.find((session) => session.is_current) ?? sessionsWithRows[0];
  const enrollment = chosen ? rowsOf(chosen.id).find((row) => row.student_id === studentId) : undefined;
  const section = sections.get(enrollment?.section_id ?? '');
  const exams = chosen
    ? EXAMS.filter((exam) => exam.academic_session_id === chosen.id && exam.assessment_kind !== 'practice').sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''))
    : [];

  const records = exams.map((exam) => {
    const peers = scored(exam.id).filter((item) => item.row.section_id === enrollment?.section_id);
    const mine = peers.find((item) => item.row.student_id === studentId);
    const subjects = [...(mine?.cells.entries() ?? [])].sort(([a], [b]) => a.localeCompare(b));
    const { total, max } = sum(subjects.map(([, c]) => c));
    const myPct = pct(total, max);
    const peerPcts = peers
      .map((item) => {
        const s = sum([...item.cells.values()]);
        return pct(s.total, s.max);
      })
      .filter((p): p is number => p !== null)
      .sort((a, b) => b - a);
    const classAverage = (name: string): number | null => {
      const marks = peers.map((item) => item.cells.get(name)).filter((c): c is ExamMarkCell => c !== undefined && c.marks !== null);
      return marks.length === 0 ? null : round1((marks.reduce((t, c) => t + (c.marks ?? 0) / c.max, 0) / marks.length) * 100);
    };
    return {
      exam_id: exam.id,
      name: exam.name ?? 'Examination',
      code: exam.code ?? '',
      exam_type: exam.exam_type ?? 'term',
      start: (exam.start_at ?? '').slice(0, 10),
      published: exam.status === 'published',
      total,
      max,
      pct: myPct,
      rank: myPct === null ? null : peerPcts.findIndex((p) => p <= myPct) + 1,
      of: peerPcts.length,
      class_average_pct: peerPcts.length === 0 ? null : round1(peerPcts.reduce((t, p) => t + p, 0) / peerPcts.length),
      subjects: subjects.map(([name, mark]) => ({ subject: name, mark, class_average_pct: classAverage(name) })),
    };
  });

  const subjectNames = [...new Set(records.flatMap((record) => record.subjects.map((s) => s.subject)))].sort();
  const trends = subjectNames.map((name) => {
    const points = records.map((record) => {
      const mark = record.subjects.find((s) => s.subject === name)?.mark;
      return mark && mark.marks !== null ? round1((mark.marks / mark.max) * 100) : null;
    });
    const seen = points.filter((p): p is number => p !== null);
    return { subject: name, points, average_pct: seen.length === 0 ? null : round1(seen.reduce((t, p) => t + p, 0) / seen.length), best_pct: seen.length === 0 ? null : Math.max(...seen) };
  });
  const withAverage = trends.filter((t): t is typeof t & { average_pct: number } => t.average_pct !== null).sort((a, b) => b.average_pct - a.average_pct);
  const held = records.filter((record) => record.pct !== null);

  return {
    student_id: studentId,
    name: student.edges?.person?.display_name ?? 'Student',
    admission_number: student.admission_number ?? '',
    sessions: sessionsWithRows.map((session) => ({ id: session.id, name: session.name ?? session.code ?? '', current: Boolean(session.is_current) })),
    session_id: chosen?.id ?? '',
    class_name: enrollment ? className(enrollment.grade_level_id) : null,
    section_name: section?.name ?? null,
    exams: records,
    subjects: trends,
    overall_pct: held.length === 0 ? null : round1(held.reduce((t, record) => t + (record.pct ?? 0), 0) / held.length),
    strongest: withAverage[0]?.subject ?? null,
    weakest: withAverage.length > 1 ? (withAverage[withAverage.length - 1]?.subject ?? null) : null,
  };
}

// --- one mark, one paper ---------------------------------------------------------

const REMARKS = ['Neat work; show the steps in long answers.', 'Left the last question unattempted.', 'Careless slips in the second section.', 'Excellent diagrams.', 'Needs to manage time better.', 'Good grasp of the concepts; presentation can improve.'];
const hash = (id: string): number => Number.parseInt(id.slice(0, 6), 16);

// The paper's shape depends on its maximum: a unit test is one short section, a term paper has four.
function paperSections(max: number): QuestionPaper['sections'] {
  if (max <= 25) return [{ title: 'Section A · Short answers', count: 5, marks_each: 2 }, { title: 'Section B · Long answers', count: 3, marks_each: 5 }];
  if (max <= 80) return [{ title: 'Section A · Objective', count: 16, marks_each: 1 }, { title: 'Section B · Short answers', count: 8, marks_each: 3 }, { title: 'Section C · Long answers', count: 5, marks_each: 5 }, { title: 'Section D · Case based', count: 3, marks_each: 5 }];
  return [{ title: 'Section A · Objective', count: 20, marks_each: 1 }, { title: 'Section B · Short answers', count: 10, marks_each: 3 }, { title: 'Section C · Long answers', count: 6, marks_each: 5 }, { title: 'Section D · Case based', count: 4, marks_each: 5 }];
}

export function questionPaper(examSubjectId: string): QuestionPaper {
  reindex();
  const row = must(EXAM_SUBJECTS, examSubjectId, 'exam subject');
  const exam = must(EXAMS, row.exam_id ?? '', 'examination');
  const max = row.maximum_marks ?? 100;
  const subject = subjectName(row.subject_offering_id);
  const cls = className(sectionOf(row.subject_offering_id)?.grade_level_id);
  return {
    exam_subject_id: examSubjectId,
    exam: exam.name ?? 'Examination',
    subject,
    class_name: cls,
    max,
    duration_minutes: max <= 25 ? 60 : max <= 80 ? 150 : 180,
    date: sittingDate.get(examSubjectId) ?? schedule(exam.id).find((s) => s.subject === subject)?.date ?? null,
    instructions: ['All questions are compulsory.', 'Marks for each question are shown against it.', 'Write neatly; diagrams where asked carry marks.', ...(max > 25 ? ['Internal choice is given in Sections C and D.'] : [])],
    sections: paperSections(max),
    file_name: `${(exam.code ?? 'EXAM').toLowerCase()}-${cls.replace(/\s+/g, '').toLowerCase()}-${subject.replace(/\s+/g, '-').toLowerCase()}.pdf`,
    answer_key: hasAnswerKey(examSubjectId) ? answerKey(examSubjectId, max, exam.end_at ?? '') : null,
  };
}

// A key is the objective answers and one line of marking scheme per other section; the setter is the paper's subject teacher where known.
function answerKey(examSubjectId: string, max: number, examEnd: string): AnswerKey {
  const sections = paperSections(max);
  const objective = sections[0]?.title.includes('Objective') || sections[0]?.title.includes('Short') ? sections[0] : undefined;
  const n = hash(examSubjectId);
  const letters = ['A', 'B', 'C', 'D'];
  const teacher = TEACHERS[n % TEACHERS.length]?.edges?.staff?.edges?.person?.display_name ?? 'Subject teacher';
  const NOTES: Readonly<Record<string, string>> = {
    'Short answers': 'One mark for the statement, one for the reason or working.',
    'Long answers': 'Marks for method as well as the final answer; a correct answer with no working earns half.',
    'Case based': 'Each part marked independently; quote the case where asked.',
    Objective: 'One mark each, no negative marking.',
  };
  return {
    uploaded_by: teacher,
    uploaded_at: examEnd.slice(0, 10),
    file_name: `answer-key-${examSubjectId.slice(0, 8)}.pdf`,
    objective: objective ? Array.from({ length: objective.count }, (_, i) => ({ no: i + 1, answer: letters[(n >> i % 16) % 4] ?? 'A' })) : [],
    scheme: sections.map((section) => ({ section: section.title, note: NOTES[section.title.split(' · ')[1] ?? ''] ?? 'Marked against the scheme on file.' })),
  };
}

// Who an administrator might open in the explorer: by name or admission number, with where they sit this year.
export function searchStudents(query: string, limit = 12): StudentOption[] {
  const needle = query.trim().toLowerCase();
  const current = new Map(ENROLLMENTS.filter((row) => row.status !== 'withdrawn').map((row) => [row.student_id ?? '', row]));
  // A teacher finds the pupils of the sections they teach; the office finds anyone.
  const reach = reachNow();
  const out: StudentOption[] = [];
  for (const student of STUDENTS) {
    if (reach.kind !== 'school' && !seesSection(reach, current.get(student.id)?.section_id)) continue;
    const name = student.edges?.person?.display_name ?? '';
    if (needle !== '' && !name.toLowerCase().includes(needle) && !(student.admission_number ?? '').toLowerCase().includes(needle)) continue;
    const row = current.get(student.id);
    const section = sections.get(row?.section_id ?? '');
    out.push({ id: student.id, name, admission_number: student.admission_number ?? '', where: row ? `${className(row.grade_level_id)}${section ? ` ${section.name ?? ''}` : ''}` : 'Not enrolled this year' });
    if (out.length >= limit) break;
  }
  return out;
}

// A checked sheet is the total broken over the paper's questions, so it adds up to the mark exactly.
function answerSheet(markId: string, total: number, max: number, checkedBy: string | null, checkedAt: string | null): AnswerSheet {
  const sections = paperSections(max);
  const questions: AnswerSheet['questions'] = [];
  let no = 1;
  for (const section of sections) for (let i = 0; i < section.count; i += 1) questions.push({ no: no++, max: section.marks_each, scored: 0 });
  let remaining = total;
  for (const [index, question] of questions.entries()) {
    const share = Math.round((question.max * total) / max + ((hash(markId) >> index % 20) % 3) - 1);
    question.scored = Math.max(0, Math.min(question.max, share, remaining));
    remaining -= question.scored;
  }
  // Whatever rounding left over goes to the first questions that can still take it.
  for (const question of questions) {
    if (remaining <= 0) break;
    const room = question.max - question.scored;
    const add = Math.min(room, remaining);
    question.scored += add;
    remaining -= add;
  }
  return { questions, checked_by: checkedBy, checked_at: checkedAt, file_name: `answer-sheet-${markId.slice(0, 8)}.pdf` };
}

export function markDetail(markId: string): MarkDetail {
  reindex();
  const mark = must(EXAM_MARKS, markId, 'mark');
  mayReadPupil(mark.student_id ?? '');
  const row = must(EXAM_SUBJECTS, mark.exam_subject_id ?? '', 'exam subject');
  const exam = must(EXAMS, row.exam_id ?? '', 'examination');
  const student = students.get(mark.student_id ?? '');
  const teacher = TEACHERS.find((t) => t.id === mark.marked_by);
  const teacherName = teacher?.edges?.staff?.edges?.person?.display_name ?? null;
  const max = row.maximum_marks ?? 100;
  const n = hash(mark.id);
  return {
    mark_id: mark.id,
    student_id: mark.student_id ?? '',
    student: student?.edges?.person?.display_name ?? 'Student',
    subject: subjectName(row.subject_offering_id),
    exam: exam.name ?? 'Examination',
    exam_subject_id: row.id,
    marks: mark.marks_obtained ?? null,
    max,
    status: mark.status ?? 'pending',
    remarks: mark.remarks ?? (n % 3 === 0 ? (REMARKS[n % REMARKS.length] ?? null) : null),
    marked_by: teacherName,
    marked_at: mark.marked_at ?? null,
    answer_sheet: mark.marks_obtained === undefined ? null : answerSheet(mark.id, mark.marks_obtained, max, teacherName, mark.marked_at ?? null),
  };
}

// Every pupil's mean across the session's held examinations, once per session.
const overallCache = new Map<string, Map<string, number>>();
function overallsOf(sessionId: string): Map<string, number> {
  const cached = overallCache.get(sessionId);
  if (cached) return cached;
  const sums = new Map<string, { total: number; n: number }>();
  for (const exam of EXAMS.filter((e) => e.academic_session_id === sessionId && e.status === 'published' && e.assessment_kind !== 'practice')) {
    for (const item of scored(exam.id)) {
      const { total, max } = sum([...item.cells.values()]);
      const p = pct(total, max);
      if (p === null) continue;
      const acc = sums.get(item.row.student_id ?? '') ?? { total: 0, n: 0 };
      acc.total += p;
      acc.n += 1;
      sums.set(item.row.student_id ?? '', acc);
    }
  }
  const out = new Map([...sums.entries()].map(([id, acc]) => [id, round1(acc.total / acc.n)]));
  overallCache.set(sessionId, out);
  return out;
}

// A roster to move through: the pupil's own section or class by default, or any class and section named.
export function classmates(studentId: string, sessionId: string | undefined, scope: 'section' | 'class', gradeId?: string, sectionId?: string): ClassmateList {
  reindex();
  const reach = reachNow();
  if (reach.kind === 'self') fail(403, 'forbidden', 'Classmates’ results are not shared with students.');
  const session = SESSIONS.find((s) => s.id === sessionId) ?? SESSIONS.find((s) => s.is_current);
  const rows = rowsOf(session?.id ?? '').filter((row) => row.status !== 'withdrawn' && (reach.kind === 'school' || seesSection(reach, row.section_id)));
  const inSession = SECTIONS.filter((section) => section.academic_session_id === session?.id);
  const classes = [...new Set(inSession.map((section) => section.grade_level_id ?? ''))]
    .sort((a, b) => classOrder(a) - classOrder(b))
    .map((id) => ({ id, name: className(id), sections: inSession.filter((section) => section.grade_level_id === id).map((section) => ({ id: section.id, name: section.name ?? '' })).sort((a, b) => a.name.localeCompare(b.name)) }));
  const me = rows.find((row) => row.student_id === studentId);
  const grade = gradeId || me?.grade_level_id || '';
  const named = sectionId && inSession.some((section) => section.id === sectionId && section.grade_level_id === grade) ? sectionId : undefined;
  // A class chosen without a section reads as the whole class, unless it is the pupil's own and the scope asks for the section.
  const section = scope === 'class' ? undefined : (named ?? (grade === me?.grade_level_id ? (me.section_id ?? undefined) : undefined));
  const effective: 'section' | 'class' = section ? 'section' : 'class';
  const overall = overallsOf(session?.id ?? '');
  const peers = rows
    .filter((row) => row.grade_level_id === grade && (!section || row.section_id === section))
    .map((row) => ({ row, sec: sections.get(row.section_id ?? '') }))
    // Pupils not yet placed in a section go last, not first.
    .sort((a, b) => Number(!a.sec) - Number(!b.sec) || (a.sec?.name ?? '').localeCompare(b.sec?.name ?? '') || (a.row.roll_number ?? '').localeCompare(b.row.roll_number ?? ''));
  const sectionRow = section ? sections.get(section) : undefined;
  return {
    scope: effective,
    label: grade ? `${className(grade)}${sectionRow ? ` ${sectionRow.name ?? ''}` : ''}` : 'Not enrolled in this year',
    grade_level_id: grade || null,
    section_id: section ?? null,
    classes,
    students: peers.map(({ row, sec }) => ({
      id: row.student_id ?? '',
      name: students.get(row.student_id ?? '')?.edges?.person?.display_name ?? 'Student',
      roll_number: row.roll_number ?? null,
      section_name: sec?.name ?? null,
      overall_pct: overall.get(row.student_id ?? '') ?? null,
    })),
  };
}
