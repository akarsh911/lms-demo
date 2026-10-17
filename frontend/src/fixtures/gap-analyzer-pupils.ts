import type { SectionRow } from '@/types/academic';

import { EVIDENCE_GRADE, EVIDENCE_SUBJECTS } from './data/gap-analyzer';
import { SEATED } from './data/enrollment';
import { STUDENTS } from './data/people';
import { CURRENT_SECTIONS, gradeSequenceOf } from './data/structure';

export interface Pupil {
  index: number;
  student_id: string;
  name: string;
  section: SectionRow;
  section_code: string;
  roll: string | null;
  grade: number;
}

const studentIndex = new Map(STUDENTS.map((student, index) => [student.id, index]));
const sectionById = new Map(CURRENT_SECTIONS.map((section) => [section.id, section]));

function pupilOf(row: (typeof SEATED)[number]): Pupil | null {
  const section = sectionById.get(row.section_id ?? '');
  const index = studentIndex.get(row.student_id ?? '');
  if (!section || index === undefined) return null;
  return {
    index,
    student_id: row.student_id ?? '',
    name: STUDENTS[index]?.edges?.person?.display_name ?? 'Student',
    section,
    section_code: section.code ?? '',
    roll: row.roll_number ?? null,
    grade: gradeSequenceOf(section),
  };
}

const seated = SEATED.filter((row) => sectionById.has(row.section_id ?? ''));

export const pupilsOf = (sectionId: string): Pupil[] =>
  seated.filter((row) => row.section_id === sectionId).flatMap((row) => pupilOf(row) ?? []).sort((a, b) => (a.roll ?? '').localeCompare(b.roll ?? '', undefined, { numeric: true }));

export function pupilById(studentId: string): Pupil | null {
  const row = seated.find((candidate) => candidate.student_id === studentId);
  return row ? pupilOf(row) : null;
}

export const hasEvidence = (pupil: Pupil, code: string): boolean => pupil.grade === EVIDENCE_GRADE && EVIDENCE_SUBJECTS.includes(code);
