import type {
  BlueprintConstraintCreate,
  BlueprintConstraintRow,
  BlueprintCreate,
  BlueprintDetail,
  BlueprintPatch,
  BlueprintRow,
  BlueprintSectionCreate,
  BlueprintSectionRow,
} from '@/types/blueprints';
import type {
  PaperCreate,
  PaperDetail,
  PaperPatch,
  PaperQuestionCreate,
  PaperQuestionRow,
  PaperRow,
  PaperSectionCreate,
  PaperSectionRow,
} from '@/types/papers';
import type { Paper, PaperSummary } from '@/types/papersetter';

import {
  BLUEPRINTS,
  BLUEPRINT_CONSTRAINTS,
  BLUEPRINT_SECTIONS,
  PAPERS,
  PAPER_QUESTIONS,
  PAPER_SECTIONS,
} from './data/papers';
import { SETTER_PAPERS } from './data/papersetter';
import { cleared, fail, insert, must, notFound, page, patch, remove, type Page, type Query } from './rows';

const BLUEPRINT_FIXED = ['code', 'version', 'subject_id', 'grade_level_id', 'academic_session_id'] as const;

const byPosition = (a: { position?: number }, b: { position?: number }): number => (a.position ?? 0) - (b.position ?? 0);

// The screens match on this exact `error` value to explain why a published paper cannot change.
const settled = (): never =>
  fail(
    422,
    'request_failed',
    'a published paper is what candidates sat; supersede it with a new version instead of taking a part out of it',
    { error: 'paper_is_published' },
  );

const sectionsOf = (paperId: string): PaperSectionRow[] => PAPER_SECTIONS.filter((row) => row.paper_id === paperId);
const questionsOf = (sectionId: string): PaperQuestionRow[] => PAPER_QUESTIONS.filter((row) => row.paper_section_id === sectionId);
const partsOf = (blueprintId: string): BlueprintSectionRow[] => BLUEPRINT_SECTIONS.filter((row) => row.blueprint_id === blueprintId);
const constraintsOf = (sectionId: string): BlueprintConstraintRow[] =>
  BLUEPRINT_CONSTRAINTS.filter((row) => row.blueprint_section_id === sectionId);

function openPaper(paperId: string | undefined): PaperRow {
  const paper = must(PAPERS, paperId, 'paper');
  return paper.status === 'published' ? settled() : paper;
}

const openPaperOfSection = (sectionId: string): PaperRow => openPaper(must(PAPER_SECTIONS, sectionId, 'paper section').paper_id);

function dropSection(sectionId: string): void {
  for (const question of questionsOf(sectionId)) remove(PAPER_QUESTIONS, question.id);
  remove(PAPER_SECTIONS, sectionId);
}

export const listPapers = (query: Query): Page<PaperRow> => page(PAPERS, query);

export function paperDetail(id: string): PaperDetail {
  const paper = must(PAPERS, id, 'paper');
  return {
    paper,
    sections: sectionsOf(id)
      .sort(byPosition)
      .map((section) => ({ section, questions: questionsOf(section.id).sort(byPosition) })),
  };
}

export function createPaper(body: PaperCreate): PaperRow {
  if (!body.academic_session_id || !body.paper_code || !body.title || !body.total_marks) {
    fail(400, 'invalid_input', 'academic_session_id, paper_code, title and total_marks are required');
  }
  return insert(PAPERS, { version: 1, status: 'draft', ...body });
}

export function updatePaper(id: string, change: PaperPatch): PaperRow {
  const paper = openPaper(id);
  // Approval stamps the approver, and a caller with no person row at the school cannot be one.
  if (change.status === 'approved' && !paper.approved_by) {
    fail(400, 'bad_request', 'cannot record approved_by: the caller has no person record at this school');
  }
  return patch(PAPERS, paper.id, cleared(change)) ?? paper;
}

export function deletePaper(id: string): void {
  const paper = openPaper(id);
  for (const section of sectionsOf(paper.id)) dropSection(section.id);
  remove(PAPERS, paper.id);
}

export function createPaperSection(paperId: string, body: PaperSectionCreate): PaperSectionRow {
  const paper = openPaper(paperId);
  if (!body.name || !body.code || !body.position) fail(400, 'invalid_input', 'name, code and position are required');
  if (sectionsOf(paper.id).some((row) => row.position === body.position)) {
    fail(409, 'conflict', 'this paper already has a section at that position');
  }
  return insert(PAPER_SECTIONS, { ...body, paper_id: paper.id });
}

export function deletePaperSection(id: string): void {
  openPaperOfSection(id);
  dropSection(id);
}

export function createPaperQuestion(sectionId: string, body: PaperQuestionCreate): PaperQuestionRow {
  openPaperOfSection(sectionId);
  if (!body.question_id || !body.question_version_id || !body.question_number || !body.marks || !body.position) {
    fail(
      400,
      'invalid_input',
      'question_id, question_version_id, question_number, marks and position are required; ' +
        'a paper records both the question and the version it printed',
    );
  }
  if (questionsOf(sectionId).some((row) => row.position === body.position)) {
    fail(409, 'conflict', 'this section already has a question at that position');
  }
  return insert(PAPER_QUESTIONS, { ...body, paper_section_id: sectionId });
}

