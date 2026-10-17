import type {
  OmrAnswerKey,
  OmrKeyQuestion,
  OmrKeySaved,
  OmrMarkingResult,
  OmrOutcome,
  OmrQuestionMark,
  OmrResponse,
  OmrSheetIn,
  OmrSheetResult,
} from '@/types/answer-checker';

import { demoOmrSeed } from './omr-seed';
import { fail } from './rows';

const SCORED: readonly OmrOutcome[] = ['correct', 'incorrect', 'blank', 'multiple', 'out_of_range'];
const OUTCOMES: readonly OmrOutcome[] = [...SCORED, 'not_multiple_choice', 'no_options', 'no_key', 'ambiguous_key', 'alternative_offered'];

const KEYS = new Map<string, OmrAnswerKey>();
const SHEETS = new Map<string, OmrSheetResult[]>();
let sequence = 0;

const refuse = (status: number, code: string, message: string): never => fail(status, code, message);

function heldKey(paperId: string): OmrAnswerKey {
  return KEYS.get(paperId) ?? refuse(409, 'no_answer_key', `paper ${paperId} has no answer key yet; PUT one first`);
}

function markOne(question: OmrKeyQuestion, chosen: number[]): OmrQuestionMark {
  const verdict = (outcome: OmrOutcome, awarded = 0): OmrQuestionMark => ({ n: question.n, outcome, marks: question.marks, awarded, chosen: [...chosen] });
  if (question.answer === null || question.answer < 0 || question.answer >= question.options) return verdict('no_key');
  if (chosen.length === 0) return verdict('blank');
  if (chosen.length > 1) return verdict('multiple');
  const picked = chosen[0] ?? -1;
  if (picked < 0 || picked >= question.options) return verdict('out_of_range');
  return picked === question.answer ? verdict('correct', question.marks) : verdict('incorrect');
}

export function scoreSheet(paperId: string, key: OmrAnswerKey, responses: readonly OmrResponse[]): OmrMarkingResult {
  const answered = new Map<number, number[]>();
  for (const response of responses) {
    const held = answered.get(response.n) ?? [];
    for (const index of response.chosen) if (!held.includes(index)) held.push(index);
    answered.set(response.n, held);
  }
  const ordered = [...key.questions].sort((left, right) => left.n - right.n);
  const rows = ordered.map((question) => markOne(question, answered.get(question.n) ?? []));
  const numbers = new Set(ordered.map((question) => question.n));
  const scored = rows.filter((row) => SCORED.includes(row.outcome));
  const unmarkable = rows.filter((row) => !SCORED.includes(row.outcome));
  return {
    paper_id: paperId,
    set_label: '',
    questions: rows,
    unknown_questions: [...answered.keys()].filter((n) => !numbers.has(n)).sort((left, right) => left - right),
    awarded: rows.reduce((sum, row) => sum + row.awarded, 0),
    markable_marks: scored.reduce((sum, row) => sum + row.marks, 0),
    paper_marks: rows.reduce((sum, row) => sum + row.marks, 0),
    unmarkable_questions: unmarkable.map((row) => row.n),
    unmarkable_marks: unmarkable.reduce((sum, row) => sum + row.marks, 0),
    complete: unmarkable.length === 0,
    tally: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, rows.filter((row) => row.outcome === outcome).length])),
  };
}

function save(paperId: string, key: OmrAnswerKey, sheet: OmrSheetIn, source: OmrSheetResult['source']): OmrSheetResult {
  const rows = SHEETS.get(paperId) ?? [];
  const existing = rows.find((row) => row.roll_number === sheet.roll_number.trim());
  const saved: OmrSheetResult = {
    id: existing?.id ?? (sequence += 1),
    paper_id: paperId,
    roll_number: sheet.roll_number.trim(),
    name: sheet.name.trim(),
    source,
    responses: sheet.responses.map((response) => ({ n: response.n, chosen: [...response.chosen] })),
    result: scoreSheet(paperId, key, sheet.responses),
    scored_at: new Date().toISOString(),
  };
  SHEETS.set(paperId, existing ? rows.map((row) => (row.id === saved.id ? saved : row)) : [...rows, saved]);
  return structuredClone(saved);
}

export function putKey(paperId: string, key: OmrAnswerKey): OmrKeySaved {
  const numbers = key.questions.map((question) => question.n);
  if (numbers.length === 0) refuse(422, 'invalid_input', 'questions: at least one question is needed');
  if (new Set(numbers).size !== numbers.length) refuse(422, 'invalid_input', 'questions: each question number may appear once');
  KEYS.set(paperId, structuredClone(key));
  const stored = SHEETS.get(paperId) ?? [];
  for (const sheet of stored) save(paperId, key, sheet, sheet.source);
  return { key: structuredClone(key), rescored: stored.length };
}

export const getKey = (paperId: string): OmrAnswerKey => structuredClone(heldKey(paperId));

export const postSheet = (paperId: string, sheet: OmrSheetIn): OmrSheetResult => {
  if (!sheet.roll_number.trim()) refuse(422, 'invalid_input', 'roll_number: a sheet needs a roll number');
  return save(paperId, heldKey(paperId), sheet, 'json');
};

export function postImage(paperId: string): OmrSheetResult {
  heldKey(paperId);
  return refuse(501, 'not_built', 'The fixture OMR cannot read an image. Add omr to DEV_LIVE_SERVICES and run dev-backends/omr to read scanned sheets.');
}

export const listSheets = (paperId: string): { sheets: OmrSheetResult[] } => ({ sheets: structuredClone(SHEETS.get(paperId) ?? []) });

export function clearSheets(paperId: string): { deleted: number } {
  const deleted = SHEETS.get(paperId)?.length ?? 0;
  SHEETS.delete(paperId);
  return { deleted };
}

export function seedDemoSheets(): void {
  const seed = demoOmrSeed();
  if (!seed) return;
  putKey(seed.paperId, seed.key);
  for (const sheet of seed.sheets) postSheet(seed.paperId, sheet);
}

seedDemoSheets();
