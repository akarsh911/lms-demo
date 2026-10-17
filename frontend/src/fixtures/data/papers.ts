import type { BlueprintConstraintRow, BlueprintRow, BlueprintSectionRow, CognitiveScheme } from '@/types/blueprints';
import type { GenerationRunRow, PaperQuestionRow, PaperRow, PaperSectionRow } from '@/types/papers';
import type { QuestionRow, QuestionVersionRow } from '@/types/questions';

import { seedId } from '../ids';
import { TEACHER_COUNT } from './people';
import { CURRENT_SESSION, PAST_SESSION, subjectByCode } from './structure';

const GRADE_TEN = seedId('grade', 10);
const GRADE_NINE = seedId('grade', 9);
const MATH = subjectByCode('MATH').id;
const SCIENCE = subjectByCode('SCI').id;

// The first non-teaching staff member, who is the `admin` fixture user's person.
export const PAPER_SETTER = seedId('person', 'staff', TEACHER_COUNT);

const blueprintId = (key: string): string => seedId('blueprint', key);
const bpSectionId = (key: string): string => seedId('blueprint-section', key);
const paperId = (key: string): string => seedId('paper', key);
const paperSectionId = (key: string): string => seedId('paper-section', key);
const questionId = (key: string): string => seedId('question', key);
const versionId = (key: string, n: number): string => seedId('question-version', key, n);
const runId = (key: string): string => seedId('paper-run', key);

const COMPETENCY_BANDS: CognitiveScheme = {
  name: 'CBSE 2024 competency bands',
  bands: [
    { key: 'competency', label: 'Competency based', weight_percent: 50 },
    { key: 'objective', label: 'Objective type', weight_percent: 20 },
    { key: 'short_long', label: 'Short and long answer', weight_percent: 30 },
  ],
};

export const PAPER_RUNS: GenerationRunRow[] = [
  {
    id: runId('math-1'),
    blueprint_id: blueprintId('math-x'),
    academic_session_id: CURRENT_SESSION.id,
    generation_method: 'hybrid',
    algorithm: 'weighted-sampling',
    model_version: 'claude-opus-5',
    status: 'completed',
    requested_by: PAPER_SETTER,
    started_at: '2026-09-12T04:30:00Z',
    completed_at: '2026-09-12T04:31:48Z',
    prompt_hash: 'sha256:6b1f0c2d9a',
    input_tokens: 4820,
    output_tokens: 1960,
    cost_amount: 0.4127,
    cost_currency: 'USD',
    created_at: '2026-09-12T04:30:00Z',
  },
  {
    id: runId('sci-1'),
    blueprint_id: blueprintId('reusable-science'),
    academic_session_id: CURRENT_SESSION.id,
    generation_method: 'ai',
    model_version: 'claude-opus-5',
    status: 'failed',
    requested_by: PAPER_SETTER,
    started_at: '2026-09-14T06:00:00Z',
    completed_at: '2026-09-14T06:00:22Z',
    failure_reason: 'the bank held four questions at three marks and the pattern asked for eight',
    created_at: '2026-09-14T06:00:00Z',
  },
];

// One per shape the screens branch on: session-bound, reusable (no session), and archived with empty weighting.
export const BLUEPRINTS: BlueprintRow[] = [
  {
    id: blueprintId('math-x'),
    academic_session_id: CURRENT_SESSION.id,
    grade_level_id: GRADE_TEN,
    subject_id: MATH,
    code: 'MATH-X-TERM',
    name: 'Class 10 Mathematics, term paper',
    description: 'The shape every Class 10 term paper in Mathematics follows.',
    total_marks: 80,
    duration_minutes: 180,
    version: 2,
    status: 'published',
    cognitive_scheme: COMPETENCY_BANDS,
    unit_weightage: {
      units: [
        { key: 'algebra', label: 'Algebra', weight_percent: 25, marks: 20 },
        { key: 'geometry', label: 'Geometry', weight_percent: 25, marks: 20 },
        { key: 'trigonometry', label: 'Trigonometry', weight_percent: 15, marks: 12 },
        { key: 'statistics', label: 'Statistics and probability', weight_percent: 35, marks: 28 },
      ],
    },
    created_at: '2026-04-02T05:00:00Z',
  },
  {
    id: blueprintId('reusable-science'),
    grade_level_id: GRADE_NINE,
    subject_id: SCIENCE,
    code: 'SCI-IX-UNIT',
    name: 'Class 9 Science, unit test',
    description: 'Belongs to no year, so next year can build from it unchanged.',
    total_marks: 25,
    duration_minutes: 60,
    version: 1,
    status: 'published',
    cognitive_scheme: {
      name: 'Bloom revised, six levels',
      bands: [
        { key: 'remember', label: 'Remember', min_percent: 10, max_percent: 20 },
        { key: 'understand', label: 'Understand', min_percent: 20, max_percent: 30 },
        { key: 'apply', label: 'Apply', min_percent: 25, max_percent: 40 },
        { key: 'analyse', label: 'Analyse', min_percent: 10, max_percent: 25 },
        { key: 'evaluate', label: 'Evaluate', max_percent: 15 },
        { key: 'create', label: 'Create', max_percent: 10 },
      ],
    },
    created_at: '2026-03-18T05:00:00Z',
  },
  {
    id: blueprintId('empty-weighting'),
    academic_session_id: PAST_SESSION.id,
    grade_level_id: GRADE_TEN,
    subject_id: SCIENCE,
    code: 'SCI-X-TERM',
    name: 'Class 10 Science, term paper',
    total_marks: 80,
    duration_minutes: 180,
    version: 1,
    status: 'archived',
    cognitive_scheme: COMPETENCY_BANDS,
    unit_weightage: { units: [] },
    created_at: '2025-04-08T05:00:00Z',
  },
];

