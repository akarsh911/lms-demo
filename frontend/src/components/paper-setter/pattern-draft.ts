import type {
  BlueprintShape,
  SectionIn,
  TemplateCreateRequest,
  TemplateDetail,
  TemplateSummary,
  TemplateUpdateRequest,
} from './contract';

export const QUESTION_TYPES = [
  'mcq',
  'assertion_reason',
  'true_false',
  'fill_blank',
  'one_word',
  'match_following',
  'very_short',
  'short',
  'differentiate',
  'numerical',
  'long',
  'case_based',
  'diagram_label',
  'data_interpretation',
  'map_work',
  'source_based',
  'code_trace',
] as const;

export type PaperQuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<PaperQuestionType, string> = {
  mcq: 'Multiple choice',
  assertion_reason: 'Assertion and reason',
  true_false: 'True or false',
  fill_blank: 'Fill in the blank',
  one_word: 'One word',
  match_following: 'Match the following',
  very_short: 'Very short answer',
  short: 'Short answer',
  differentiate: 'Differentiate between',
  numerical: 'Numerical',
  long: 'Long answer',
  case_based: 'Case based',
  diagram_label: 'Label a diagram',
  data_interpretation: 'Read a table or data set',
  map_work: 'Map work',
  source_based: 'Source based',
  code_trace: 'Trace the code',
};

export const PAPER_SERVICE_DURATION_MIN = 180;
export const PAPER_SERVICE_PAGES = 4;
export const PAPER_SERVICE_PASS_MARK_PCT = 33;
export const PAPER_SERVICE_PERSONA = 'builder';

export const NEEDS_A_NAME =
  'A pattern needs a name — it is what you will pick it by later. The paper service ' +
  'refuses one without it, so this screen does not send it.';

export const NEEDS_A_SECTION =
  'A pattern with no sections would print an empty paper, so the paper service refuses ' +
  'it. Add a section before saving.';

export const NEEDS_SOME_QUESTIONS =
  'A pattern with no questions in it would set an empty paper, and this one is about to ' +
  'set yours. Add a question type to a section.';

export const NEEDS_A_LABEL =
  'A section is printed under this label, so it needs one. A and B, the way a paper reads.';

export const COUNT_IS_AT_LEAST_ONE = 'A whole number of questions, one or more.';

export const MARKS_ABOVE_ZERO = 'Marks per question, above zero. Half marks are allowed.';

export const ATTEMPT_ANY_WITHIN_SECTION =
  'A section cannot offer a choice of more questions than it prints.';

export const DUPLICATE_SECTION_LABEL =
  'Two sections carry this label, so the printed paper would have two of the same section.';

export const MINUTES_ABOVE_ZERO = 'A whole number of minutes, above zero, or leave it empty.';

export const PAGES_ABOVE_ZERO = 'A page budget above zero, or leave it empty.';

export const PASS_MARK_RANGE = 'A pass mark between 1 and 100 percent, or leave it empty.';

export const DERIVED_MARKS_NOTE =
  'The marks and the question count are added up from the sections and cannot be typed. ' +
  'They are the same arithmetic the paper service does, so the figure here and the figure ' +
  'on the saved pattern are one number rather than two that can disagree.';

export const TYPED_INPUTS_NOTE =
  'The minutes, the pages and the pass mark are not in the question mix, so nothing can ' +
  'work them out from it. They are asked for because they are genuinely yours to decide.';

export const CHOICE_SPLITS_MARKS =
  'A section offering a choice is counted at the marks a student attempts, while every ' +
  'question it declares is still written and printed. That is why the two figures differ, ' +
  'and the paper runs to the printed one.';

export const MIX_IS_PARSED_BY_THE_SERVICE =
  'A mix is turned into sections by the paper service, which owns that grammar. The ' +
  'pattern is therefore saved first and then opens here as sections you can adjust — ' +
  'and the marks come out of what you typed rather than being asked for twice.';

export const NOT_WRITABLE =
  'This is a pattern your school ships with. It can be chosen for this paper but not ' +
  'changed here: its id means the same thing to every paper already set from it. Create ' +
  'a new pattern from it instead, which starts from this shape under a name of your own.';

export const PRESET_SEEDS_THE_SECTIONS =
  'Starting from a pattern copies its sections in so you can adjust them. Nothing is ' +
  'written back to the pattern you started from.';

interface Parsed {
  value: number;
  ok: boolean;
  blank: boolean;
}

