import * as React from 'react';
import { AlertTriangle, BookOpen, CalendarHeart, ClipboardCheck, Megaphone, PartyPopper } from 'lucide-react';

import type { ChipTone } from '@/components/ui/chip';
import type { NoticeCategory, NoticeState } from '@/types/notices';

export const CATEGORY: Readonly<Record<NoticeCategory, { label: string; tone: ChipTone; icon: React.ReactElement }>> = {
  general: { label: 'General', tone: 'grey', icon: <Megaphone size={18} /> },
  academic: { label: 'Academic', tone: 'blue', icon: <BookOpen size={18} /> },
  exam: { label: 'Examination', tone: 'violet', icon: <ClipboardCheck size={18} /> },
  event: { label: 'Event', tone: 'teal', icon: <PartyPopper size={18} /> },
  holiday: { label: 'Holiday', tone: 'green', icon: <CalendarHeart size={18} /> },
  urgent: { label: 'Urgent', tone: 'red', icon: <AlertTriangle size={18} /> },
};

export const STATE: Readonly<Record<NoticeState, { label: string; tone: ChipTone }>> = {
  published: { label: 'Live', tone: 'green' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  draft: { label: 'Draft', tone: 'amber' },
  expired: { label: 'Expired', tone: 'grey' },
  archived: { label: 'Archived', tone: 'grey' },
};
