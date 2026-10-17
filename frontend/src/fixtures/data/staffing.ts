import type { TeachingChangeKind } from '@/types/foundation';

import { seedId } from '../ids';
import { CURRENT_SESSION } from './structure';

// A staffing incident: who, when, and the offerings it touched. The register turns these into readable impact lines.
export interface StaffingChange {
  id: string;
  academic_session_id: string;
  date: string;
  kind: TeachingChangeKind;
  // A current teacher by index, or a name for someone no longer on the staff list.
  teacher: number | string;
  // Who the work moved from or to, where that applies.
  other: number | string | null;
  // How many of the teacher's current assignments the incident is read against.
  take: number;
  // Sections by code, for a class-teacher change.
  sections: string[];
  note: string | null;
}

const change = (date: string, kind: TeachingChangeKind, teacher: number | string, other: number | string | null, take: number, sections: string[], note: string | null): StaffingChange => ({
  id: seedId('staffing', date, kind, String(teacher)),
  academic_session_id: CURRENT_SESSION.id,
  date,
  kind,
  teacher,
  other,
  take,
  sections,
  note,
});

export const STAFFING_CHANGES: StaffingChange[] = [
  change('2026-06-15', 'joined', 23, null, 3, [], 'Joined from Bhavan’s, Nagpur'),
  change('2026-07-31', 'left', 'Priya Raghavan', 61, 4, [], 'Relocated; her classes were handed over the same week'),
  change('2026-08-10', 'class_teacher', 44, null, 0, ['G08C'], 'Stepped down as class teacher on medical leave; no replacement named yet'),
  change('2026-09-01', 'reassigned', 12, 19, 1, [], 'Timetable clash resolved by swapping the two sections'),
  // The vacated offerings are VACATED_ASSIGNMENTS in data/timetable.ts.
  change('2026-09-20', 'vacant', 7, null, 0, [], 'On long leave until December; no cover assigned'),
];