function parseWhole(text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed === '') return { value: 0, ok: true, blank: true };
  if (!/^\d+$/.test(trimmed)) return { value: 0, ok: false, blank: false };
  return { value: Number(trimmed), ok: true, blank: false };
}

function parseDecimal(text: string): Parsed {
  const trimmed = text.trim();
  if (trimmed === '') return { value: 0, ok: true, blank: true };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { value: 0, ok: false, blank: false };
  const value = Number(trimmed);
  return { value, ok: Number.isFinite(value), blank: false };
}

function wholeOrZero(text: string): number {
  const parsed = parseWhole(text);
  return parsed.ok ? parsed.value : 0;
}

function decimalOrZero(text: string): number {
  const parsed = parseDecimal(text);
  return parsed.ok ? parsed.value : 0;
}

function fromNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '';
  if (value === 0) return '';
  return String(value);
}

export interface ItemDraft {
  key: string;
  questionType: string;
  marks: string;
  count: string;
}

export interface SectionDraft {
  key: string;
  id: string;
  title: string;
  instruction: string;
  items: ItemDraft[];
  twoColumn: boolean;
  internalChoice: string;
  attemptAny: string;
}

export interface PatternDraft {
  name: string;
  subject: string;
  classLabel: string;
  durationMin: string;
  pages: string;
  passMarkPct: string;
  personaId: string;
  sections: SectionDraft[];
}

let keySeed = 0;