export const BLUEPRINT_SECTIONS: BlueprintSectionRow[] = [
  {
    id: bpSectionId('a'),
    blueprint_id: blueprintId('math-x'),
    name: 'Section A, objective',
    section_code: 'A',
    position: 1,
    question_count: 20,
    marks_per_question: 1,
    total_marks: 20,
    duration_minutes: 30,
  },
  {
    id: bpSectionId('b'),
    blueprint_id: blueprintId('math-x'),
    name: 'Section B, short answer',
    section_code: 'B',
    position: 2,
    question_count: 6,
    marks_per_question: 2,
    total_marks: 12,
  },
  {
    id: bpSectionId('c'),
    blueprint_id: blueprintId('reusable-science'),
    name: 'One part only',
    section_code: 'A',
    position: 1,
    question_count: 10,
    total_marks: 25,
  },
];

export const BLUEPRINT_CONSTRAINTS: BlueprintConstraintRow[] = [
  {
    id: seedId('blueprint-constraint', 1),
    blueprint_section_id: bpSectionId('a'),
    constraint_type: 'type',
    value_json: { values: ['mcq', 'true_false'] },
  },
  {
    id: seedId('blueprint-constraint', 2),
    blueprint_section_id: bpSectionId('a'),
    constraint_type: 'difficulty',
    value_json: { values: ['easy', 'medium'] },
    min_value: 0,
    max_value: 60,
  },
  {
    id: seedId('blueprint-constraint', 3),
    blueprint_section_id: bpSectionId('b'),
    constraint_type: 'topic',
    value_json: { units: ['algebra', 'geometry'] },
  },
];

// A draft still being set, a published paper (which refuses edits), and an approved one from last year.
export const PAPERS: PaperRow[] = [
  {
    id: paperId('math-draft'),
    academic_session_id: CURRENT_SESSION.id,
    blueprint_id: blueprintId('math-x'),
    generation_run_id: runId('math-1'),
    paper_code: 'MATH-X-T1',
    title: 'Class 10 Mathematics, term one',
    version: 1,
    status: 'draft',
    total_marks: 80,
    duration_minutes: 180,
    created_at: '2026-09-12T04:32:00Z',
  },
  {
    id: paperId('sci-published'),
    academic_session_id: CURRENT_SESSION.id,
    blueprint_id: blueprintId('reusable-science'),
    paper_code: 'SCI-IX-U1',
    title: 'Class 9 Science, unit test one',
    version: 1,
    status: 'published',
    total_marks: 25,
    duration_minutes: 60,
    approved_by: PAPER_SETTER,
    approved_at: '2026-08-30T09:15:00Z',
    created_at: '2026-08-21T05:00:00Z',
  },
  {
    id: paperId('sci-old'),
    academic_session_id: PAST_SESSION.id,
    paper_code: 'SCI-X-T2',
    title: 'Class 10 Science, term two',
    version: 1,
    status: 'approved',
    total_marks: 80,
    created_at: '2025-11-02T05:00:00Z',
  },
];

export const PAPER_SECTIONS: PaperSectionRow[] = [
  {
    id: paperSectionId('a'),
    paper_id: paperId('math-draft'),
    name: 'Section A',
    code: 'A',
    position: 1,
    instructions: 'All questions are compulsory. Each carries one mark.',
    created_at: '2026-09-12T04:32:00Z',
  },
  {
    id: paperSectionId('b'),
    paper_id: paperId('math-draft'),
    name: 'Section B',
    code: 'B',
    position: 2,
    created_at: '2026-09-12T04:32:00Z',
  },
  {
    id: paperSectionId('sci'),
    paper_id: paperId('sci-published'),
    name: 'One part only',
    code: 'A',
    position: 1,
    created_at: '2026-08-21T05:00:00Z',
  },
];

