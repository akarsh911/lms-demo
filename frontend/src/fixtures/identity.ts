import type { CapabilitiesResponse, CoreIdentity, CorePerson, CoreRoles } from '@/types/core';

import { PERSON_COLUMNS, coreCapabilities, writablePersonColumns } from './capabilities';
import { devUser } from './dev-user';
import { ENROLLMENTS } from './data/enrollment';
import { CURRENT_SESSION, SECTIONS } from './data/structure';
import { GUARDIANS, PERSONS, STAFF, STUDENTS, TEACHERS, TEACHER_COUNT } from './data/people';
import { TEACHER_ASSIGNMENTS } from './data/timetable';
import { seedId } from './ids';
import { SCHOOL_CODE, byId, fail, must, patch } from './rows';

// Shaped on the live `/auth/me` answer: the tenant slug is CAS's, the code is what `X-School-Id` resolves.
export const SCHOOL = {
  school_id: seedId('school', SCHOOL_CODE),
  code: SCHOOL_CODE,
  name: 'DPS Nagpur',
  cas_tenant_id: 'dps-ngp',
  timezone: 'Asia/Kolkata',
};

const NO_ROLE = { is_student: false, is_staff: false, is_teacher: false, is_guardian: false };

export const PERSONA_STUDENT = 1210;
export const PERSONA_WARDS: readonly number[] = [PERSONA_STUDENT, 1209];

function rolesFor(user: string): { roles?: CoreRoles; personId?: string } {
  const teacher = TEACHERS[0];
  const staff = STAFF[0];
  const student = STUDENTS[PERSONA_STUDENT];
  if (user === 'superadmin' || !teacher || !staff || !student) return {};

  if (user === 'admin') {
    const admin = STAFF[TEACHER_COUNT];
    return { personId: admin?.person_id, roles: { ...NO_ROLE, is_staff: true, staff_id: admin?.id } };
  }

  if (user === 'parent') {
    const guardian = GUARDIANS[0];
    return {
      personId: guardian?.person_id,
      roles: { ...NO_ROLE, is_guardian: true, guardian_id: guardian?.id, student_ids: PERSONA_WARDS.flatMap((index) => STUDENTS[index]?.id ?? []) },
    };
  }

  if (user === 'student') {
    const section = ENROLLMENTS.find((e) => e.student_id === student.id)?.section_id;
    return {
      personId: student.person_id,
      roles: { ...NO_ROLE, is_student: true, student_ids: [student.id], section_ids: section ? [section] : [] },
    };
  }

  // `teacher`, and `dev`, who is also enrolled as a student.
  const mine = TEACHER_ASSIGNMENTS.filter((a) => a.teacher_id === teacher.id);
  return {
    personId: staff.person_id,
    roles: {
      ...NO_ROLE,
      is_student: user === 'dev',
      is_staff: true,
      is_teacher: true,
      staff_id: staff.id,
      teacher_id: teacher.id,
      section_ids: [...new Set(mine.map((a) => a.section_id ?? ''))],
      class_teacher_section_ids: SECTIONS.filter((s) => s.academic_session_id === CURRENT_SESSION.id && s.class_teacher_id === teacher.id).map((s) => s.id),
      subject_offering_ids: mine.map((a) => a.subject_offering_id ?? ''),
      ...(user === 'dev' ? { student_ids: [student.id] } : {}),
    },
  };
}

export function caller(): { personId?: string; teacherId?: string } {
  const { roles, personId } = rolesFor(devUser());
  return { personId, teacherId: roles?.teacher_id };
}

export function identity(): CoreIdentity {
  const { roles, personId } = rolesFor(devUser());
  return {
    cas_user_id: seedId('cas-user', devUser()),
    session_id: seedId('cas-session', devUser()),
    tenant_id: SCHOOL.cas_tenant_id,
    school: SCHOOL,
    roles,
    person: byId(PERSONS, personId),
  };
}

export function capabilities(): CapabilitiesResponse {
  const held = coreCapabilities(devUser());
  return { service: 'core', capabilities: held, count: held.length };
}

// A column the caller may not write is refused by name before anything is saved.
export function updatePerson(id: string, change: object): CorePerson {
  const person = must(PERSONS, id, 'person');
  const writable = writablePersonColumns(devUser());
  const entries = Object.entries(change);
  const columns: readonly string[] = PERSON_COLUMNS;
  const denied = entries.map(([key]) => key).filter((key) => columns.includes(key) && !writable.includes(key));
  if (denied.length > 0) fail(403, 'forbidden', `not permitted to write: ${denied.join(', ')}`);

  const allowed = entries.filter(([key, value]) => writable.includes(key) && (value === null || typeof value === 'string'));
  const next = Object.fromEntries(allowed.map(([key, value]) => [key, value === null ? undefined : value]));
  return patch(PERSONS, person.id, next) ?? person;
}