export function deletePaperQuestion(id: string): void {
  const question = must(PAPER_QUESTIONS, id, 'paper question');
  openPaperOfSection(question.paper_section_id ?? '');
  remove(PAPER_QUESTIONS, id);
}

// `reusable=true` asks for patterns that belong to no year; otherwise a session filter applies as usual.
export function listBlueprints(query: Query): Page<BlueprintRow> {
  const reusable = String(query.reusable) === 'true';
  const rows = reusable ? BLUEPRINTS.filter((row) => row.academic_session_id === undefined) : BLUEPRINTS;
  return page(rows, { ...query, reusable: undefined });
}

export function blueprintDetail(id: string): BlueprintDetail {
  const blueprint = must(BLUEPRINTS, id, 'blueprint');
  return {
    blueprint,
    sections: partsOf(id)
      .sort(byPosition)
      .map((section) => ({ section, constraints: constraintsOf(section.id) })),
  };
}

export function createBlueprint(body: BlueprintCreate): BlueprintRow {
  if (!body.grade_level_id || !body.subject_id || !body.code || !body.name || !body.total_marks || !body.duration_minutes) {
    fail(400, 'invalid_input', 'grade_level_id, subject_id, code, name, total_marks and duration_minutes are required');
  }
  if (!body.cognitive_scheme?.name) {
    fail(422, 'invalid_input', 'cognitive_scheme names the scheme it bands by, because a board ships more than one and they are not interchangeable');
  }
  if (!body.cognitive_scheme.bands?.length) {
    fail(422, 'invalid_input', 'cognitive_scheme carries at least one band; a scheme with no bands constrains nothing');
  }
  return insert(BLUEPRINTS, { version: 1, status: 'draft', ...body });
}

export function updateBlueprint(id: string, change: BlueprintPatch): BlueprintRow {
  const blueprint = must(BLUEPRINTS, id, 'blueprint');
  const fixed = BLUEPRINT_FIXED.find((field) => field in change);
  if (fixed) fail(422, 'invalid_input', `${fixed} fixes what a blueprint is for; record a new version rather than changing it`);
  return patch(BLUEPRINTS, id, cleared(change)) ?? blueprint;
}

export function deleteBlueprint(id: string): void {
  must(BLUEPRINTS, id, 'blueprint');
  for (const section of partsOf(id)) {
    for (const constraint of constraintsOf(section.id)) remove(BLUEPRINT_CONSTRAINTS, constraint.id);
    remove(BLUEPRINT_SECTIONS, section.id);
  }
  remove(BLUEPRINTS, id);
}

export function createBlueprintSection(blueprintId: string, body: BlueprintSectionCreate): BlueprintSectionRow {
  must(BLUEPRINTS, blueprintId, 'blueprint');
  if (!body.name || !body.section_code || !body.position || !body.question_count || !body.total_marks) {
    fail(400, 'invalid_input', 'name, section_code, position, question_count and total_marks are required');
  }
  return insert(BLUEPRINT_SECTIONS, { ...body, blueprint_id: blueprintId });
}

export function createConstraint(sectionId: string, body: BlueprintConstraintCreate): BlueprintConstraintRow {
  must(BLUEPRINT_SECTIONS, sectionId, 'blueprint section');
  if (!body.constraint_type || !body.value_json) fail(400, 'invalid_input', 'constraint_type and value_json are required');
  return insert(BLUEPRINT_CONSTRAINTS, { ...body, blueprint_section_id: sectionId });
}

export const paperSections = (paperId: string): PaperSectionRow[] => sectionsOf(paperId);
export const paperQuestions = (sectionId: string): PaperQuestionRow[] => questionsOf(sectionId);
export const blueprintSections = (blueprintId: string): BlueprintSectionRow[] => partsOf(blueprintId);
export const blueprintConstraints = (sectionId: string): BlueprintConstraintRow[] => constraintsOf(sectionId);

// paper-setter's own list is summaries only; `sections` arrives with the detail.
export const setterPapers = (): PaperSummary[] => SETTER_PAPERS.map(({ sections: _sections, ...summary }) => summary);

export const setterPaper = (id: string): Paper => SETTER_PAPERS.find((row) => row.paper_id === id) ?? notFound('paper');

const COMPOSED_PAPER_IDS = new Set<string>();

export const recordComposedPaper = (paper: Paper): Paper => {
  SETTER_PAPERS.unshift(paper);
  COMPOSED_PAPER_IDS.add(paper.paper_id);
  return paper;
};

export const composedPaper = (id: string): Paper | undefined =>
  COMPOSED_PAPER_IDS.has(id) ? SETTER_PAPERS.find((row) => row.paper_id === id) : undefined;

export const composedPapers = (): PaperSummary[] => setterPapers().filter((row) => COMPOSED_PAPER_IDS.has(row.paper_id));

export const seededPapers = (): PaperSummary[] => setterPapers().filter((row) => !COMPOSED_PAPER_IDS.has(row.paper_id));

export const fixtureSetterPaper = (id: string): Paper | undefined => SETTER_PAPERS.find((row) => row.paper_id === id);
