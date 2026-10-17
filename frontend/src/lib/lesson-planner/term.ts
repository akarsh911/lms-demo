import type { PlannerTerm, TermChapter, TermContext, TermExam, TermPlanSettings } from '@/types/lesson-planner';

import { allocate, type Allocation, type EngineInput } from './engine';
import { examPace, type ExamPace } from './feasibility';
import { fixesFor, type Fix, type PlanChange } from './fixes';
import { addDays, daysBetween } from './dates';

export interface ResolvedExam extends TermExam {
  revision: number;
  extra: number;
  deferred: string[];
  moved: boolean;
}

export interface ResolvedChapter extends TermChapter {
  taught: number;
  remaining: number;
}

export interface TermPlanView {
  term: PlannerTerm;
  from: string;
  chapters: ResolvedChapter[];
  exams: ResolvedExam[];
  blocked: ReadonlyMap<string, string>;
  forward: Allocation;
  baseline: Allocation;
  paces: ExamPace[];
  fixes: Readonly<Record<string, Fix[]>>;
  plannedToDate: number;
  taughtToDate: number;
  behind: number;
}

const DAY_LABELS: Readonly<Record<string, string>> = { holiday: 'Holiday', vacation: 'Vacation', weekend: 'Weekend', event: 'School event' };

export function termOf(context: TermContext, settings: TermPlanSettings): PlannerTerm {
  return context.terms.find((t) => t.id === settings.term_id) ?? context.terms.find((t) => t.id === context.current_term_id) ?? context.terms[0] ?? { id: 'term', name: 'Term', start: context.today, end: context.today };
}

export function resolveExams(context: TermContext, settings: TermPlanSettings, term: PlannerTerm): ResolvedExam[] {
  return context.exams
    .filter((exam) => exam.end >= term.start && exam.start <= term.end)
    .map((exam) => {
      const start = settings.exam_starts[exam.id] ?? exam.start;
      const end = addDays(start, daysBetween(exam.start, exam.end));
      const deferred = settings.deferred[exam.id] ?? [];
      return {
        ...exam,
        start,
        end,
        syllabus: exam.syllabus.filter((id) => !deferred.includes(id)),
        revision: settings.revision[exam.id] ?? exam.revision_periods,
        extra: settings.extra_periods[exam.id] ?? 0,
        deferred,
        moved: start !== exam.start,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function orderChapters(context: TermContext, settings: TermPlanSettings): TermChapter[] {
  const first = context.chapters.find((c) => c.id === settings.first_chapter_id)?.sequence ?? 1;
  const included = context.chapters.filter((c) => c.sequence >= first).sort((a, b) => a.sequence - b.sequence);
  const byId = new Map(included.map((c) => [c.id, c]));
  const ordered = settings.order.flatMap((id) => byId.get(id) ?? []);
  const rest = included.filter((c) => !settings.order.includes(c.id));
  return [...ordered, ...rest].map((c) => ({ ...c, weight: settings.weights[c.id] ?? c.weight }));
}

export function blockedDates(context: TermContext, settings: TermPlanSettings): Map<string, string> {
  const blocked = new Map(context.days.filter((d) => d.kind !== 'teaching').map((d) => [d.date, d.label ?? DAY_LABELS[d.kind] ?? 'Closed']));
  for (const closure of settings.closures) blocked.set(closure.date, closure.label);
  return blocked;
}

export function buildTermPlan(context: TermContext, settings: TermPlanSettings): TermPlanView {
  const term = termOf(context, settings);
  const exams = resolveExams(context, settings, term);
  const blocked = blockedDates(context, settings);
  const ordered = orderChapters(context, settings);
  const taughtSince = context.taught.filter((t) => t.date >= settings.start_date);
  const taughtBefore = (id: string): number => context.taught.filter((t) => t.chapter_id === id && t.date < settings.start_date).length;
  const chapters: ResolvedChapter[] = ordered.map((c) => {
    const taught = context.taught.filter((t) => t.chapter_id === c.id).length;
    return { ...c, taught, remaining: Math.max(c.weight - taught, 0) };
  });
  const from = context.today > term.start ? context.today : term.start;
  const engineExams = exams.map((e) => ({ id: e.id, start: e.start, end: e.end, syllabus: e.syllabus, revision: e.revision, extra: e.extra }));
  const common = { to: term.end, week: context.week, blocked, exams: engineExams };

  const forwardInput: EngineInput = { ...common, from, chapters: chapters.filter((c) => c.remaining > 0).map((c) => ({ id: c.id, weight: c.remaining })) };
  const baselineChapters = chapters.map((c) => ({ id: c.id, weight: Math.max(c.weight - taughtBefore(c.id), 0) })).filter((c) => c.weight > 0);
  const baselineInput: EngineInput = { ...common, from: settings.start_date, chapters: baselineChapters };
  const forward = allocate(forwardInput);
  const baseline = allocate(baselineInput);

  const paces = engineExams.map((exam) => examPace(forwardInput, forward, exam));
  const fixChapters = chapters.filter((c) => c.remaining > 0).map((c) => ({ id: c.id, weight: c.remaining, title: c.title, unitId: c.unit_id }));
  const fixes = Object.fromEntries(
    exams.map((exam, i) => {
      const pace = paces[i];
      return [exam.id, pace ? fixesFor({ ...exam, syllabus: exam.syllabus }, pace, fixChapters).map((fix) => withFullWeights(fix, chapters)) : []];
    }),
  );

  const plannedToDate = baseline.periods.filter((p) => p.date < context.today && p.use.kind === 'chapter').length;
  const taughtToDate = taughtSince.filter((t) => t.date < context.today).length;
  return { term, from, chapters, exams, blocked, forward, baseline, paces, fixes, plannedToDate, taughtToDate, behind: plannedToDate - taughtToDate };
}

function withFullWeights(fix: Fix, chapters: readonly ResolvedChapter[]): Fix {
  if (!fix.change.weights) return fix;
  const weights = Object.fromEntries(
    Object.entries(fix.change.weights).map(([id, remaining]) => {
      const chapter = chapters.find((c) => c.id === id);
      return [id, chapter ? remaining + chapter.taught : remaining];
    }),
  );
  return { ...fix, change: { ...fix.change, weights } };
}

export function applyChange(settings: TermPlanSettings, change: PlanChange): TermPlanSettings {
  return {
    ...settings,
    weights: { ...settings.weights, ...change.weights },
    revision: { ...settings.revision, ...change.revision },
    extra_periods: { ...settings.extra_periods, ...change.extra },
    deferred: { ...settings.deferred, ...change.deferred },
  };
}
