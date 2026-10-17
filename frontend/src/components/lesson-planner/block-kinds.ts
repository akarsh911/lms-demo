import type { LucideIcon } from 'lucide-react';
import { Flame, ListChecks, NotebookPen, Presentation, Users } from 'lucide-react';

import type { ChipTone } from '@/components/ui/chip';
import type { LessonBlockKind, LessonPlanStatus } from '@/types/lesson-planner';

export const BLOCK_KIND_META: Readonly<Record<LessonBlockKind, { label: string; tone: ChipTone; Icon: LucideIcon }>> = {
  warm_up: { label: 'Warm-up', tone: 'amber', Icon: Flame },
  explanation: { label: 'Explanation', tone: 'indigo', Icon: Presentation },
  activity: { label: 'Activity', tone: 'teal', Icon: Users },
  check: { label: 'Check for understanding', tone: 'violet', Icon: ListChecks },
  homework: { label: 'Homework', tone: 'coral', Icon: NotebookPen },
};

export const PLAN_STATUS_META: Readonly<Record<LessonPlanStatus, { label: string; tone: ChipTone }>> = {
  scheduled: { label: 'Scheduled', tone: 'blue' },
  in_progress: { label: 'In progress', tone: 'amber' },
  taught: { label: 'Taught', tone: 'green' },
};

export const MIN_BLOCK_MINUTES = 1;
export const MAX_BLOCK_MINUTES = 80;
