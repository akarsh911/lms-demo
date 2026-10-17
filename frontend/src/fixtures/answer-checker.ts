import type {
  Booklet,
  BookletRef,
  BookletResult,
  BookletState,
  CheckerExam,
  CheckerExamDetail,
  CheckerExamIn,
  CheckerExamSummary,
  CheckerHealth,
  CheckerJob,
  ClassResults,
  DocumentsSaved,
  IdentityIn,
  MarkedBooklet,
  QuestionEdit,
  QuestionResult,
  RemarkResult,
  Rubric,
  RubricWithAudit,
  Strictness,
  StudentIdentity,
  TypedSheet,
} from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

import { findOutliers, median, observe, overallComment, typedLines, typedObservations, priceQuestion, withOverride, withTotals, writtenLines, type QuestionObservation } from './answer-checker-marking';
import { answerPageImage, coverPageImage, layOut, type PlacedLine } from './answer-checker-pages';
import { classRoster, compiledRubric, objectivesFor, rubricAudit, type ClassMember } from './answer-checker-paper';
import { DEMO_STRENGTHS } from './data/answer-checker-demo';
import { STRICTNESS_PROFILES } from './data/answer-checker-strictness';
import { fail } from './rows';

interface FixtureBooklet {
  ref: BookletRef;
  truth: ClassMember;
  pages: Booklet['pages'];
  placed: PlacedLine[];
  images: string[];
  observations: QuestionObservation[] | null;
  forced: QuestionObservation[] | null;
  typed: Record<string, string> | null;
  result: BookletResult | null;
}

interface FixtureExam {
  exam: CheckerExam;
  paper: Paper | null;
  rubric: Rubric | null;
  booklets: FixtureBooklet[];
}

const STATES: readonly BookletState[] = ['pending', 'identified', 'confirmed', 'marking', 'marked', 'failed', 'signed_off'];
const PROGRESS_POLLS = 3;

const EXAMS = new Map<string, FixtureExam>();
const JOBS = new Map<string, { job: CheckerJob; polls: number }>();
let sequence = 0;

const newId = (): string => {
  sequence += 1;
  return `${Date.now().toString(16).slice(-8)}${sequence.toString(16).padStart(4, '0')}`;
};
const now = (): string => `${new Date().toISOString().slice(0, 19)}+00:00`;
const refuse = (status: number, detail: string): never => fail(status, 'request_failed', detail, { detail });

function held(examId: string): FixtureExam {
  return EXAMS.get(examId) ?? refuse(404, `no exam ${examId}`);
}

function bookletOf(entry: FixtureExam, bookletId: string): FixtureBooklet {
  return entry.booklets.find((row) => row.ref.id === bookletId) ?? refuse(404, `no booklet ${bookletId}`);
}

function submit(kind: string, examId: string, total: number, message: string): CheckerJob {
  const job: CheckerJob = { id: newId(), kind, exam_id: examId, state: 'running', total, done: 0, progress: 0, message, detail: [], error: '', started_at: now(), finished_at: '' };
  JOBS.set(job.id, { job, polls: 0 });
  return { ...job };
}

export function job(jobId: string): CheckerJob {
  const entry = JOBS.get(jobId) ?? refuse(404, 'no such job');
  entry.polls += 1;
  const done = Math.min(entry.job.total, Math.ceil((entry.job.total * entry.polls) / PROGRESS_POLLS));
  const finished = entry.polls >= PROGRESS_POLLS;
  entry.job = {
    ...entry.job,
    done: finished ? entry.job.total : done,
    progress: entry.job.total ? Math.round(((finished ? entry.job.total : done) / entry.job.total) * 10000) / 10000 : 0,
    state: finished ? 'done' : 'running',
    finished_at: finished ? now() : '',
  };
  return { ...entry.job };
}

export function clearFixtures(): void {
  EXAMS.clear();
  JOBS.clear();
}

