import type { WeeklySlot } from '@/types/lesson-planner';

import { addDays, mondayOf, within } from './dates';
import type { PlacedPeriod, SlotUse } from './engine';
import type { ResolvedExam, TermPlanView } from './term';

export interface TimelineCell {
  key: string;
  date: string;
  use: SlotUse;
  extra: boolean;
  past: boolean;
}

export interface TimelineDay {
  date: string;
  closed: string | null;
  exam: ResolvedExam | null;
  lost: number;
  cells: TimelineCell[];
}

export interface WeekChapter {
  id: string;
  periods: number;
  firstDate: string;
}

export interface TimelineWeek {
  monday: string;
  days: TimelineDay[];
  chapters: WeekChapter[];
  revisionFor: string[];
  examsStarting: ResolvedExam[];
  current: boolean;
}

const WORKING_DAYS = [1, 2, 3, 4, 5, 6] as const;

function cellsByDate(view: TermPlanView): Map<string, PlacedPeriod[]> {
  const cells = new Map<string, PlacedPeriod[]>();
  const add = (p: PlacedPeriod): void => void cells.set(p.date, [...(cells.get(p.date) ?? []), p]);
  for (const p of view.baseline.periods) if (p.date < view.from) add(p);
  for (const p of view.forward.periods) add(p);
  return cells;
}

function weekChapters(days: readonly TimelineDay[]): WeekChapter[] {
  const found = new Map<string, WeekChapter>();
  for (const cell of days.flatMap((d) => d.cells)) {
    if (cell.use.kind !== 'chapter') continue;
    const current = found.get(cell.use.chapterId);
    found.set(cell.use.chapterId, { id: cell.use.chapterId, periods: (current?.periods ?? 0) + 1, firstDate: current?.firstDate ?? cell.date });
  }
  return [...found.values()];
}

export function timelineWeeks(view: TermPlanView, week: readonly WeeklySlot[], today: string): TimelineWeek[] {
  const slotsOn = (day: number): number => week.filter((s) => s.day_of_week === day).length;
  const teachingDays = WORKING_DAYS.filter((day) => slotsOn(day) > 0);
  const cells = cellsByDate(view);
  const weeks: TimelineWeek[] = [];
  for (let monday = mondayOf(view.term.start); monday <= view.term.end; monday = addDays(monday, 7)) {
    const days = teachingDays.map((day) => {
      const date = addDays(monday, day - 1);
      const exam = view.exams.find((e) => within(date, e.start, e.end)) ?? null;
      const closed = view.blocked.get(date) ?? null;
      const outside = date < view.term.start || date > view.term.end;
      const placed = cells.get(date) ?? [];
      return {
        date,
        closed: outside ? 'Outside the term' : closed,
        exam,
        lost: exam || closed ? slotsOn(day) : 0,
        cells: outside ? [] : placed.map((p) => ({ key: `${p.date}-${p.period_id}`, date: p.date, use: p.use, extra: p.extra, past: p.date < view.from })),
      };
    });
    const all = days.flatMap((d) => d.cells);
    weeks.push({
      monday,
      days,
      chapters: weekChapters(days),
      revisionFor: [...new Set(all.flatMap((c) => (c.use.kind === 'revision' ? [c.use.examId] : [])))],
      examsStarting: view.exams.filter((e) => within(e.start, monday, addDays(monday, 6))),
      current: within(today, monday, addDays(monday, 6)),
    });
  }
  return weeks;
}

