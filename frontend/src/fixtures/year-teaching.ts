import type { TeachingChange, YearSectionTeaching, YearTeacherLoad, YearTeaching } from '@/types/foundation';
import type { TeacherAssignmentRow } from '@/types/academic';

import { TEACHERS } from './data/people';
import { STAFFING_CHANGES, type StaffingChange } from './data/staffing';
import { GRADE_LEVELS, OFFERINGS, SECTIONS, SESSIONS } from './data/structure';
import { TEACHER_ASSIGNMENTS, VACATED_ASSIGNMENTS, teacherAssignmentsOf } from './data/timetable';
import { must } from './rows';

const grades = new Map(GRADE_LEVELS.map((grade) => [grade.id, grade]));
const sections = new Map(SECTIONS.map((section) => [section.id, section]));
const offerings = new Map(OFFERINGS.map((offering) => [offering.id, offering]));
const teachers = new Map(TEACHERS.map((teacher) => [teacher.id, teacher]));

const teacherName = (id: string | undefined): string | null => {
  const teacher = teachers.get(id ?? '');
  return teacher?.edges?.staff?.edges?.person?.display_name ?? null;
};
const sectionName = (id: string | undefined): string => {
  const section = sections.get(id ?? '');
  return `${grades.get(section?.grade_level_id ?? '')?.name ?? 'Class'} ${section?.name ?? ''}`.trim();
};
const subjectName = (offeringId: string | undefined): string => offerings.get(offeringId ?? '')?.edges?.subject?.name ?? 'Subject';
const whoIs = (ref: number | string | null): string => (typeof ref === 'number' ? (teacherName(TEACHERS[ref]?.id) ?? 'A teacher') : (ref ?? 'A teacher'));

const describe = (row: TeacherAssignmentRow | undefined): string => (row ? `${subjectName(row.subject_offering_id)}, ${sectionName(row.section_id)}` : 'a subject');

// Each incident is read as what it did to classes, since that is what a principal asks of a staffing change.
// The assignments an incident is read against are the ones the teacher actually holds, so every line names a real class.
const heldBy = (ref: number | string | null, take: number): TeacherAssignmentRow[] =>
  typeof ref === 'number' ? TEACHER_ASSIGNMENTS.filter((row) => row.teacher_id === TEACHERS[ref]?.id).slice(0, take) : [];

function toChange(change: StaffingChange): TeachingChange {
  const who = whoIs(change.teacher);
  const other = whoIs(change.other);
  const note = change.note ? [change.note] : [];
  const common = { id: change.id, date: change.date, kind: change.kind, teacher: who };
  switch (change.kind) {
    case 'joined':
      return { ...common, title: `${who} joined the staff`, impact: [...heldBy(change.teacher, change.take).map((row) => `Took ${describe(row)}`), ...note] };
    case 'left':
      return { ...common, title: `${who} left the school`, impact: [...heldBy(change.other, change.take).map((row) => `${describe(row)} handed to ${other}`), ...note] };
    case 'class_teacher':
      return { ...common, title: `${who} is no longer class teacher of ${change.sections.map((code) => sectionName(SECTIONS.find((s) => s.code === code)?.id)).join(', ')}`, impact: note };
    case 'reassigned':
      return {
        ...common,
        title: `${who} and ${other} swapped sections`,
        impact: [...heldBy(change.teacher, change.take).map((row) => `${describe(row)} now with ${who}, from ${other}`), ...heldBy(change.other, change.take).map((row) => `${describe(row)} now with ${other}, from ${who}`), ...note],
      };
    case 'vacant':
      return { ...common, title: `${who} is on leave; ${VACATED_ASSIGNMENTS.length} subjects have no teacher`, impact: [...VACATED_ASSIGNMENTS.map((row) => `${describe(row)} has no teacher assigned`), ...note] };
    case 'assigned':
      return { ...common, title: `${who} was assigned ${heldBy(change.teacher, change.take).map(describe).join(', ')}`, impact: note };
    default: {
      const never: never = change.kind;
      throw new Error(`Unknown staffing change ${String(never)}`);
    }
  }
}

export function yearTeaching(yearId: string): YearTeaching {
  must(SESSIONS, yearId, 'academic year');
  const inYear = SECTIONS.filter((section) => section.academic_session_id === yearId);
  const assigned = teacherAssignmentsOf(yearId).filter((row) => row.academic_session_id === yearId);
  const byOffering = new Map(assigned.map((row) => [row.subject_offering_id ?? '', row]));
  const offered = OFFERINGS.filter((offering) => offering.academic_session_id === yearId);
  const changes = STAFFING_CHANGES.filter((change) => change.academic_session_id === yearId).map(toChange).sort((a, b) => b.date.localeCompare(a.date));

  const bySection: YearSectionTeaching[] = inYear
    .map((section) => ({
      section_id: section.id,
      class_name: grades.get(section.grade_level_id ?? '')?.name ?? 'Class',
      section_name: section.name ?? '',
      class_order: grades.get(section.grade_level_id ?? '')?.sequence ?? 0,
      class_teacher: teacherName(section.class_teacher_id),
      subjects: offered
        .filter((offering) => offering.section_id === section.id)
        .map((offering) => {
          const row = byOffering.get(offering.id);
          return { offering_id: offering.id, subject: offering.edges?.subject?.name ?? 'Subject', teacher_id: row?.teacher_id ?? null, teacher: teacherName(row?.teacher_id) };
        })
        .sort((a, b) => a.subject.localeCompare(b.subject)),
    }))
    .sort((a, b) => a.class_order - b.class_order || a.section_name.localeCompare(b.section_name));

  const joined = new Map<string, string>();
  const left = new Map<string, string>();
  for (const change of STAFFING_CHANGES) {
    if (typeof change.teacher !== 'number') continue;
    const id = TEACHERS[change.teacher]?.id ?? '';
    if (change.kind === 'joined') joined.set(id, change.date);
    if (change.kind === 'left') left.set(id, change.date);
  }
  const classTeacherOf = new Map(inYear.filter((section) => section.class_teacher_id).map((section) => [section.class_teacher_id ?? '', sectionName(section.id)]));
  const loads = new Map<string, YearTeacherLoad>();
  for (const row of assigned) {
    const id = row.teacher_id ?? '';
    const load = loads.get(id) ?? {
      teacher_id: id,
      name: teacherName(id) ?? 'Teacher',
      specialization: teachers.get(id)?.specialization ?? null,
      class_teacher_of: classTeacherOf.get(id) ?? null,
      assignments: [],
      joined: joined.get(id) ?? null,
      left: left.get(id) ?? null,
    };
    load.assignments.push({ section: sectionName(row.section_id), subject: subjectName(row.subject_offering_id) });
    loads.set(id, load);
  }
  const byTeacher = [...loads.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    teachers: byTeacher.length > 0 ? byTeacher.length : null,
    class_teachers: { value: inYear.filter((section) => section.class_teacher_id).length, total: inYear.length },
    assignments: { value: offered.filter((offering) => byOffering.has(offering.id)).length, total: offered.length },
    by_section: bySection,
    by_teacher: byTeacher,
    changes,
  };
}