export function settleJobs(): void {
  for (const entry of JOBS.values()) {
    entry.polls = PROGRESS_POLLS;
    entry.job = { ...entry.job, done: entry.job.total, progress: 1, state: 'done', finished_at: now() };
  }
}

export const rosterOf = (examId: string): readonly ClassMember[] => classRoster(held(examId).exam.klass);

export function confirmTruth(examId: string): void {
  for (const booklet of held(examId).booklets) {
    setIdentity(examId, booklet.ref.id, { name: booklet.truth.name, roll_number: booklet.truth.roll, confirm: true });
  }
}

export function setStage(examId: string, stage: CheckerExam['stage']): void {
  held(examId).exam.stage = stage;
}

export const health = (): CheckerHealth => ({ ok: true, model_configured: false, strictness: STRICTNESS_PROFILES });

export const listExams = (): CheckerExamSummary[] =>
  [...EXAMS.values()].map(({ exam, booklets }) => ({
    id: exam.id,
    name: exam.name,
    subject: exam.subject,
    klass: exam.klass,
    stage: exam.stage,
    booklets: booklets.length,
    marked: booklets.filter((row) => row.ref.state === 'marked' || row.ref.state === 'signed_off').length,
    created_at: exam.created_at,
    updated_at: exam.updated_at,
  }));

export function createExam(body: CheckerExamIn, fixedId?: string): CheckerExam {
  const exam: CheckerExam = {
    id: fixedId ?? newId(),
    ...body,
    stage: 'created',
    strictness: { default: 'medium', per_booklet: {} },
    booklets: [],
    question_paper: '',
    answer_key: '',
    created_at: now(),
    updated_at: now(),
    notes: [],
  };
  EXAMS.set(exam.id, { exam, paper: null, rubric: null, booklets: [] });
  return structuredClone(exam);
}

export function getExam(examId: string): CheckerExamDetail {
  const { exam, rubric, booklets } = held(examId);
  exam.booklets = booklets.map((row) => row.ref);
  const counts = Object.fromEntries(STATES.map((state) => [state, booklets.filter((row) => row.ref.state === state).length])) as Record<BookletState, number>;
  return structuredClone({
    ...exam,
    counts,
    duplicate_rolls: {},
    missing_rolls: [],
    jobs: [...JOBS.values()].filter((row) => row.job.exam_id === examId).map((row) => row.job).slice(-6),
    has_rubric: rubric !== null,
    rubric_approved: Boolean(rubric?.teacher_approved),
    rubric_questions: rubric?.questions.length ?? 0,
  });
}

export function uploadDocuments(examId: string, files: { paper: boolean; key: boolean }, source: Paper | null): DocumentsSaved {
  const entry = held(examId);
  const { exam } = entry;
  if (source) entry.paper = source;
  const saved: DocumentsSaved = {};
  if (files.paper) saved.question_paper = `data/exams/${examId}/documents/question_paper.pdf`;
  if (files.key) saved.answer_key = `data/exams/${examId}/documents/answer_key.pdf`;
  exam.question_paper = saved.question_paper ?? exam.question_paper;
  exam.answer_key = saved.answer_key ?? exam.answer_key;
  if (exam.stage === 'created') exam.stage = 'rubric';
  return saved;
}

export function compileRubric(examId: string): CheckerJob {
  const entry = held(examId);
  if (!entry.exam.question_paper || !entry.exam.answer_key) refuse(400, 'upload the question paper and the answer key first');
  const paper = entry.paper ?? refuse(400, 'the question paper could not be read');
  const rubric = compiledRubric(paper, entry.exam.name);
  entry.rubric = rubric;
  entry.exam.stage = 'rubric';
  const job = submit('compile_rubric', examId, 1, 'Reading the paper and the key');
  JOBS.set(job.id, { job: { ...job, message: `${rubric.questions.length} questions, ${rubric.warnings.length} to check` }, polls: 0 });
  return job;
}

