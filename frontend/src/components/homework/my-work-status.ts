import type { ChipTone } from '@/components/ui/chip';
import type { WorkStatus } from '@/types/homework';

// A piece of work as the pupil reads it, rather than as the teacher's marking queue does.
export const MY_STATUS: Readonly<Record<WorkStatus, { label: string; tone: ChipTone }>> = {
  pending: { label: 'To do', tone: 'blue' },
  missing: { label: 'Missing', tone: 'red' },
  submitted: { label: 'Handed in', tone: 'green' },
  late: { label: 'Handed in late', tone: 'amber' },
  graded: { label: 'Marked', tone: 'violet' },
  returned: { label: 'Marked', tone: 'violet' },
  excused: { label: 'Excused', tone: 'grey' },
};
