import type { CoreRoles } from '@/types/core';

// How much of the school one viewer's screens show. Decided by emerge-core's capabilities and roles, never by persona.
export type Reach =
  | { kind: 'school' }
  | { kind: 'teaching'; teacherId: string; sections: ReadonlySet<string>; led: ReadonlySet<string>; offerings: ReadonlySet<string> }
  | { kind: 'self'; studentId: string; sectionId: string | null }
  | { kind: 'none' };

export function reachFrom(roles: CoreRoles | undefined, schoolWide: boolean): Reach {
  if (schoolWide) return { kind: 'school' };
  if (roles?.is_teacher && roles.teacher_id) {
    const led = new Set(roles.class_teacher_section_ids ?? []);
    return { kind: 'teaching', teacherId: roles.teacher_id, sections: new Set([...(roles.section_ids ?? []), ...led]), led, offerings: new Set(roles.subject_offering_ids ?? []) };
  }
  const studentId = roles?.is_student ? roles.student_ids?.[0] : undefined;
  if (studentId) return { kind: 'self', studentId, sectionId: roles?.section_ids?.[0] ?? null };
  return { kind: 'none' };
}

export const seesSection = (reach: Reach, sectionId: string | null | undefined): boolean => {
  switch (reach.kind) {
    case 'school':
      return true;
    case 'teaching':
      return Boolean(sectionId) && reach.sections.has(sectionId ?? '');
    case 'self':
      return Boolean(sectionId) && reach.sectionId === sectionId;
    case 'none':
      return false;
    default: {
      const never: never = reach;
      return never;
    }
  }
};

// The class teacher's powers over a section: its register and its pupils' set-up.
export const leadsSection = (reach: Reach, sectionId: string | null | undefined): boolean =>
  reach.kind === 'school' || (reach.kind === 'teaching' && reach.led.has(sectionId ?? ''));

export const teachesOffering = (reach: Reach, offeringId: string | null | undefined): boolean =>
  reach.kind === 'school' || (reach.kind === 'teaching' && reach.offerings.has(offeringId ?? ''));