export function getRubric(examId: string): RubricWithAudit {
  const rubric = held(examId).rubric ?? refuse(404, 'no rubric yet');
  return structuredClone({ ...rubric, audit: rubricAudit(rubric) });
}

export function approveRubric(examId: string): { approved: boolean; version: number } {
  const entry = held(examId);
  const rubric = entry.rubric ?? refuse(404, 'no rubric yet');
  rubric.teacher_approved = true;
  if (entry.exam.stage === 'created' || entry.exam.stage === 'rubric') entry.exam.stage = 'collecting';
  return { approved: true, version: rubric.version };
}

export function setStrictness(examId: string, level: string): { default: string } {
  if (level !== 'easy' && level !== 'medium' && level !== 'strict') return refuse(400, `unknown strictness '${level}'`);
  held(examId).exam.strictness.default = level;
  return { default: level };
}

function readCover(member: ClassMember, index: number, klass: string, subject: string): StudentIdentity {
  const smudged = index === 2;
  const partial = index === 6;
  const misread = smudged ? member.name.replace(/([a-z])([a-z])(?=[a-z]*$)/, '$2$1') : partial ? (member.name.split(' ')[0] ?? member.name) : member.name;
  return {
    name: misread,
    name_script: 'latin',
    roll_number: smudged ? null : member.roll,
    raw_roll_number: smudged ? '?' : member.roll,
    klass,
    section: null,
    subject,
    confidence: smudged ? 0.58 : partial ? 0.74 : 0.93 + (index % 5) / 100,
    needs_confirmation: true,
    confirmed_by_teacher: false,
    notes: smudged ? ['roll number is smudged'] : [],
  };
}

function withDemoStrengths(paperId: string, pupil: string, observations: QuestionObservation[]): QuestionObservation[] {
  const strong = new Set(DEMO_STRENGTHS.filter((row) => row.paperId === paperId && row.pupil === pupil).flatMap((row) => row.questions));
  if (strong.size === 0) return observations;
  return observations.map((row) => (strong.has(row.number) ? { ...row, attempted: true, points: row.points.map(() => 'full' as const), misspelt: false, doubtful: false } : row));
}

function writeBooklet(entry: FixtureExam, booklet: FixtureBooklet): void {
  if (!entry.rubric || !entry.paper || booklet.placed.length > 0) return;
  const paperId = entry.paper.paper_id;
  const objectives = objectivesFor(entry.paper);
  const typed = booklet.typed;
  booklet.observations = typed ? typedObservations(entry.rubric, typed, objectives) : (booklet.forced ?? withDemoStrengths(paperId, booklet.truth.name, observe(`${paperId}:${booklet.truth.name}`, entry.rubric, objectives)));
  const sources = (index: number): string => `data/exams/${entry.exam.id}/booklets/${booklet.ref.id}/pages/page-${String(index).padStart(3, '0')}.jpg`;
  const laid = layOut(typed ? typedLines(entry.rubric, typed) : writtenLines(entry.rubric, booklet.observations, objectives), sources);
  booklet.pages = laid.pages;
  booklet.placed = laid.placed;
  booklet.ref.page_count = typed ? 0 : laid.pages.length;
  if (typed) return;
  const cover = coverPageImage([
    ['Name', booklet.truth.name],
    ['Roll No.', booklet.truth.roll],
    ['Class', entry.exam.klass],
    ['Subject', entry.exam.subject],
  ]);
  booklet.images = [cover, ...laid.pages.slice(1).map((page) => answerPageImage(page, laid.placed))];
}

export interface SeedPlan {
  absentRolls?: ReadonlySet<string>;
  forced?: (member: ClassMember) => QuestionObservation[] | null;
  source?: string;
  typedSheets?: readonly TypedSheet[];
}

