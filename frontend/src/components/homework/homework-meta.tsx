import * as React from 'react';
import { BookOpenText, ClipboardList, FileText, FlaskConical, PenLine } from 'lucide-react';

import type { ChipTone } from '@/components/ui/chip';
import type { AssignmentType } from '@/types/classroom';
import type { HomeworkState, WorkStatus } from '@/types/homework';

export const TYPE: Readonly<Record<AssignmentType, { label: string; tone: ChipTone; icon: React.ReactElement }>> = {
  worksheet: { label: 'Worksheet', tone: 'blue', icon: <FileText size={18} /> },
  practice: { label: 'Practice', tone: 'teal', icon: <PenLine size={18} /> },
  reading: { label: 'Reading', tone: 'violet', icon: <BookOpenText size={18} /> },
  project: { label: 'Project', tone: 'amber', icon: <FlaskConical size={18} /> },
  test: { label: 'Class test', tone: 'rose', icon: <ClipboardList size={18} /> },
};

export const STATE: Readonly<Record<HomeworkState, { label: string; tone: ChipTone }>> = {
  draft: { label: 'Draft', tone: 'amber' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  open: { label: 'Open', tone: 'green' },
  due: { label: 'Due date passed', tone: 'grey' },
  closed: { label: 'Closed', tone: 'grey' },
};

export const WORK: Readonly<Record<WorkStatus, { label: string; tone: ChipTone }>> = {
  pending: { label: 'Not yet', tone: 'grey' },
  missing: { label: 'Missing', tone: 'red' },
  submitted: { label: 'To grade', tone: 'blue' },
  late: { label: 'Late, to grade', tone: 'amber' },
  graded: { label: 'Graded', tone: 'violet' },
  returned: { label: 'Returned', tone: 'green' },
  excused: { label: 'Excused', tone: 'grey' },
};
