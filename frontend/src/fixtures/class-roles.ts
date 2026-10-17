import { leadsSection, seesSection } from '@/lib/reach/reach';
import { CLASS_DUTIES, type ClassDuty, type ClassPupil, type ClassRoles, type MyClassRole } from '@/types/class-roles';

import { ENROLLMENTS } from './data/enrollment';
import { PERSONA_STUDENT } from './identity';
import { PERSONS, STAFF, STUDENTS, TEACHERS } from './data/people';
import { GRADE_LEVELS, SECTIONS } from './data/structure';
import { reachNow } from './reach';
import { fail, must } from './rows';

interface RolesRow {
  monitor: string | null;
  vice: string | null;
  duties: Map<ClassDuty, string[]>;
}

const ROLES = new Map<string, RolesRow>();

const pupilsOf = (sectionId: string): ClassPupil[] =>
  ENROLLMENTS.filter((e) => e.section_id === sectionId && e.status === 'active')
    .map((e) => ({ student_id: e.student_id ?? '', name: PERSONS.find((p) => p.id === STUDENTS.find((s) => s.id === e.student_id)?.person_id)?.display_name ?? 'Student', roll: e.roll_number ?? null }))
    .sort((a, b) => Number(a.roll ?? 999) - Number(b.roll ?? 999));

// Every section starts with a monitor, a vice-monitor and two pupils on each duty, fixed by roll so a reload agrees.
function rolesOf(sectionId: string): RolesRow {
  const known = ROLES.get(sectionId);
  if (known) return known;
  const pupils = pupilsOf(sectionId).map((p) => p.student_id);
  const pick = (i: number): string | null => pupils[i % Math.max(pupils.length, 1)] ?? null;
  const row: RolesRow = { monitor: pick(4), vice: pick(11), duties: new Map(CLASS_DUTIES.map((d, i) => [d, [pick(i * 5 + 1), pick(i * 5 + 3)].filter((x): x is string => x !== null)])) };
  // The fixture pupil looks after the library, so their Home has a duty to show.
  const persona = STUDENTS[PERSONA_STUDENT]?.id;
  if (persona && pupils.includes(persona)) row.duties.set('Library', [persona, ...(row.duties.get('Library') ?? []).filter((id) => id !== persona)].slice(0, 2));
  ROLES.set(sectionId, row);
  return row;
}

const labelOf = (sectionId: string): string => {
  const s = SECTIONS.find((x) => x.id === sectionId);
  return `${(GRADE_LEVELS.find((g) => g.id === s?.grade_level_id)?.name ?? '').replace('Class ', '')}${s?.name ?? ''}`;
};
const teacherName = (id: string | undefined): string | null => PERSONS.find((p) => p.id === STAFF.find((st) => st.id === TEACHERS.find((t) => t.id === id)?.staff_id)?.person_id)?.display_name ?? null;

function answer(sectionId: string): ClassRoles {
  const row = rolesOf(sectionId);
  const pupils = pupilsOf(sectionId);
  const find = (id: string | null): ClassPupil | null => pupils.find((p) => p.student_id === id) ?? null;
  return {
    section_id: sectionId,
    label: labelOf(sectionId),
    class_teacher: teacherName(must(SECTIONS, sectionId, 'section').class_teacher_id),
    monitor: find(row.monitor),
    vice_monitor: find(row.vice),
    duties: CLASS_DUTIES.map((duty) => ({ duty, pupils: (row.duties.get(duty) ?? []).flatMap((id) => find(id) ?? []) })),
    pupils,
  };
}

export function classRoles(sectionId: string): ClassRoles {
  if (!seesSection(reachNow(), sectionId)) fail(404, 'not_found', 'section not found');
  return answer(sectionId);
}

// Only the class teacher, or the office, names a section's monitors and gives out its duties, and only to its own pupils.
function leadOf(sectionId: string, studentIds: readonly string[]): RolesRow {
  const section = must(SECTIONS, sectionId, 'section');
  if (!leadsSection(reachNow(), sectionId)) fail(403, 'forbidden', `Only the class teacher of ${labelOf(section.id)} can change its roles.`);
  const pupils = new Set(pupilsOf(sectionId).map((p) => p.student_id));
  if (studentIds.some((id) => !pupils.has(id))) fail(422, 'not_in_section', 'Choose pupils of this section.');
  return rolesOf(sectionId);
}

export function setMonitor(sectionId: string, role: 'monitor' | 'vice_monitor', studentId: string | null): ClassRoles {
  const row = leadOf(sectionId, studentId ? [studentId] : []);
  const other = role === 'monitor' ? row.vice : row.monitor;
  if (studentId && studentId === other) fail(409, 'already_holds', 'The monitor and the vice-monitor are two different pupils.');
  if (role === 'monitor') row.monitor = studentId;
  else row.vice = studentId;
  return answer(sectionId);
}

export function setDuty(sectionId: string, duty: ClassDuty, studentIds: readonly string[]): ClassRoles {
  const row = leadOf(sectionId, studentIds);
  if (studentIds.length > 4) fail(422, 'too_many', 'Up to four pupils share a duty.');
  row.duties.set(duty, [...studentIds]);
  return answer(sectionId);
}

export function myClassRole(): MyClassRole | null {
  const reach = reachNow();
  if (reach.kind !== 'self' || !reach.sectionId) return null;
  const roles = answer(reach.sectionId);
  return {
    label: roles.label,
    class_teacher: roles.class_teacher,
    monitor: roles.monitor?.name ?? null,
    office: roles.monitor?.student_id === reach.studentId ? 'monitor' : roles.vice_monitor?.student_id === reach.studentId ? 'vice_monitor' : null,
    duties: roles.duties.filter((d) => d.pupils.some((p) => p.student_id === reach.studentId)).map((d) => d.duty),
  };
}
