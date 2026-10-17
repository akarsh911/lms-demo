import type {
  StudentEnrollmentRow,
  SubjectEnrollmentRow,
  TeacherAssignmentRow,
} from '@/types/people-detail';

export interface Audience {
  ids: string[];
  kinds: string[];
}

function push(into: Map<string, string>, id: string | undefined, kind: string): void {
  if (id && !into.has(id)) into.set(id, kind);
}

export function studentAudience(
  studentId: string,
  enrollments: readonly StudentEnrollmentRow[],
  subjectEnrollments: readonly SubjectEnrollmentRow[],
): Audience {
  const found = new Map<string, string>();
  push(found, studentId, 'this student');

  for (const row of enrollments) {
    push(found, row.section_id ?? row.edges?.section?.id, 'their class');
    push(found, row.edges?.section?.grade_level_id, 'their year group');
    push(found, row.edges?.section?.branch_id, 'their campus');
  }
  for (const row of subjectEnrollments) {
    push(found, row.subject_offering_id ?? row.edges?.subject_offering?.id, 'their subjects');
  }

  return { ids: [...found.keys()], kinds: [...new Set(found.values())] };
}

export function teacherBranchIds(rows: readonly TeacherAssignmentRow[]): string[] {
  const found = new Set<string>();
  for (const row of rows) {
    const branch = row.edges?.section?.branch_id;
    if (branch) found.add(branch);
  }
  return [...found];
}
