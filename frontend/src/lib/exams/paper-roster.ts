import { mergeRoll, type RollEntry } from '@/lib/classroom/roll';
import type { EnrollmentRow } from '@/types/academic';
import type { SubjectEnrollmentRow } from '@/types/people-detail';
import type { StudentRow } from '@/types/roster';

export interface PaperRosterRow {
  studentId: string;
  entry: RollEntry;
}

export function studentIdOf(entry: RollEntry): string | undefined {
  return entry.student?.id ?? entry.enrollment?.student_id;
}

export function takerIds(rows: readonly SubjectEnrollmentRow[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.student_id ?? row.edges?.student?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function paperRoster(
  students: readonly StudentRow[],
  enrollments: readonly EnrollmentRow[],
  takers: readonly string[] | null,
): PaperRosterRow[] {
  const takes = takers === null ? null : new Set(takers);

  const known = mergeRoll(students, enrollments).flatMap<PaperRosterRow>((entry) => {
    const studentId = studentIdOf(entry);
    if (!studentId) return [];
    if (takes && !takes.has(studentId)) return [];
    return [{ studentId, entry }];
  });

  if (takers === null) return known;

  const placed = new Set(known.map((row) => row.studentId));
  const missing = takers
    .filter((id) => !placed.has(id))
    .map<PaperRosterRow>((id) => ({ studentId: id, entry: { key: id } }));

  return [...known, ...missing];
}
