import { datesBetween, weekdayOf, within } from './dates';

export interface EngineSlot {
  day_of_week: number;
  period_id: string;
  start_minute: number;
}

export interface EngineChapter {
  id: string;
  weight: number;
}

export interface EngineExam {
  id: string;
  start: string;
  end: string;
  syllabus: readonly string[];
  revision: number;
  extra: number;
}

export interface EngineInput {
  from: string;
  to: string;
  week: readonly EngineSlot[];
  blocked: ReadonlyMap<string, string>;
  chapters: readonly EngineChapter[];
  exams: readonly EngineExam[];
}

export type SlotUse =
  | { kind: 'chapter'; chapterId: string; part: number; of: number }
  | { kind: 'revision'; examId: string }
  | { kind: 'free' };

export interface PlacedPeriod {
  date: string;
  period_id: string;
  extra: boolean;
  use: SlotUse;
}

export interface Allocation {
  periods: PlacedPeriod[];
  unplaced: Readonly<Record<string, number>>;
}

interface OpenPeriod {
  date: string;
  period_id: string;
  extra: boolean;
}

export const inExam = (date: string, exams: readonly EngineExam[]): boolean =>
  exams.some((exam) => within(date, exam.start, exam.end));

function regularPeriods(input: EngineInput): OpenPeriod[] {
  const byDay = new Map<number, EngineSlot[]>();
  for (const slot of input.week) byDay.set(slot.day_of_week, [...(byDay.get(slot.day_of_week) ?? []), slot]);
  return datesBetween(input.from, input.to).flatMap((date) => {
    if (input.blocked.has(date) || inExam(date, input.exams)) return [];
    const slots = [...(byDay.get(weekdayOf(date)) ?? [])].sort((a, b) => a.start_minute - b.start_minute);
    return slots.map((slot) => ({ date, period_id: slot.period_id, extra: false }));
  });
}

function extraPeriods(input: EngineInput, regular: readonly OpenPeriod[]): OpenPeriod[] {
  return input.exams.flatMap((exam) => {
    if (exam.extra <= 0) return [];
    const dates = [...new Set(regular.filter((p) => p.date < exam.start).map((p) => p.date))];
    return dates.slice(-exam.extra).map((date, i) => ({ date, period_id: `extra-${exam.id}-${i + 1}`, extra: true }));
  });
}

export function teachingPeriods(input: EngineInput): OpenPeriod[] {
  const regular = regularPeriods(input);
  return [...regular, ...extraPeriods(input, regular)].sort(
    (a, b) => a.date.localeCompare(b.date) || Number(a.extra) - Number(b.extra),
  );
}

export function allocate(input: EngineInput): Allocation {
  const periods: PlacedPeriod[] = teachingPeriods(input).map((p) => ({ ...p, use: { kind: 'free' } }));

  for (const exam of [...input.exams].sort((a, b) => a.start.localeCompare(b.start))) {
    const before = periods.filter((p) => p.date < exam.start && p.use.kind === 'free');
    const reserved = exam.revision > 0 ? before.slice(-exam.revision) : [];
    for (const period of reserved) period.use = { kind: 'revision', examId: exam.id };
  }

  const open = periods.filter((p) => p.use.kind === 'free');
  const unplaced: Record<string, number> = {};
  let cursor = 0;
  for (const chapter of input.chapters) {
    for (let part = 1; part <= chapter.weight; part += 1) {
      const period = open[cursor];
      if (!period) {
        unplaced[chapter.id] = chapter.weight - part + 1;
        break;
      }
      period.use = { kind: 'chapter', chapterId: chapter.id, part, of: chapter.weight };
      cursor += 1;
    }
  }
  return { periods, unplaced };
}