function onlineIdentity(sheet: TypedSheet, klass: string, subject: string): StudentIdentity {
  return {
    name: sheet.name,
    name_script: 'latin',
    roll_number: sheet.roll,
    raw_roll_number: sheet.roll,
    klass,
    section: null,
    subject,
    confidence: 1,
    needs_confirmation: true,
    confirmed_by_teacher: false,
    notes: ['online login'],
  };
}

export function uploadScans(examId: string, fileNames: readonly string[], plan: SeedPlan = {}): CheckerJob {
  const entry = held(examId);
  if (fileNames.length === 0) refuse(422, 'files: Field required');
  const roster = classRoster(entry.exam.klass);
  const absent = plan.absentRolls;
  const sheets = plan.typedSheets;
  const sheetFor = new Map((sheets ?? []).map((sheet) => [sheet.roll, sheet]));
  const present = sheets
    ? sheets.map((sheet) => roster.find((member) => member.roll === sheet.roll) ?? { studentId: '', name: sheet.name, roll: sheet.roll })
    : absent
      ? roster.filter((member) => !absent.has(member.roll))
      : roster.filter((_, index) => index !== 4 && index !== roster.length - 3);
  const made = present.map<FixtureBooklet>((member, index) => {
    const sheet = sheetFor.get(member.roll);
    return {
    ref: {
      id: newId(),
      state: 'identified',
      student: sheet ? onlineIdentity(sheet, entry.exam.klass, entry.exam.subject) : readCover(member, index, entry.exam.klass, entry.exam.subject),
      page_count: 2,
      source: plan.source ?? fileNames.join(', '),
      first_page_index: index * 3,
      supplementary_count: 0,
      strictness: null,
      total_marks: null,
      total_possible: null,
      mean_confidence: null,
      review_count: 0,
      warnings: !sheet && index === 2 ? ['roll number is smudged'] : [],
      error: '',
      updated_at: now(),
    },
    truth: member,
    pages: [],
    placed: [],
    images: [],
    observations: null,
    forced: plan.forced?.(member) ?? null,
    typed: sheet ? Object.fromEntries(sheet.answers.map((answer) => [String(answer.n), answer.text])) : null,
    result: null,
    };
  });
  for (const booklet of made) writeBooklet(entry, booklet);
  entry.booklets.push(...made);
  entry.exam.stage = 'verifying';
  return submit('split_upload', examId, made.length, `${made.length} booklets — check the names before marking`);
}

export const listBooklets = (examId: string): BookletRef[] => structuredClone(held(examId).booklets.map((row) => row.ref));

export function setIdentity(examId: string, bookletId: string, body: IdentityIn): BookletRef {
  const { ref } = bookletOf(held(examId), bookletId);
  if (body.name !== undefined) ref.student.name = body.name.trim() || null;
  if (body.roll_number !== undefined) {
    ref.student.raw_roll_number = body.roll_number;
    ref.student.roll_number = body.roll_number.trim() || null;
  }
  if (body.confirm) {
    if (!ref.student.name && !ref.student.roll_number) refuse(400, 'give a name or a roll number before confirming');
    ref.student.needs_confirmation = false;
    ref.student.confirmed_by_teacher = true;
    ref.state = 'confirmed';
  } else {
    ref.state = 'identified';
  }
  return structuredClone(ref);
}

export function confirmAll(examId: string, minConfidence: number): { confirmed: number; remaining: number } {
  const entry = held(examId);
  let confirmed = 0;
  for (const { ref } of entry.booklets) {
    if (ref.state !== 'pending' && ref.state !== 'identified') continue;
    if (ref.student.confidence >= minConfidence && ref.student.name && ref.student.roll_number && ref.warnings.length === 0) {
      ref.state = 'confirmed';
      ref.student.needs_confirmation = false;
      ref.student.confirmed_by_teacher = true;
      confirmed += 1;
    }
  }
  const remaining = entry.booklets.filter((row) => row.ref.state === 'pending' || row.ref.state === 'identified').length;
  return { confirmed, remaining };
}

