import type { LeaveKind } from '@/types/attendance';

import { seedId } from '../ids';
import { TODAY } from './classroom';
import { SEATED } from './enrollment';

export interface LeaveRow {
  id: string;
  student_id: string;
  section_id: string;
  kind: LeaveKind;
  reason: string;
  from: string;
  to: string;
  approved: boolean;
}

const roll = (...parts: (string | number)[]): number => Number.parseInt(seedId(...parts).slice(0, 6), 16) / 0xffffff;
const day = (offset: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const REASONS: readonly { kind: LeaveKind; reason: string }[] = [
  { kind: 'medical', reason: 'Viral fever; doctor advised rest' },
  { kind: 'medical', reason: 'Recovering from a fractured wrist' },
  { kind: 'family', reason: 'Sister’s wedding in Jaipur' },
  { kind: 'family', reason: 'Grandparent unwell; family travelling' },
  { kind: 'travel', reason: 'Family travel, booked before term' },
  { kind: 'event', reason: 'Representing the school at the state chess meet' },
];

// About one pupil in twenty has a leave around today: most approved, some still waiting on the class teacher.
export const LEAVES: LeaveRow[] = SEATED.filter((e) => roll('leave', e.id) < 0.05).map((e) => {
  const r = roll('leave-shape', e.id);
  const start = Math.floor(r * 5) - 3;
  const pick = REASONS[Math.floor(roll('leave-reason', e.id) * REASONS.length)] ?? REASONS[0];
  return { id: seedId('leave', e.id), student_id: e.student_id ?? '', section_id: e.section_id ?? '', kind: pick?.kind ?? 'medical', reason: pick?.reason ?? '', from: day(start), to: day(start + 1 + Math.floor(r * 4)), approved: r > 0.2 };
});
