import type { LessonBlock, LessonPeriod } from '@/types/lesson-planner';

type BlockChange = (blocks: LessonBlock[]) => LessonBlock[];

function inPeriod(periods: readonly LessonPeriod[], periodId: string, change: BlockChange): LessonPeriod[] {
  return periods.map((period) => (period.id === periodId ? { ...period, blocks: change(period.blocks) } : period));
}

export function moveBlock(periods: readonly LessonPeriod[], periodId: string, blockId: string, step: -1 | 1): LessonPeriod[] {
  return inPeriod(periods, periodId, (blocks) => {
    const from = blocks.findIndex((block) => block.id === blockId);
    const to = from + step;
    const moving = blocks[from];
    if (!moving || to < 0 || to >= blocks.length) return blocks;
    const next = blocks.filter((block) => block.id !== blockId);
    next.splice(to, 0, moving);
    return next;
  });
}

export const removeBlock = (periods: readonly LessonPeriod[], periodId: string, blockId: string): LessonPeriod[] =>
  inPeriod(periods, periodId, (blocks) => blocks.filter((block) => block.id !== blockId));

export const replaceBlock = (periods: readonly LessonPeriod[], periodId: string, blockId: string, next: LessonBlock): LessonPeriod[] =>
  inPeriod(periods, periodId, (blocks) => blocks.map((block) => (block.id === blockId ? next : block)));

export const appendBlock = (periods: readonly LessonPeriod[], periodId: string, block: LessonBlock): LessonPeriod[] =>
  inPeriod(periods, periodId, (blocks) => [...blocks, block]);

export const minutesOf = (period: LessonPeriod): number => period.blocks.reduce((sum, block) => sum + block.minutes, 0);

export const taughtCount = (periods: readonly LessonPeriod[]): number => periods.filter((period) => period.taught !== null).length;