// Position 3 is deliberately missing, so a gap in numbering is something the screen has to draw.
export const PAPER_QUESTIONS: PaperQuestionRow[] = [
  {
    id: seedId('paper-question', 'a1'),
    paper_section_id: paperSectionId('a'),
    question_id: questionId('algebra-1'),
    question_version_id: versionId('algebra-1', 2),
    question_number: '1',
    marks: 1,
    position: 1,
  },
  {
    id: seedId('paper-question', 'a2'),
    paper_section_id: paperSectionId('a'),
    question_id: questionId('geometry-1'),
    question_version_id: versionId('geometry-1', 1),
    question_number: '2',
    marks: 1,
    position: 2,
  },
  {
    id: seedId('paper-question', 'a4'),
    paper_section_id: paperSectionId('a'),
    question_id: questionId('stats-1'),
    question_version_id: versionId('stats-1', 1),
    question_number: '4',
    marks: 1,
    position: 4,
    variant_group: 'set-two',
  },
  {
    id: seedId('paper-question', 'sci-1'),
    paper_section_id: paperSectionId('sci'),
    question_id: questionId('science-1'),
    question_version_id: versionId('science-1', 1),
    question_number: '1',
    marks: 5,
    position: 1,
  },
];

export const QUESTIONS: QuestionRow[] = [
  {
    id: questionId('algebra-1'),
    canonical_key: 'MATH.X.ALG.LINEAR.001',
    subject_id: MATH,
    grade_level_id: GRADE_TEN,
    question_type: 'mcq',
    status: 'published',
    difficulty_score: 32,
    difficulty_label: 'easy',
    bloom_level: 'apply',
    language: 'en',
    estimated_seconds: 60,
    source_type: 'original',
    created_by: PAPER_SETTER,
  },
  {
    id: questionId('geometry-1'),
    canonical_key: 'MATH.X.GEO.CIRCLE.004',
    subject_id: MATH,
    grade_level_id: GRADE_TEN,
    question_type: 'short_answer',
    status: 'reviewed',
    difficulty_label: 'medium',
    bloom_level: 'analyse',
    language: 'en',
    source_type: 'pyq',
    created_by: PAPER_SETTER,
  },
  {
    id: questionId('stats-1'),
    canonical_key: 'MATH.X.STA.MEAN.011',
    subject_id: MATH,
    grade_level_id: GRADE_TEN,
    question_type: 'numeric',
    status: 'published',
    difficulty_label: 'hard',
    source_type: 'ai',
    created_by: PAPER_SETTER,
  },
  {
    id: questionId('science-1'),
    canonical_key: 'SCI.IX.MOTION.002',
    subject_id: SCIENCE,
    grade_level_id: GRADE_NINE,
    question_type: 'long_answer',
    status: 'published',
    difficulty_label: 'medium',
    source_type: 'original',
    created_by: PAPER_SETTER,
  },
];

export interface QuestionVersionSeed extends QuestionVersionRow {
  answer_data_json?: Record<string, unknown>;
  created_by?: string;
}

const version = (
  key: string,
  n: number,
  stem: string,
  status: QuestionVersionRow['status'],
  answer: Record<string, unknown>,
): QuestionVersionSeed => ({
  id: versionId(key, n),
  question_id: questionId(key),
  version_number: n,
  stem,
  status,
  answer_data_json: answer,
  created_by: PAPER_SETTER,
});

export const QUESTION_VERSIONS: QuestionVersionSeed[] = [
  version('algebra-1', 1, 'Solve for x: 2x + 3 = 11.', 'reviewed', { correct: 'x = 4' }),
  version('algebra-1', 2, 'Solve for x: 2x + 3 = 11. Show every step.', 'published', {
    correct: 'x = 4',
    working: 'subtract 3, divide by 2',
  }),
  version('geometry-1', 1, 'Prove that equal chords of a circle subtend equal angles at the centre.', 'reviewed', {
    marking_scheme: [1, 1, 2],
  }),
  version(
    'stats-1',
    1,
    'The mean of twenty observations is 18. One observation, 25, was wrong and should have been 35. Find the corrected mean.',
    'published',
    { correct: 18.5 },
  ),
  version('science-1', 1, 'Derive the three equations of motion for uniformly accelerated motion.', 'published', {
    marking_scheme: [2, 2, 1],
  }),
];
