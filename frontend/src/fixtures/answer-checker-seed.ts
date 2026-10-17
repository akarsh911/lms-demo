import { linkedExamName, questionTotal, setQuestions } from '@/lib/answer-checker/paper';
import type { Paper } from '@/types/papersetter';

import * as checker from './answer-checker';
import { chance, quantise, type QuestionObservation } from './answer-checker-marking';
import { extraSetterPaper, type ClassMember } from './answer-checker-paper';
import { clearSessions } from './answer-checker-sessions';
import { DEMO_PAPER_IDS } from './data/answer-checker-demo';
import { EXAMS, EXAM_MARKS, EXAM_SUBJECTS } from './data/exams';
import { CURRENT_SECTIONS, CURRENT_SESSION, OFFERINGS, SUBJECTS } from './data/structure';
import { ONLINE_SOURCE_PREFIX, sampleSheets, sampleSources } from './online-test';

export const DEMO_EXAM_IDS = {
  midway: 'seed-control',
  review: 'seed-heredity',
  recorded: 'seed-light',
  online: 'seed-online',
} as const;

const OVERRIDE_COMMENTS = [
  'Accepted: the idea is there in other words.',
  'Diagram earns the method mark.',
  'Too brief for full marks.',
  'Units missing in the final answer.',
];

let seeded = false;

function paperOf(paperId: string): Paper {
  const paper = extraSetterPaper(paperId);
  if (!paper) throw new Error(`demo paper ${paperId} is missing`);
  return paper;
}

function begin(paper: Paper, examId: string, klass: string): void {
  checker.createExam(
    { name: linkedExamName(paper), subject: paper.subject ?? '', klass, languages: ['english'], total_marks: questionTotal(setQuestions(paper)) },
    examId,
  );
  checker.uploadDocuments(examId, { paper: true, key: true }, paper);
  checker.compileRubric(examId);
  checker.approveRubric(examId);
}

function seedMidway(): void {
  const examId = DEMO_EXAM_IDS.midway;
  begin(paperOf(DEMO_PAPER_IDS.midway), examId, 'G10A');
  checker.uploadScans(examId, ['class-test-control.pdf']);
  checker.confirmTruth(examId);
  const ids = checker.listBooklets(examId).map((ref) => ref.id);
  checker.markAll(examId, ids.slice(0, Math.ceil(ids.length / 2)));
  checker.setStage(examId, 'marking');
}

function seedReview(): void {
  const examId = DEMO_EXAM_IDS.review;
  begin(paperOf(DEMO_PAPER_IDS.review), examId, 'G10B');
  checker.uploadScans(examId, ['scan cc-heredity'], { source: 'scan cc-heredity' });
  checker.confirmTruth(examId);
  checker.markAll(examId, null);
  const ids = checker.listBooklets(examId).map((ref) => ref.id);
  ids.slice(0, 4).forEach((bookletId, index) => {
    const result = checker.getBooklet(examId, bookletId).result;
    const question = result?.results[3];
    if (!question) return;
    const nudged = Math.max(0, Math.min(question.max_marks, question.marks + (index % 2 === 0 ? 1 : -1)));
    checker.editQuestion(examId, bookletId, question.question_number, { marks: nudged, comment: OVERRIDE_COMMENTS[index] ?? '' });
  });
  ids.slice(-2).forEach((bookletId) => checker.signOff(examId, bookletId));
  checker.setStage(examId, 'reviewing');
}

function halfYearlyScience(): { maximum: number; rows: Map<string, { status: string; marks: number | undefined }> } {
  const exam = EXAMS.find((row) => row.code === 'HY' && row.academic_session_id === CURRENT_SESSION.id);
  const section = CURRENT_SECTIONS.find((row) => row.code === 'G10A');
  const science = SUBJECTS.find((row) => row.code === 'SCI');
  const offering = OFFERINGS.find((row) => row.section_id === section?.id && row.subject_id === science?.id);
  const subject = EXAM_SUBJECTS.find((row) => row.exam_id === exam?.id && row.subject_offering_id === offering?.id);
  const out = new Map<string, { status: string; marks: number | undefined }>();
  for (const row of EXAM_MARKS) {
    if (row.exam_subject_id === subject?.id && row.student_id) out.set(row.student_id, { status: row.status ?? '', marks: row.marks_obtained });
  }
  return { maximum: subject?.maximum_marks ?? 80, rows: out };
}

function observationsFor(paper: Paper, member: ClassMember, total: number): QuestionObservation[] {
  const questions = setQuestions(paper);
  const slots = questions
    .flatMap((question, q) => Array.from({ length: question.marks }, (_, p) => ({ q, p, order: chance('slot', member.studentId, q, p) })))
    .sort((left, right) => left.order - right.order);
  const full = Math.floor(total);
  const half = total - full >= 0.5;
  const states = questions.map((question) => Array.from({ length: question.marks }, () => 'missing' as 'full' | 'partial' | 'missing'));
  slots.forEach((slot, index) => {
    const row = states[slot.q];
    if (!row) return;
    if (index < full) row[slot.p] = 'full';
    else if (index === full && half) row[slot.p] = 'partial';
  });
  return questions.map((question, q) => ({ number: String(question.n), attempted: true, points: states[q] ?? [], misspelt: false, doubtful: false, chosen: null }));
}

function seedRecorded(): void {
  const examId = DEMO_EXAM_IDS.recorded;
  const paper = paperOf(DEMO_PAPER_IDS.recorded);
  const outOf = questionTotal(setQuestions(paper));
  const recorded = halfYearlyScience();
  const sat = (member: ClassMember): number | null => {
    const row = recorded.rows.get(member.studentId);
    return row && row.status === 'marked' && typeof row.marks === 'number' ? row.marks : null;
  };
  begin(paper, examId, 'G10A');
  const roster = checker.rosterOf(examId);
  checker.uploadScans(examId, ['half-yearly-science.pdf'], {
    absentRolls: new Set(roster.filter((member) => sat(member) === null).map((member) => member.roll)),
    forced: (member) => {
      const marks = sat(member);
      return marks === null ? null : observationsFor(paper, member, quantise((marks / recorded.maximum) * outOf));
    },
  });
  checker.confirmTruth(examId);
  checker.markAll(examId, null);
  for (const ref of checker.listBooklets(examId)) checker.signOff(examId, ref.id);
  checker.setStage(examId, 'done');
}

function seedOnline(): void {
  const examId = DEMO_EXAM_IDS.online;
  const paper = paperOf(DEMO_PAPER_IDS.online);
  const source = sampleSources(paper)[0];
  if (!source) return;
  const label = `${ONLINE_SOURCE_PREFIX}${source.id}`;
  begin(paper, examId, 'G10A');
  checker.uploadScans(examId, [label], { source: label, typedSheets: sampleSheets(paper) });
  checker.confirmTruth(examId);
  checker.markAll(examId, null);
  checker.setStage(examId, 'reviewing');
}

export function seedCheckerFixtures(): void {
  if (seeded) return;
  seeded = true;
  seedMidway();
  seedReview();
  seedRecorded();
  seedOnline();
  checker.settleJobs();
}

export function reseedCheckerFixtures(): void {
  checker.clearFixtures();
  clearSessions();
  seeded = false;
  seedCheckerFixtures();
}
