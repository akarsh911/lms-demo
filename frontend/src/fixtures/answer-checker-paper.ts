import { checkerQuestionType, setQuestions } from '@/lib/answer-checker/paper';
import type { KeyPoint, OmrAnswerKey, OmrSheetRead, PaperArtefacts, Rubric, RubricQuestion } from '@/types/answer-checker';
import type { Paper, PaperSummary } from '@/types/papersetter';
import type { EnrichedPassage } from '@/types/retrieval';

import { chance, type Objectives } from './answer-checker-marking';
import { CHECKER_PAPERS, MARKING_SCHEMES, type MarkingScheme, type SchemePoint, type SchemeQuestion } from './data/answer-checker';
import { SEATED } from './data/enrollment';
import { STUDENTS } from './data/people';
import { SETTER_PAPERS } from './data/papersetter';
import { CURRENT_SECTIONS } from './data/structure';
import { notFound } from './rows';

export interface ClassMember {
  studentId: string;
  name: string;
  roll: string;
}

const DEMO_CLASS: readonly ClassMember[] = [
  { studentId: '', name: 'Aman Kumar', roll: '07' },
  { studentId: '', name: 'Priya Sharma', roll: '12' },
  { studentId: '', name: 'Ravi Singh', roll: '19' },
  { studentId: '', name: 'Simran Kaur', roll: '23' },
  { studentId: '', name: 'Neha Gupta', roll: '31' },
];

const OPTION_TYPES = new Set(['mcq', 'assertion_reason']);
const STATEMENT_OPTIONS = ['the first statement', 'the second statement', 'the third statement', 'the fourth statement'];
const POINT_TEXTS = [
  'states the central idea correctly',
  'uses the correct terms',
  'gives a relevant example',
  'explains the reason or the mechanism',
  'reaches a clear conclusion',
  'presents the working or the diagram neatly',
];

const summaryOf = ({ sections: _sections, ...summary }: Paper): PaperSummary => summary;

export const extraSetterPapers = (): PaperSummary[] => CHECKER_PAPERS.map(summaryOf);

export const extraSetterPaper = (paperId: string): Paper | undefined => CHECKER_PAPERS.find((row) => row.paper_id === paperId);

const knownPaper = (paperId: string): Paper | undefined =>
  extraSetterPaper(paperId) ?? SETTER_PAPERS.find((row) => row.paper_id === paperId);

function pointsFor(marks: number): SchemePoint[] {
  const whole = Math.floor(marks);
  const points = Array.from({ length: whole }, (_, index) => ({ text: POINT_TEXTS[index % POINT_TEXTS.length] ?? 'answers the question', marks: 1 }));
  const rest = marks - whole;
  if (rest > 0) points.push({ text: POINT_TEXTS[whole % POINT_TEXTS.length] ?? 'answers the question', marks: rest });
  return points;
}

function generatedScheme(paper: Paper): MarkingScheme {
  const questions = setQuestions(paper).map<SchemeQuestion>((question) => {
    if (!OPTION_TYPES.has(question.type)) {
      return { n: question.n, points: pointsFor(question.marks), model_answer: '' };
    }
    const answer = Math.floor(chance('key', paper.paper_id, question.n) * STATEMENT_OPTIONS.length);
    const keyed = `(${String.fromCharCode(97 + answer)}) ${STATEMENT_OPTIONS[answer] ?? ''}`;
    return { n: question.n, points: [{ text: keyed, marks: question.marks }], options: STATEMENT_OPTIONS, answer, model_answer: keyed };
  });
  return { paper_id: paper.paper_id, book: '', questions, generated: true };
}

export const schemeFor = (paper: Paper): MarkingScheme =>
  MARKING_SCHEMES.find((row) => row.paper_id === paper.paper_id) ?? generatedScheme(paper);

export function objectivesFor(paper: Paper): Objectives {
  const out = new Map<string, { options: readonly string[]; answer: number }>();
  for (const question of schemeFor(paper).questions) {
    if (question.options && question.answer !== undefined) out.set(String(question.n), { options: question.options, answer: question.answer });
  }
  return out;
}

export function objectiveKey(paper: Paper): { key: OmrAnswerKey; generated: boolean } {
  const scheme = schemeFor(paper);
  const objectives = objectivesFor(paper);
  return {
    generated: Boolean(scheme.generated),
    key: {
      questions: setQuestions(paper).map((question) => {
        const objective = objectives.get(String(question.n));
        return { n: question.n, marks: question.marks, options: objective?.options.length ?? 4, answer: objective?.answer ?? null };
      }),
    },
  };
}

export function classRoster(klass: string): readonly ClassMember[] {
  const section = CURRENT_SECTIONS.find((row) => row.code === klass);
  if (!section) return DEMO_CLASS;
  const names = new Map(STUDENTS.map((row) => [row.id, row.edges?.person?.display_name ?? '']));
  return SEATED.filter((row) => row.section_id === section.id && row.roll_number)
    .map((row) => ({ studentId: row.student_id ?? '', name: names.get(row.student_id ?? '') ?? '', roll: row.roll_number ?? '' }))
    .filter((row) => row.name !== '')
    .sort((left, right) => left.roll.localeCompare(right.roll, undefined, { numeric: true }));
}

