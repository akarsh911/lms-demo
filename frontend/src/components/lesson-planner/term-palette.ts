import type { Theme } from '@mui/material/styles';

import type { ChipTone } from '@/components/ui/chip';
import type { Verdict } from '@/lib/lesson-planner/feasibility';
import type { ResolvedExam } from '@/lib/lesson-planner/term';
import type { HueName, TintName } from '@/styles/theme';

const CHAPTER_TINTS: readonly TintName[] = ['blue', 'teal', 'violet', 'indigo', 'green', 'lilac'];

export const chapterTint = (sequence: number): TintName => CHAPTER_TINTS[(sequence - 1) % CHAPTER_TINTS.length] ?? 'blue';

export function chapterColours(theme: Theme, sequence: number): { bg: string; fg: string } {
  const tint = chapterTint(sequence);
  return { bg: theme.tints[tint], fg: theme.onTint[tint] };
}

export const VERDICT_META: Readonly<Record<Verdict['status'], { label: string; tone: ChipTone; hue: HueName }>> = {
  done: { label: 'Held', tone: 'grey', hue: 'blue' },
  on_track: { label: 'On track', tone: 'green', hue: 'green' },
  tight: { label: 'Tight', tone: 'amber', hue: 'amber' },
  over: { label: 'Over', tone: 'red', hue: 'red' },
};

export const examShortName = (exam: ResolvedExam): string =>
  exam.name.replace(/ examination$/i, '').replace(/^Periodic test/i, 'PT').replace(/^Unit Test/i, 'UT');
