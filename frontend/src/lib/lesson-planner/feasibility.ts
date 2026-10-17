import type { Allocation, EngineExam, EngineInput } from './engine';

export type Verdict =
  | { status: 'done' }
  | { status: 'on_track'; slack: number }
  | { status: 'tight'; slack: number }
  | { status: 'over'; by: number };

export interface ExamPace {
  examId: string;
  needed: number;
  available: number;
  syllabusEnds: string | null;
  verdict: Verdict;
}

export const tightBelow = (needed: number): number => Math.max(2, Math.ceil(needed * 0.08));

export function examPace(input: EngineInput, allocation: Allocation, exam: EngineExam): ExamPace {
  const syllabus = new Set(exam.syllabus);
  const needed = input.chapters.filter((c) => syllabus.has(c.id)).reduce((sum, c) => sum + c.weight, 0);
  const before = allocation.periods.filter((p) => p.date < exam.start);
  const available = before.filter((p) => p.use.kind !== 'revision').length;
  const isSyllabus = (index: number): boolean => {
    const use = allocation.periods[index]?.use;
    return use?.kind === 'chapter' && syllabus.has(use.chapterId);
  };
  const lastIndex = allocation.periods.reduce((last, _, i) => (isSyllabus(i) ? i : last), -1);
  const base = { examId: exam.id, needed, available, syllabusEnds: allocation.periods[lastIndex]?.date ?? null };

  if (exam.start <= input.from) return { ...base, verdict: { status: 'done' } };

  const spilled =
    allocation.periods.filter((p, i) => p.date >= exam.start && isSyllabus(i)).length +
    exam.syllabus.reduce((sum, id) => sum + (allocation.unplaced[id] ?? 0), 0);
  if (spilled > 0) return { ...base, verdict: { status: 'over', by: spilled } };

  const slack = allocation.periods.filter((p, i) => i > lastIndex && p.date < exam.start && p.use.kind !== 'revision').length;
  return { ...base, verdict: slack < tightBelow(needed) ? { status: 'tight', slack } : { status: 'on_track', slack } };
}
