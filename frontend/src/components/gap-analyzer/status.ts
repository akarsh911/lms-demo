import type { Theme } from '@mui/material/styles';

import type { GapSource, GapStatus, Trend } from '@/types/gap-analyzer';

type Tone = keyof Theme['tints'];

export interface StatusMeta {
  label: string;
  tone: Tone;
  hue: keyof Theme['hues'] | null;
  hint: string;
}

export const STATUS_META: Readonly<Record<GapStatus, StatusMeta>> = {
  gap: { label: 'Gap', tone: 'red', hue: 'red', hint: 'Taught, assessed and weak' },
  at_risk: { label: 'At risk', tone: 'amber', hue: 'amber', hint: 'Weak or borderline, without a paper to confirm it' },
  strong: { label: 'Strong', tone: 'green', hue: 'green', hint: 'Secure across the evidence' },
  not_taught: { label: 'Untaught', tone: 'grey', hue: null, hint: 'Not counted as a gap' },
  no_data: { label: 'No data', tone: 'blue', hue: null, hint: 'Taught, but nothing recorded yet' },
};

export const STATUS_LEGEND: readonly GapStatus[] = ['gap', 'at_risk', 'strong', 'not_taught', 'no_data'];

export const SOURCE_TONES: Readonly<Record<GapSource, Tone>> = {
  exam: 'indigo',
  omr: 'violet',
  answer_sheet: 'coral',
  paper: 'orange',
  mindmap: 'teal',
  flashcards: 'lilac',
  debate: 'rose',
  read: 'grey',
};

export const TREND_LABEL: Readonly<Record<Trend, string>> = {
  improving: 'Improving',
  declining: 'Getting worse',
  steady: 'Steady',
  unknown: 'Too little history',
};

export function cellFill(theme: Theme, status: GapStatus): Record<string, string> {
  if (status === 'not_taught') {
    return { backgroundColor: theme.palette.background.paper, backgroundImage: `repeating-linear-gradient(45deg, ${theme.tints.grey} 0 3px, transparent 3px 7px)`, color: theme.palette.text.secondary };
  }
  if (status === 'no_data') return { backgroundColor: theme.palette.background.paper, color: theme.palette.text.disabled };
  const tone = STATUS_META[status].tone;
  return { backgroundColor: theme.tints[tone], color: theme.onTint[tone] };
}
