import type { EngineChapter } from './engine';
import { tightBelow, type ExamPace } from './feasibility';

export interface PlanChange {
  weights?: Record<string, number>;
  revision?: Record<string, number>;
  extra?: Record<string, number>;
  deferred?: Record<string, string[]>;
}

export type FixKind = 'compress' | 'merge' | 'revision' | 'extra' | 'defer';

export interface Fix {
  id: string;
  kind: FixKind;
  label: string;
  change: PlanChange;
}

export interface FixExam {
  id: string;
  name: string;
  syllabus: readonly string[];
  deferrable: readonly string[];
  revision: number;
  extra: number;
  deferred: readonly string[];
}

export interface FixChapter extends EngineChapter {
  title: string;
  unitId: string | null;
}

const MIN_WEIGHT = 2;
const MAX_COMPRESS = 2;
const MERGE_UP_TO = 6;

const periods = (n: number): string => `${n} ${n === 1 ? 'period' : 'periods'}`;

export function shortfall(pace: ExamPace): number {
  const { verdict } = pace;
  if (verdict.status === 'over') return verdict.by;
  if (verdict.status === 'tight') return Math.max(1, tightBelow(pace.needed) - verdict.slack);
  return 0;
}

function compress(exam: FixExam, chapters: readonly FixChapter[], need: number): Fix | null {
  const syllabus = new Set(exam.syllabus);
  const pool = chapters.filter((c) => syllabus.has(c.id) && c.weight > MIN_WEIGHT).sort((a, b) => b.weight - a.weight);
  const weights: Record<string, number> = {};
  let saved = 0;
  for (let round = 0; round < MAX_COMPRESS && saved < need; round += 1) {
    for (const chapter of pool) {
      const current = weights[chapter.id] ?? chapter.weight;
      if (saved >= need || current <= MIN_WEIGHT) continue;
      weights[chapter.id] = current - 1;
      saved += 1;
    }
  }
  if (saved === 0) return null;
  const names = pool.filter((c) => c.id in weights).map((c) => c.title);
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
  return { id: `compress-${exam.id}`, kind: 'compress', label: `Compress ${shown} (saves ${periods(saved)})`, change: { weights } };
}

function merge(exam: FixExam, chapters: readonly FixChapter[]): Fix | null {
  const syllabus = new Set(exam.syllabus);
  for (let i = 1; i < chapters.length; i += 1) {
    const a = chapters[i - 1];
    const b = chapters[i];
    if (!a || !b || !syllabus.has(a.id) || !syllabus.has(b.id)) continue;
    if (a.unitId === null || a.unitId !== b.unitId) continue;
    if (a.weight > MERGE_UP_TO || b.weight > MERGE_UP_TO || b.weight <= MIN_WEIGHT) continue;
    return {
      id: `merge-${exam.id}-${b.id}`,
      kind: 'merge',
      label: `Teach ${b.title} alongside ${a.title} (saves 1 period)`,
      change: { weights: { [b.id]: b.weight - 1 } },
    };
  }
  return null;
}

function revision(exam: FixExam, need: number): Fix | null {
  if (exam.revision <= 1) return null;
  const to = Math.max(1, exam.revision - need);
  return {
    id: `revision-${exam.id}`,
    kind: 'revision',
    label: `Shorten revision before ${exam.name} from ${exam.revision} to ${periods(to)}`,
    change: { revision: { [exam.id]: to } },
  };
}

function extra(exam: FixExam, need: number): Fix {
  return {
    id: `extra-${exam.id}`,
    kind: 'extra',
    label: `Ask for ${need} extra ${need === 1 ? 'period' : 'periods'} before ${exam.name}`,
    change: { extra: { [exam.id]: exam.extra + need } },
  };
}

function defer(exam: FixExam, chapters: readonly FixChapter[], need: number): Fix | null {
  const candidates = chapters.filter((c) => exam.deferrable.includes(c.id) && exam.syllabus.includes(c.id));
  const chosen = candidates.find((c) => c.weight >= need) ?? [...candidates].sort((a, b) => b.weight - a.weight)[0];
  if (!chosen) return null;
  return {
    id: `defer-${exam.id}-${chosen.id}`,
    kind: 'defer',
    label: `Move ${chosen.title} after ${exam.name}, which its paper allows`,
    change: { deferred: { [exam.id]: [...exam.deferred, chosen.id] } },
  };
}

export function fixesFor(exam: FixExam, pace: ExamPace, chapters: readonly FixChapter[]): Fix[] {
  const need = shortfall(pace);
  if (need === 0) return [];
  const candidates = [compress(exam, chapters, need), merge(exam, chapters), revision(exam, need), defer(exam, chapters, need), extra(exam, need)];
  return candidates.filter((fix): fix is Fix => fix !== null);
}