export function paperArtefacts(paperId: string): PaperArtefacts {
  if (!knownPaper(paperId)) return notFound('paper');
  const files = [
    { name: 'paper.pdf', label: 'Question paper' },
    { name: 'answer-key.pdf', label: 'Answer key and marking scheme' },
  ];
  return { paper_id: paperId, artefacts: files.map((file) => ({ ...file, url: `/api/v1/papers/${paperId}/files/${file.name}` })) };
}

export function referencePassages(paperId: string, n: number): EnrichedPassage[] | null {
  const scheme = MARKING_SCHEMES.find((row) => row.paper_id === paperId);
  const reference = scheme?.questions.find((row) => row.n === n)?.reference;
  if (!scheme || !reference) return null;
  return [
    {
      chunk_id: `${paperId}:${n}`,
      text: `${reference.section_path} ${reference.text}`,
      verbatim_text: reference.text,
      page: reference.page,
      role: 'exposition',
      score: 1,
      kind: 'text',
      section_id: null,
      section_path: reference.section_path,
      citation: {
        document_title: scheme.book,
        render: `${scheme.book}, p.${reference.page}`,
        page_range: [reference.page, reference.page],
        paragraph_range: null,
        deeplink: null,
        confidence: 1,
      },
    },
  ];
}

function keyPoints(scheme: MarkingScheme, n: number): KeyPoint[] {
  const question = scheme.questions.find((row) => row.n === n);
  return (question?.points ?? []).map((point, index) => ({
    id: `p${n}${String.fromCharCode(97 + index)}`,
    text: point.text,
    marks: point.marks,
    required: true,
    aliases: point.aliases ?? [],
  }));
}

export function compiledRubric(paper: Paper, examName: string): Rubric {
  const scheme = schemeFor(paper);
  const questions = setQuestions(paper).map<RubricQuestion>((question) => ({
    number: String(question.n),
    section: question.section,
    text: question.text,
    type: checkerQuestionType(question.type),
    max_marks: question.marks,
    key_points: keyPoints(scheme, question.n),
    model_answer: scheme.questions.find((row) => row.n === question.n)?.model_answer ?? '',
    accepts_any_valid_method: true,
    numeric_answer: null,
    numeric_tolerance: 0,
    units: null,
    format_rules: { word_limit: null, min_words: null, must_list_n: null, require_units: false, require_diagram: false, expected_language: null },
    choice_group: null,
    language: null,
    teacher_edited: false,
  }));
  return {
    id: `rb${paper.paper_id.replace(/[^a-z0-9]/gi, '').slice(0, 10)}`,
    version: 1,
    exam_name: examName,
    subject: paper.subject ?? '',
    languages: ['english'],
    total_marks: questions.reduce((sum, question) => sum + question.max_marks, 0),
    questions,
    choice_groups: [],
    general_instructions: 'All questions are compulsory.',
    compiled_from: { question_paper: 'question_paper.pdf', answer_key: 'answer_key.pdf' },
    teacher_approved: false,
    warnings: scheme.generated ? ['The answer key gave only general marking points; read them against what you taught before approving.'] : [],
  };
}

export function rubricAudit(rubric: Rubric): string[] {
  const objective = new Set(['mcq', 'true_false', 'one_word', 'fill_blank']);
  const audit = rubric.questions.flatMap((question) => {
    const total = question.key_points.reduce((sum, point) => sum + point.marks, 0);
    if (question.key_points.length === 0 && !objective.has(question.type)) {
      return [`Q${question.number} has no key points, so there is nothing to award marks against. Add them, or it will always go to you unmarked.`];
    }
    if (question.key_points.length > 0 && Math.abs(total - question.max_marks) > 1e-6) {
      return [`Q${question.number}: key points total ${total} but the question is worth ${question.max_marks}.`];
    }
    return [];
  });
  return [...rubric.warnings, ...audit];
}

export function bubbleSheets(paper: Paper, klass: string): OmrSheetRead[] {
  const objectives = objectivesFor(paper);
  return classRoster(klass)
    .filter((member) => chance('omr-absent', paper.paper_id, member.roll) > 0.06)
    .map((member) => {
      const ability = 0.45 + chance('ability', member.name) * 0.5;
      const responses = [...objectives.entries()].map(([number, objective]) => {
        const roll = chance('omr', paper.paper_id, member.name, number);
        const n = Number(number);
        if (roll > 0.97) return { n, chosen: [] };
        if (roll > 0.955) return { n, chosen: [objective.answer, (objective.answer + 1) % objective.options.length] };
        const right = roll < ability + 0.1;
        return { n, chosen: [right ? objective.answer : (objective.answer + 1 + Math.floor(roll * 10)) % objective.options.length] };
      });
      return { roll_number: member.roll, name: member.name, responses };
    });
}
