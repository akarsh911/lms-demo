import type { AcademicGroup } from '@/types/structure';

import { seedId } from '../ids';
import { CURRENT_SESSION, SECTIONS } from './structure';
import { ENROLLMENTS } from './enrollment';

// Classes 11 and 12 study in streams; 11A is split into a Science and a Commerce group to show the shape.
const eleven = SECTIONS.find((s) => s.academic_session_id === CURRENT_SESSION.id && s.code === 'G11A');
const pupils = ENROLLMENTS.filter((e) => e.section_id === eleven?.id && e.status === 'active').map((e) => e.student_id ?? '');
const half = Math.ceil(pupils.length / 2);

export const GROUPS: AcademicGroup[] = eleven
  ? [
      { id: seedId('group', eleven.id, 'science'), section_id: eleven.id, name: 'Science', kind: 'stream', student_ids: pupils.slice(0, half) },
      { id: seedId('group', eleven.id, 'commerce'), section_id: eleven.id, name: 'Commerce', kind: 'stream', student_ids: pupils.slice(half) },
    ]
  : [];
