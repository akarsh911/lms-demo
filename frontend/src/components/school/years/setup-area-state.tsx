import * as React from 'react';
import { CheckCircle2, Circle, CircleAlert, CircleDashed, Lock } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import type { SetupAreaState } from '@/types/foundation';

export const AREA_STATE = {
  not_started: { label: 'Not started', tone: 'grey', colour: 'text.disabled' },
  in_progress: { label: 'In progress', tone: 'blue', colour: 'info.main' },
  attention: { label: 'Needs attention', tone: 'amber', colour: 'warning.main' },
  ready: { label: 'Ready', tone: 'green', colour: 'success.main' },
  blocked: { label: 'Blocked', tone: 'grey', colour: 'text.secondary' },
} as const satisfies Record<SetupAreaState, { label: string; tone: string; colour: string }>;

// Each state has its own shape as well as its own colour, so the list reads without colour.
export function AreaStateIcon({ state, size = 20 }: { state: SetupAreaState; size?: number }): React.ReactElement {
  if (state === 'ready') return <CheckCircle2 size={size} aria-hidden />;
  if (state === 'attention') return <CircleAlert size={size} aria-hidden />;
  if (state === 'in_progress') return <CircleDashed size={size} aria-hidden />;
  if (state === 'blocked') return <Lock size={size} aria-hidden />;
  return <Circle size={size} aria-hidden />;
}

export function AreaStateChip({ state }: { state: SetupAreaState }): React.ReactElement {
  return <EmergeChip label={AREA_STATE[state].label} tone={AREA_STATE[state].tone} />;
}
