import type { TeacherEntry, TeacherStatus } from '@/types/directory';

import { STAFF, TEACHERS } from './data/people';
import { STAFFING_CHANGES } from './data/staffing';
import { GRADE_LEVELS, OFFERINGS, SECTIONS, SESSIONS } from './data/structure';
import { SLOTS, teacherAssignmentsOf } from './data/timetable';
import { must } from './rows';

const grades = new Map(GRADE_LEVELS.map((grade) => [grade.id, grade]));
const sections = new Map(SECTIONS.map((section) => [section.id, section]));
const offerings = new Map(OFFERINGS.map((offering) => [offering.id, offering]));
const staffById = new Map(STAFF.map((staff) => [staff.id, staff]));

// Every teacher with this year's load: the classes and subjects they take, the section they are class teacher of, periods a week.
export function teacherDirectory(yearId: string): TeacherEntry[] {
  must(SESSIONS, yearId, 'academic year');
  const assignments = teacherAssignmentsOf(yearId);
  const classTeacher = new Map(SECTIONS.filter((s) => s.academic_session_id === yearId && s.class_teacher_id).map((s) => [s.class_teacher_id ?? '', s]));
  const periods = new Map<string, number>();
  for (const slot of SLOTS) if (slot.teacher_id) periods.set(slot.teacher_id, (periods.get(slot.teacher_id) ?? 0) + 1);
  const status = new Map<string, TeacherStatus>();
  for (const change of STAFFING_CHANGES) {
    if (typeof change.teacher !== 'number') continue;
    const id = TEACHERS[change.teacher]?.id ?? '';
    if (change.kind === 'vacant') status.set(id, 'on_leave');
    if (change.kind === 'joined') status.set(id, 'new');
  }

  return TEACHERS.map((teacher) => {
    const staff = staffById.get(teacher.staff_id ?? '');
    const person = staff?.edges?.person;
    const mine = assignments.filter((row) => row.teacher_id === teacher.id);
    const teaching = mine
      .map((row) => {
        const section = sections.get(row.section_id ?? '');
        const grade = grades.get(section?.grade_level_id ?? '');
        return {
          grade_level_id: grade?.id ?? '',
          class_name: grade?.name ?? 'Class',
          class_order: grade?.sequence ?? 0,
          section_id: section?.id ?? '',
          section: section?.name ?? '',
          subject: offerings.get(row.subject_offering_id ?? '')?.edges?.subject?.name ?? 'Subject',
        };
      })
      .sort((a, b) => a.class_order - b.class_order || a.section.localeCompare(b.section) || a.subject.localeCompare(b.subject));
    const ct = classTeacher.get(teacher.id);
    const ctGrade = grades.get(ct?.grade_level_id ?? '');
    return {
      id: teacher.id,
      name: person?.display_name ?? 'Teacher',
      code: teacher.teacher_code ?? '',
      employee_code: staff?.employee_code ?? '',
      specialization: teacher.specialization ?? null,
      email: person?.email ?? null,
      phone: person?.phone ?? null,
      joined_on: staff?.joining_date ?? null,
      status: status.get(teacher.id) ?? 'active',
      class_teacher_of: ct ? { section_id: ct.id, grade_level_id: ct.grade_level_id ?? '', label: `${ctGrade?.name ?? 'Class'} ${ct.name ?? ''}`.trim() } : null,
      teaching,
      subjects: [...new Set(teaching.map((t) => t.subject))].sort(),
      periods: periods.get(teacher.id) ?? 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
