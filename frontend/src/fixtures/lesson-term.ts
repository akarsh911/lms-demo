import type { TermChapter, TermContext, TermExam, TermPlanSettings, TermUnit } from '@/types/lesson-planner';

import { CHAPTER_UNITS, CHAPTER_WEIGHTS, DEFAULT_WEIGHT, PLANNER_TERMS } from './data/lesson-term';
import { CURRICULUM_NODES } from './data/library';
import { seedId } from './ids';
import { savedSettings, termDays, termExams } from './lesson-calendar';
import { taughtPeriods } from './lesson-plans';
import { context as plannerContext, offeringById } from './lesson-planner';
import { fail } from './rows';

const today = (): string => plannerContext().today;

const unitId = (title: string): string => seedId('unit', title);

function chaptersOf(curriculumId: string | null): TermChapter[] {
  if (!curriculumId) return [];
  return CURRICULUM_NODES.filter((node) => node.curriculum_id === curriculumId && node.kind === 'chapter')
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .map((node) => {
      const title = node.title ?? 'Chapter';
      const unit = CHAPTER_UNITS[title];
      return { id: node.id, title, sequence: node.sequence ?? 0, unit_id: unit ? unitId(unit) : null, weight: CHAPTER_WEIGHTS[title] ?? DEFAULT_WEIGHT };
    });
}

function unitsOf(chapters: readonly TermChapter[]): TermUnit[] {
  const titles = [...new Set(chapters.flatMap((c) => CHAPTER_UNITS[c.title] ?? []))];
  return titles.map((title) => ({ id: unitId(title), title }));
}

const currentTerm = (): string => PLANNER_TERMS.find((t) => today() >= t.start && today() <= t.end)?.id ?? PLANNER_TERMS[0]?.id ?? '';

export function termContext(offeringId: string): TermContext {
  const offering = offeringById(offeringId);
  const chapters = chaptersOf(offering.curriculum_id);
  return {
    offering_id: offering.offering_id,
    section_label: offering.section_label,
    subject_name: offering.subject_name,
    grade: offering.grade,
    today: today(),
    terms: PLANNER_TERMS,
    current_term_id: currentTerm(),
    days: termDays(offering.grade),
    exams: termExams(offering.grade, offering.subject_code, chapters),
    units: unitsOf(chapters),
    chapters,
    week: offering.week,
    taught: taughtPeriods(offering.offering_id),
  };
}

function firstChapter(context: TermContext, termStart: string): string | null {
  const { chapters, exams } = context;
  const finished = exams.filter((exam) => exam.end < termStart).flatMap((exam) => exam.syllabus);
  const covered = Math.max(0, ...chapters.filter((c) => finished.includes(c.id)).map((c) => c.sequence));
  const taught = (id: string): number => context.taught.filter((t) => t.chapter_id === id).length;
  const ahead = chapters.filter((c) => c.sequence > covered);
  return (ahead.find((c) => taught(c.id) < c.weight) ?? ahead.at(-1) ?? chapters.at(-1))?.id ?? null;
}

function defaults(context: TermContext): TermPlanSettings {
  const term = PLANNER_TERMS.find((t) => t.id === context.current_term_id) ?? PLANNER_TERMS[0];
  const start = term?.start ?? context.today;
  return {
    offering_id: context.offering_id,
    term_id: term?.id ?? '',
    start_date: start,
    first_chapter_id: firstChapter(context, start),
    order: [],
    weights: {},
    closures: [],
    exam_starts: {},
    revision: {},
    extra_periods: {},
    deferred: {},
    saved_at: null,
  };
}

export const termPlan = (offeringId: string): TermPlanSettings => savedSettings().get(offeringId) ?? defaults(termContext(offeringId));

export function saveTermPlan(settings: TermPlanSettings): TermPlanSettings {
  offeringById(settings.offering_id);
  if (!PLANNER_TERMS.some((t) => t.id === settings.term_id)) fail(422, 'invalid_term', 'Choose a term of this academic year.');
  if (settings.closures.some((c) => !/^\d{4}-\d{2}-\d{2}$/.test(c.date) || !c.label.trim())) fail(422, 'invalid_closure', 'Every added day needs a date and a reason.');
  const saved = { ...settings, saved_at: new Date().toISOString() };
  savedSettings().set(settings.offering_id, saved);
  return saved;
}
