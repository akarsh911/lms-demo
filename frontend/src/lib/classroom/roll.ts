import type { EnrollmentRow } from '@/types/academic';
import type { StudentRow } from '@/types/roster';

export interface RollEntry {
  key: string;
  student?: StudentRow;
  enrollment?: EnrollmentRow;
}

function studentIdOf(entry: RollEntry): string | undefined {
  return entry.student?.id ?? entry.enrollment?.student_id;
}

function rollNumberOf(entry: RollEntry): string | undefined {
  return entry.enrollment?.roll_number;
}

export function mergeRoll(
  students: readonly StudentRow[],
  enrollments: readonly EnrollmentRow[],
): RollEntry[] {
  const byStudent = new Map<string, RollEntry>();

  for (const student of students) {
    byStudent.set(student.id, { key: student.id, student });
  }

  for (const enrollment of enrollments) {
    const id = enrollment.student_id ?? enrollment.edges?.student?.id;
    if (!id) {
      byStudent.set(enrollment.id, { key: enrollment.id, enrollment });
      continue;
    }
    const existing = byStudent.get(id);
    if (existing) existing.enrollment = enrollment;
    else {
      byStudent.set(id, {
        key: id,
        student: enrollment.edges?.student,
        enrollment,
      });
    }
  }

  return [...byStudent.values()].sort(compareRoll);
}

function compareRoll(a: RollEntry, b: RollEntry): number {
  const rollA = rollNumberOf(a);
  const rollB = rollNumberOf(b);
  if (rollA && rollB && rollA !== rollB) {
    return rollA.localeCompare(rollB, undefined, { numeric: true });
  }
  if (rollA && !rollB) return -1;
  if (!rollA && rollB) return 1;
  return (studentIdOf(a) ?? a.key).localeCompare(studentIdOf(b) ?? b.key);
}

export function rollLine(entry: RollEntry): string | undefined {
  const parts: string[] = [];
  const roll = rollNumberOf(entry);
  if (roll) parts.push(`Roll ${roll}`);
  const admission = entry.student?.admission_number ?? entry.student?.student_code;
  if (admission) parts.push(admission);
  if (entry.enrollment?.enrollment_number && parts.length === 0) {
    parts.push(entry.enrollment.enrollment_number);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
