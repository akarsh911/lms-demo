import type { AgendaItem, SchoolProfile, WorkingWeek } from '@/types/foundation';

import { SCHOOL } from '../identity';
import { seedId } from '../ids';
import { BRANCH, CURRENT_SESSION, PAST_SESSION } from './structure';

const MON_TO_SAT = { monday: true, tuesday: true, wednesday: true, thursday: true, friday: true, saturday: true, sunday: false };

export const WORKING_WEEKS: WorkingWeek[] = [
  { academic_session_id: CURRENT_SESSION.id, days: { ...MON_TO_SAT } },
  { academic_session_id: PAST_SESSION.id, days: { ...MON_TO_SAT } },
];

const address = BRANCH.address_json;

export const SCHOOL_PROFILE: SchoolProfile = {
  name: 'Delhi Public School, Nagpur',
  short_name: SCHOOL.name,
  current_year: CURRENT_SESSION.name ?? null,
  phone: BRANCH.phone ?? '',
  email: BRANCH.email ?? '',
  address: [address?.line1, address?.city, address?.state, address?.postal_code].filter(Boolean).join(', '),
};

// What is on at school today beyond lessons. No calendar of events exists yet, so this is a plain list.
export const AGENDA: AgendaItem[] = [
  { id: seedId('agenda', 'assembly'), time: '08:00', title: 'Assembly', detail: 'Whole school · Auditorium' },
  { id: seedId('agenda', 'test'), time: '09:40', title: 'Mathematics test', detail: 'Class 8 · all sections' },
  { id: seedId('agenda', 'trials'), time: '13:10', title: 'Basketball trials', detail: 'Classes 9 to 12' },
];

// Numbers a daily attendance roll-up would report. Fixed, because no such roll-up exists to derive them from.
export const TODAY_COUNTS = { students_absent: 64, staff_absent: 3, sections_pending: 3, lessons_uncovered: 7 };
