import { leadsSection } from '@/lib/reach/reach';
import type { MySubject } from '@/types/teaching';

import { ENROLLMENTS } from './data/enrollment';
import { TEACHERS } from './data/people';
import { CURRENT_SESSION, GRADE_LEVELS, OFFERINGS, SECTIONS, SUBJECTS } from './data/structure';
import { teacherAssignmentsOf } from './data/timetable';
import { reachNow } from './reach';

const teacherName = (id: string | undefined): string | null => TEACHERS.find((t) => t.id === id)?.edges?.staff?.edges?.person?.display_name ?? null;

// The subjects a teacher teaches this year, or the ones a pupil takes in their section; nothing for anyone else.
export function mySubjects(): MySubject[] {
  const reach = reachNow();
  const yearId = CURRENT_SESSION.id;
  const sections = SECTIONS.filter((s) => s.academic_session_id === yearId && s.status !== 'archived');
  const assignments = teacherAssignmentsOf(yearId);
  const offerings = OFFERINGS.filter(
    (o) => o.academic_session_id === yearId && (reach.kind === 'teaching' ? reach.offerings.has(o.id) : reach.kind === 'self' && o.section_id === reach.sectionId),
  );

  return offerings
    .flatMap((o) => {
      const section = sections.find((s) => s.id === o.section_id);
      const grade = GRADE_LEVELS.find((g) => g.id === section?.grade_level_id);
      if (!section || !grade) return [];
      const className = grade.name ?? 'Class';
      const undivided = sections.filter((s) => s.grade_level_id === grade.id).length < 2;
      const teacherId = assignments.find((a) => a.subject_offering_id === o.id)?.teacher_id ?? null;
      return [
        {
          offering_id: o.id,
          subject_id: o.subject_id ?? '',
          subject: o.edges?.subject?.name ?? 'Subject',
          elective: SUBJECTS.find((s) => s.id === o.subject_id)?.is_elective ?? false,
          section_id: section.id,
          grade_level_id: grade.id,
          class_name: className,
          label: undivided ? className : `${className.replace('Class ', '')}${section.name ?? ''}`,
          periods: o.periods_per_week ?? 0,
          students: ENROLLMENTS.filter((e) => e.section_id === section.id && e.status !== 'withdrawn').length,
          teacher: teacherName(teacherId ?? undefined),
          teacher_id: teacherId,
          class_teacher: reach.kind === 'teaching' && leadsSection(reach, section.id),
        },
      ];
    })
    .sort((a, b) => (GRADE_LEVELS.find((g) => g.id === a.grade_level_id)?.sequence ?? 0) - (GRADE_LEVELS.find((g) => g.id === b.grade_level_id)?.sequence ?? 0) || a.label.localeCompare(b.label) || a.subject.localeCompare(b.subject));
}