export function nextKey(prefix: string): string {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

export function nextSectionId(existing: readonly string[]): string {
  const taken = new Set(existing.map((id) => id.trim().toUpperCase()));
  for (let round = 1; round < 100; round += 1) {
    for (let letter = 0; letter < 26; letter += 1) {
      const candidate =
        String.fromCharCode(65 + letter) + (round === 1 ? '' : String(round));
      if (!taken.has(candidate)) return candidate;
    }
  }
  return '';
}

export function newItem(questionType: string): ItemDraft {
  return { key: nextKey('item'), questionType, marks: '1', count: '1' };
}

export function emptySection(existing: readonly string[]): SectionDraft {
  return {
    key: nextKey('section'),
    id: nextSectionId(existing),
    title: '',
    instruction: '',
    items: [],
    twoColumn: false,
    internalChoice: '',
    attemptAny: '',
  };
}

export function blankDraft(classLabel = ''): PatternDraft {
  return {
    name: '',
    subject: '',
    classLabel,
    durationMin: String(PAPER_SERVICE_DURATION_MIN),
    pages: String(PAPER_SERVICE_PAGES),
    passMarkPct: String(PAPER_SERVICE_PASS_MARK_PCT),
    personaId: PAPER_SERVICE_PERSONA,
    sections: [emptySection([])],
  };
}

export function draftFromBlueprint(
  blueprint: BlueprintShape,
  overrides: { name?: string; classLabel?: string } = {},
): PatternDraft {
  return {
    name: overrides.name ?? blueprint.name ?? '',
    subject: blueprint.subject ?? '',
    classLabel: overrides.classLabel ?? blueprint.class_label ?? '',
    durationMin: fromNumber(blueprint.duration_min),
    pages: fromNumber(blueprint.page_budget),
    passMarkPct: fromNumber(blueprint.pass_mark_pct),
    personaId: blueprint.persona_id ?? PAPER_SERVICE_PERSONA,
    sections: (blueprint.sections ?? []).map((section) => ({
      key: nextKey('section'),
      id: section.id ?? '',
      title: section.title ?? '',
      instruction: section.instruction ?? '',
      twoColumn: Boolean(section.two_column),
      internalChoice: fromNumber(section.internal_choice),
      attemptAny: fromNumber(section.attempt_any),
      items: (section.items ?? []).map((item) => ({
        key: nextKey('item'),
        questionType: item.question_type,
        marks: String(item.marks),
        count: String(item.count),
      })),
    })),
  };
}

export function draftFromTemplate(
  detail: TemplateDetail,
  overrides: { name?: string; classLabel?: string } = {},
): PatternDraft {
  return draftFromBlueprint(detail.blueprint, {
    name: overrides.name ?? detail.name,
    classLabel: overrides.classLabel,
  });
}

export function sectionOf(section: SectionDraft): SectionIn {
  return {
    id: section.id.trim(),
    title: section.title.trim(),
    instruction: section.instruction.trim(),
    two_column: section.twoColumn,
    internal_choice: wholeOrZero(section.internalChoice),
    attempt_any: wholeOrZero(section.attemptAny),
    items: section.items.map((item) => ({
      question_type: item.questionType,
      marks: decimalOrZero(item.marks),
      count: wholeOrZero(item.count),
    })),
  };
}

export function sectionsOf(draft: PatternDraft): SectionIn[] {
  return draft.sections.map(sectionOf);
}

export interface PatternTotals {
  marks: number;
  printedMarks: number;
  questionCount: number;
  splitsMarks: boolean;
}

export function sectionTotals(section: SectionIn): PatternTotals {
  const printedMarks = section.items.reduce(
    (sum, item) => sum + item.marks * item.count,
    0,
  );
  const questionCount = section.items.reduce((sum, item) => sum + item.count, 0);
  const perQuestion = section.items[0]?.marks ?? 0;
  const marks =
    section.attempt_any > 0 ? perQuestion * section.attempt_any : printedMarks;

  return {
    marks,
    printedMarks,
    questionCount,
    splitsMarks: section.attempt_any > 0 && marks !== printedMarks,
  };
}

export function blueprintTotals(sections: readonly SectionIn[]): PatternTotals {
  const each = sections.map(sectionTotals);
  return {
    marks: each.reduce((sum, totals) => sum + totals.marks, 0),
    printedMarks: each.reduce((sum, totals) => sum + totals.printedMarks, 0),
    questionCount: each.reduce((sum, totals) => sum + totals.questionCount, 0),
    splitsMarks: each.some((totals) => totals.splitsMarks),
  };
}

export function draftTotals(draft: PatternDraft): PatternTotals {
  return blueprintTotals(sectionsOf(draft));
}

export type DraftField =
  | 'name'
  | 'sections'
  | 'sectionId'
  | 'marks'
  | 'count'
  | 'attemptAny'
  | 'internalChoice'
  | 'durationMin'
  | 'pages'
  | 'passMarkPct';

export interface DraftProblem {
  field: DraftField;
  sectionKey?: string;
  itemKey?: string;
  message: string;
}

export function validateDraft(draft: PatternDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];

  if (draft.name.trim() === '') {
    problems.push({ field: 'name', message: NEEDS_A_NAME });
  }

  if (draft.sections.length === 0) {
    problems.push({ field: 'sections', message: NEEDS_A_SECTION });
  } else if (draftTotals(draft).questionCount === 0) {
    problems.push({ field: 'sections', message: NEEDS_SOME_QUESTIONS });
  }

  const labelCounts = new Map<string, number>();
  for (const section of draft.sections) {
    const label = section.id.trim().toUpperCase();
    if (label !== '') labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  for (const section of draft.sections) {
    const label = section.id.trim();
    if (label === '') {
      problems.push({ field: 'sectionId', sectionKey: section.key, message: NEEDS_A_LABEL });
    } else if ((labelCounts.get(label.toUpperCase()) ?? 0) > 1) {
      problems.push({
        field: 'sectionId',
        sectionKey: section.key,
        message: DUPLICATE_SECTION_LABEL,
      });
    }

    for (const item of section.items) {
      const marks = parseDecimal(item.marks);
      if (!marks.ok || marks.blank || marks.value <= 0) {
        problems.push({
          field: 'marks',
          sectionKey: section.key,
          itemKey: item.key,
          message: MARKS_ABOVE_ZERO,
        });
      }
      const count = parseWhole(item.count);
      if (!count.ok || count.blank || count.value < 1) {
        problems.push({
          field: 'count',
          sectionKey: section.key,
          itemKey: item.key,
          message: COUNT_IS_AT_LEAST_ONE,
        });
      }
    }

    const attemptAny = parseWhole(section.attemptAny);
    if (!attemptAny.ok) {
      problems.push({
        field: 'attemptAny',
        sectionKey: section.key,
        message: COUNT_IS_AT_LEAST_ONE,
      });
    } else if (!attemptAny.blank && attemptAny.value > 0) {
      const printed = section.items.reduce((sum, item) => sum + wholeOrZero(item.count), 0);
      if (attemptAny.value > printed) {
        problems.push({
          field: 'attemptAny',
          sectionKey: section.key,
          message: ATTEMPT_ANY_WITHIN_SECTION,
        });
      }
    }

    const internalChoice = parseWhole(section.internalChoice);
    if (!internalChoice.ok) {
      problems.push({
        field: 'internalChoice',
        sectionKey: section.key,
        message: COUNT_IS_AT_LEAST_ONE,
      });
    }
  }

  const minutes = parseWhole(draft.durationMin);
  if (!minutes.ok || (!minutes.blank && minutes.value < 1)) {
    problems.push({ field: 'durationMin', message: MINUTES_ABOVE_ZERO });
  }

  const pages = parseDecimal(draft.pages);
  if (!pages.ok || (!pages.blank && pages.value <= 0)) {
    problems.push({ field: 'pages', message: PAGES_ABOVE_ZERO });
  }

  const pass = parseDecimal(draft.passMarkPct);
  if (!pass.ok || (!pass.blank && (pass.value < 1 || pass.value > 100))) {
    problems.push({ field: 'passMarkPct', message: PASS_MARK_RANGE });
  }

  return problems;
}

export function problemFor(
  problems: readonly DraftProblem[],
  where: { field: DraftField; sectionKey?: string; itemKey?: string },
): string | undefined {
  return problems.find(
    (problem) =>
      problem.field === where.field &&
      problem.sectionKey === where.sectionKey &&
      problem.itemKey === where.itemKey,
  )?.message;
}

export function draftIsSavable(draft: PatternDraft): boolean {
  return validateDraft(draft).length === 0;
}

export class PatternDraftError extends Error {}

function refuseUnsavable(draft: PatternDraft): void {
  const problems = validateDraft(draft);
  if (problems.length === 0) return;
  throw new PatternDraftError(problems[0]!.message);
}

function typedFields(draft: PatternDraft): {
  subject?: string;
  class_label?: string;
  duration_min?: number;
  pages?: number;
  pass_mark_pct?: number;
} {
  const minutes = parseWhole(draft.durationMin);
  const pages = parseDecimal(draft.pages);
  const pass = parseDecimal(draft.passMarkPct);

  return {
    ...(draft.subject.trim() === '' ? {} : { subject: draft.subject.trim() }),
    ...(draft.classLabel.trim() === '' ? {} : { class_label: draft.classLabel.trim() }),
    ...(minutes.blank ? {} : { duration_min: minutes.value }),
    ...(pages.blank ? {} : { pages: pages.value }),
    ...(pass.blank ? {} : { pass_mark_pct: pass.value }),
  };
}

export function createPayload(draft: PatternDraft): TemplateCreateRequest {
  refuseUnsavable(draft);
  const sections = sectionsOf(draft);

  return {
    name: draft.name.trim(),
    sections,
    marks: blueprintTotals(sections).marks,
    persona_id: draft.personaId || PAPER_SERVICE_PERSONA,
    ...typedFields(draft),
  };
}

export function mixPayload(name: string, mix: string, classLabel = ''): TemplateCreateRequest {
  const trimmedName = name.trim();
  const trimmedMix = mix.trim();
  if (trimmedName === '') throw new PatternDraftError(NEEDS_A_NAME);
  if (trimmedMix === '') throw new PatternDraftError(MIX_IS_PARSED_BY_THE_SERVICE);

  return {
    name: trimmedName,
    mix: trimmedMix,
    ...(classLabel.trim() === '' ? {} : { class_label: classLabel.trim() }),
  };
}

export function updatePayload(draft: PatternDraft): TemplateUpdateRequest {
  refuseUnsavable(draft);

  return {
    name: draft.name.trim(),
    sections: sectionsOf(draft),
    persona_id: draft.personaId || PAPER_SERVICE_PERSONA,
    ...typedFields(draft),
  };
}

export function savedPatterns(
  rows: readonly TemplateSummary[],
): TemplateSummary[] {
  return rows.filter((row) => row.kind !== 'preset');
}

export function editRefusal(summary: TemplateSummary | undefined): string | null {
  if (!summary) return null;
  return summary.writable ? null : NOT_WRITABLE;
}

export function mayEdit(summary: TemplateSummary | undefined): boolean {
  return summary !== undefined && summary.writable;
}

export function questionTypeOptions(
  draft: PatternDraft,
): { id: string; label: string }[] {
  const known = new Set<string>(QUESTION_TYPES);
  const extra = draft.sections
    .flatMap((section) => section.items.map((item) => item.questionType))
    .filter((type) => type !== '' && !known.has(type));

  return [
    ...QUESTION_TYPES.map((type) => ({ id: type, label: QUESTION_TYPE_LABELS[type] })),
    ...[...new Set(extra)].map((type) => ({ id: type, label: type })),
  ];
}
