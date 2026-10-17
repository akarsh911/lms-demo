import * as React from 'react';
import { AlertOctagon, BadgeIndianRupee, BookMarked, Building2, FileCheck2, GraduationCap, Megaphone, MessageSquareWarning, ShieldCheck, Users } from 'lucide-react';

import type { ChipTone } from '@/components/ui/chip';
import type { ActionCategory, ActionPriority } from '@/types/actions';

export const CATEGORY: Readonly<Record<ActionCategory, { label: string; tone: ChipTone; icon: React.ReactElement }>> = {
  students: { label: 'Students', tone: 'blue', icon: <GraduationCap size={18} /> },
  fees: { label: 'Fees', tone: 'amber', icon: <BadgeIndianRupee size={18} /> },
  discipline: { label: 'Discipline', tone: 'red', icon: <AlertOctagon size={18} /> },
  staff: { label: 'Staff', tone: 'violet', icon: <Users size={18} /> },
  academics: { label: 'Academics', tone: 'teal', icon: <BookMarked size={18} /> },
  feedback: { label: 'Feedback & reports', tone: 'rose', icon: <MessageSquareWarning size={18} /> },
  admissions: { label: 'Admissions & records', tone: 'green', icon: <FileCheck2 size={18} /> },
  facilities: { label: 'Facilities & transport', tone: 'grey', icon: <Building2 size={18} /> },
  compliance: { label: 'Compliance', tone: 'indigo', icon: <ShieldCheck size={18} /> },
  communication: { label: 'Communication', tone: 'lilac', icon: <Megaphone size={18} /> },
};

export const PRIORITY: Readonly<Record<ActionPriority, { label: string; tone: ChipTone }>> = {
  urgent: { label: 'Urgent', tone: 'red' },
  high: { label: 'High', tone: 'amber' },
  normal: { label: 'Normal', tone: 'grey' },
};