function price(entry: FixtureExam, booklet: FixtureBooklet, level: Strictness): void {
  const rubric = entry.rubric;
  if (!rubric) return;
  writeBooklet(entry, booklet);
  const previous = booklet.result;
  const results = rubric.questions.map<QuestionResult>((question, index) => {
    const observation = booklet.observations?.[index];
    const fresh = observation ? priceQuestion(booklet.ref.id, question, observation, level, booklet.placed) : null;
    const kept = previous?.results.find((row) => row.question_number === question.number);
    if (!fresh) return kept ?? refuse(500, 'observation missing');
    const carried = kept ? { ...withOverride(fresh, kept.teacher_marks_override), teacher_comment: kept.teacher_comment } : fresh;
    return carried;
  });
  const totals = withTotals({ booklet_id: booklet.ref.id, student: booklet.ref.student, rubric_id: rubric.id, rubric_version: rubric.version, strictness: level, results, overall_comment: '', page_annotations: [], overflow_notes: [], warnings: [] });
  booklet.result = { ...totals, overall_comment: previous?.overall_comment || overallComment(totals.total_marks, totals.total_possible) };
  syncRef(booklet, 'marked');
}

function syncRef(booklet: FixtureBooklet, state: BookletState): void {
  const result = booklet.result;
  if (!result) return;
  booklet.ref.state = state;
  booklet.ref.total_marks = result.total_marks;
  booklet.ref.total_possible = result.total_possible;
  booklet.ref.mean_confidence = result.mean_confidence;
  booklet.ref.review_count = result.results.filter((row) => row.needs_review).length;
  booklet.ref.updated_at = now();
}

export function markAll(examId: string, only: readonly string[] | null): CheckerJob {
  const entry = held(examId);
  if (!entry.rubric) refuse(400, 'compile the rubric first');
  const markable = entry.booklets.filter((row) => row.ref.state === 'confirmed' || row.ref.state === 'failed');
  if (markable.length === 0) refuse(400, 'confirm the students before marking');
  const targets = markable.filter((row) => !only || only.includes(row.ref.id));
  for (const booklet of targets) price(entry, booklet, entry.exam.strictness.per_booklet[booklet.ref.id] ?? entry.exam.strictness.default);
  entry.exam.stage = 'reviewing';
  return submit('mark_exam', examId, targets.length, `Marking ${targets.length} booklets`);
}

function reviewLines(result: BookletResult | null): string[] {
  return (result?.results ?? []).filter((row) => row.needs_review).map((row) => `Q${row.question_number}: the reading was not confident — check what was written`);
}

export function getBooklet(examId: string, bookletId: string): MarkedBooklet {
  const entry = held(examId);
  const booklet = bookletOf(entry, bookletId);
  return structuredClone({
    ref: booklet.ref,
    booklet: { id: booklet.ref.id, exam_id: examId, student: booklet.ref.student, pages: booklet.pages, warnings: [] },
    result: booklet.result,
    review: reviewLines(booklet.result),
    arithmetic_problems: [],
    warnings: booklet.ref.warnings,
    pdf_available: false,
  });
}

export const pageImage = (examId: string, bookletId: string, index: number): string =>
  bookletOf(held(examId), bookletId).images[index] ?? refuse(404, 'no such page');

export function remark(examId: string, bookletId: string, level: string): RemarkResult {
  if (level !== 'easy' && level !== 'medium' && level !== 'strict') return refuse(400, `unknown strictness '${level}'`);
  const entry = held(examId);
  const booklet = bookletOf(entry, bookletId);
  const before = booklet.result ?? refuse(400, 'this booklet has not been marked yet — mark it first');
  price(entry, booklet, level);
  entry.exam.strictness.per_booklet[bookletId] = level;
  const after = booklet.result ?? before;
  const changes = before.results.flatMap((old) => {
    const fresh = after.results.find((row) => row.question_number === old.question_number);
    return fresh && Math.abs(fresh.marks - old.marks) > 1e-9 ? [{ question_number: old.question_number, before: old.marks, after: fresh.marks, max_marks: old.max_marks }] : [];
  });
  return { strictness: level, total_before: before.total_marks, total_after: after.total_marks, changes };
}

