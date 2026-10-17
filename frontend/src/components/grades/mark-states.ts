import type { MarkState } from '@/types/grades';

export const MARK_STATE = {
  marked: { label: 'Marked', tone: 'green' },
  absent: { label: 'Absent', tone: 'amber' },
  exempt: { label: 'Exempt', tone: 'grey' },
  pending: { label: 'Pending', tone: 'grey' },
} as const satisfies Record<MarkState, { label: string; tone: string }>;

export const percent = (value: number | null | undefined, max = 100): string => (value === null || value === undefined || max === 0 ? '—' : `${Math.round((value / max) * 100)}%`);

export const pct1 = (value: number | null | undefined): string => (value === null || value === undefined ? '—' : `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`);

// A percentage reads as its band: the warning colour below the pass mark, the success colour from 70.
export const pctTone = (value: number | null | undefined): 'red' | 'amber' | 'green' | 'grey' => (value === null || value === undefined ? 'grey' : value < 33 ? 'red' : value < 70 ? 'amber' : 'green');
