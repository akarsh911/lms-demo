import type { ChipTone } from '@/components/ui/chip';
import type { AttemptStage, Band } from '@/types/grasp';

export const BANDS: readonly Band[] = ['understood', 'not_written', 'not_learnt', 'unclear'];

export const BAND: Readonly<Record<Band, { label: string; tone: ChipTone & ('green' | 'amber' | 'coral' | 'grey'); line: string; action: string }>> = {
  understood: { label: 'Understood', tone: 'green', line: 'Read their own work back, fast and slow.', action: 'Nothing to do.' },
  not_written: { label: 'Not in their words', tone: 'amber', line: 'Missed the timed questions, then got the untimed twin right.', action: 'Talk to them. It is a signal, not a verdict.' },
  not_learnt: { label: "Didn't land", tone: 'coral', line: 'Missed the timed questions and the untimed one.', action: 'Reteach the idea.' },
  unclear: { label: 'Mixed signal', tone: 'grey', line: 'Timed questions right, untimed one wrong.', action: 'Look again on the next check.' },
};

export const STAGE: Readonly<Record<AttemptStage, { label: string; tone: ChipTone }>> = {
  answering: { label: 'Answering', tone: 'blue' },
  checking: { label: 'In readback', tone: 'violet' },
  done: { label: 'Handed in', tone: 'grey' },
};

export const seconds = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`);