export function editQuestion(examId: string, bookletId: string, number: string, body: QuestionEdit): BookletResult {
  const booklet = bookletOf(held(examId), bookletId);
  const result = booklet.result ?? refuse(400, 'this booklet has not been marked yet');
  const current = result.results.find((row) => row.question_number === number) ?? refuse(400, `no question ${number}`);
  let next = body.clear_override ? withOverride(current, null) : body.marks !== undefined ? withOverride(current, body.marks) : current;
  if (body.comment !== undefined) next = { ...next, teacher_comment: body.comment };
  if (body.clear_review) next = { ...next, review_reasons: [], needs_review: false };
  booklet.result = withTotals({ ...result, results: result.results.map((row) => (row.question_number === number ? next : row)) });
  syncRef(booklet, booklet.ref.state === 'signed_off' ? 'signed_off' : 'marked');
  return structuredClone(booklet.result);
}

export function signOff(examId: string, bookletId: string): { signed_off: string } {
  const booklet = bookletOf(held(examId), bookletId);
  if (!booklet.result) refuse(400, 'this booklet has not been marked yet');
  booklet.ref.state = 'signed_off';
  return { signed_off: bookletId };
}

export function results(examId: string): ClassResults {
  const entry = held(examId);
  const marked = entry.booklets.filter((row) => row.result);
  const totals = marked.map((row) => row.result?.total_marks ?? 0);
  const means: Record<string, number> = {};
  const medians: Record<string, number> = {};
  for (const question of entry.rubric?.questions ?? []) {
    const marks = marked.map((row) => row.result?.results.find((r) => r.question_number === question.number)?.marks ?? 0);
    means[question.number] = marks.length ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 100) / 100 : 0;
    medians[question.number] = median(marks);
  }
  return structuredClone({
    exam_id: examId,
    total_possible: entry.rubric?.total_marks ?? 0,
    marked: marked.length,
    booklets: entry.booklets.map((row) => row.ref),
    question_medians: medians,
    question_means: means,
    outliers: findOutliers(marked.flatMap((row) => (row.result ? [row.result] : []))),
    duplicate_rolls: {},
    missing_rolls: [],
    mean: totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : 0,
  });
}

const csvCell = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const csvNumber = (value: number): string => String(Number(value.toFixed(6)));

export function exportCsv(examId: string): string {
  const entry = held(examId);
  const numbers = entry.rubric?.questions.map((question) => question.number) ?? [];
  const header = ['Roll', 'Name', ...numbers.map((n) => `Q${n}`), 'Total', 'Out of', 'Strictness', 'Flags'];
  const rollKey = (roll: string): [number, number | string] => (/^\d+$/.test(roll) ? [0, Number(roll)] : [1, roll]);
  const rows = [...entry.booklets]
    .sort((a, b) => {
      const [left, right] = [rollKey(a.ref.student.roll_number ?? ''), rollKey(b.ref.student.roll_number ?? '')];
      return left[0] - right[0] || String(left[1]).localeCompare(String(right[1]), undefined, { numeric: true });
    })
    .map(({ ref, result }) => {
      const identity = [ref.student.roll_number ?? '', ref.student.name ?? ''];
      if (!result) return [...identity, ...numbers.map(() => ''), '', '', '', 'not marked'];
      const review = result.results.filter((row) => row.needs_review).length;
      const marks = numbers.map((n) => {
        const row = result.results.find((r) => r.question_number === n);
        return !row ? '' : row.counted ? csvNumber(row.marks) : '—';
      });
      return [...identity, ...marks, csvNumber(result.total_marks), csvNumber(result.total_possible), result.strictness, review ? `${review} to check` : ''];
    });
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
