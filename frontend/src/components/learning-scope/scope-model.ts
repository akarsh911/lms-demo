import type { Capability } from '@/types/core';
import type { YearEnrollment } from '@/types/foundation';
import type { SectionRow } from '@/types/academic';
import type { StructureClass } from '@/types/structure';

export type ScopeMode = 'single' | 'multi' | 'grade-only';

export type ScopeReach = 'school' | 'teacher_assignment' | 'guardian_ward' | 'self';

export interface ScopeSection {
  id: string;
  name: string;
  label: string;
  students: number | null;
  capacity: number | null;
  room: string | null;
  classTeacher: string | null;
}

export interface ScopeGrade {
  level: number;
  id: string;
  name: string;
  students: number | null;
  sections: readonly ScopeSection[];
}

export interface SectionSeed {
  id: string;
  grade: number;
  name: string;
  gradeId?: string;
  gradeName?: string;
}

export interface ScopeLearner {
  id: string;
  name: string;
  grade: number;
  sectionId: string;
}

export type GradeHead = Omit<ScopeGrade, 'sections'>;

export interface MultiScope {
  reach: ScopeReach;
  grade: GradeHead | null;
  sections: readonly ScopeSection[];
  allSections: boolean;
  learner: ScopeLearner | null;
}

export interface LearningScope extends MultiScope {
  grade: GradeHead;
}

export type ScopePick = 'grade' | 'sections';

export interface ScopeChoice {
  grade: number | null;
  sections: readonly string[];
  learner: string | null;
  pick?: ScopePick;
  mine?: boolean;
}

export const offersMine = (reach: ScopeReach, mode: ScopeMode, grades: readonly ScopeGrade[]): boolean => mode === 'multi' && reach === 'teacher_assignment' && grades.length > 1;

const REACH_ORDER: readonly ScopeReach[] = ['school', 'teacher_assignment', 'guardian_ward', 'self'];

export function reachOf(capabilities: readonly Capability[], capabilityKey: string, preferred?: ScopeReach): ScopeReach | null {
  const held = new Set<ScopeReach>();
  for (const row of capabilities) {
    if (!row.key.startsWith(capabilityKey)) continue;
    if (row.action.endsWith('_all')) held.add('school');
    else if (row.reach === 'teacher_assignment' || row.reach === 'guardian_ward' || row.reach === 'self') held.add(row.reach);
    else if (!row.reach && row.breadth === 'school_wide') held.add('school');
  }
  if (preferred) return held.has(preferred) ? preferred : null;
  return REACH_ORDER.find((reach) => held.has(reach)) ?? null;
}

export const sectionLabel = (level: number, name: string): string => `${level}${name}`;

export function gradesOf(classes: readonly StructureClass[], sectionIds: ReadonlySet<string> | null): ScopeGrade[] {
  return [...classes]
    .sort((a, b) => a.order - b.order)
    .flatMap((row) => {
      const sections = row.sections
        .filter((section) => !section.archived && (sectionIds === null || sectionIds.has(section.id)))
        .map((section) => ({
          id: section.id,
          name: section.name,
          label: sectionLabel(row.order, section.name),
          students: section.students,
          capacity: section.capacity,
          room: section.room?.name ?? null,
          classTeacher: section.class_teacher?.name ?? null,
        }));
      if (sections.length === 0) return [];
      const students = sectionIds === null ? row.students : sections.reduce((total, section) => total + section.students, 0);
      return [{ level: row.order, id: row.grade_level_id, name: row.name, students, sections }];
    });
}

export function learnersOf(enrollments: readonly YearEnrollment[], studentIds: readonly string[], grades: readonly ScopeGrade[]): ScopeLearner[] {
  return studentIds.flatMap((studentId) => {
    const row = enrollments.find((enrollment) => enrollment.student_id === studentId && enrollment.status !== 'withdrawn');
    const grade = grades.find((option) => option.id === row?.grade_level_id);
    if (!row?.section_id || !grade) return [];
    return [{ id: row.student_id, name: row.name, grade: grade.level, sectionId: row.section_id }];
  });
}

const headOf = (grade: ScopeGrade): GradeHead => ({ level: grade.level, id: grade.id, name: grade.name, students: grade.students });

export const LEARNER_SCOPED: ReadonlySet<ScopeReach> = new Set(['guardian_ward', 'self']);

export function resolveScope(
  reach: ScopeReach,
  mode: ScopeMode,
  grades: readonly ScopeGrade[],
  learners: readonly ScopeLearner[],
  choice: ScopeChoice,
): MultiScope | null {
  if (LEARNER_SCOPED.has(reach)) {
    const learner = learners.length === 1 ? learners[0] : learners.find((row) => row.id === choice.learner);
    if (!learner) return null;
    const grade = grades.find((option) => option.level === learner.grade);
    const section = grade?.sections.find((option) => option.id === learner.sectionId);
    if (!grade || !section) return null;
    return { reach, grade: headOf(grade), sections: mode === 'grade-only' ? [] : [section], allSections: false, learner };
  }

  if (choice.mine && offersMine(reach, mode, grades)) return { reach, grade: null, sections: grades.flatMap((option) => option.sections), allSections: true, learner: null };
  if (choice.pick === 'grade' && grades.length > 1) return null;
  const grade = grades.length === 1 ? grades[0] : grades.find((option) => option.level === choice.grade);
  if (!grade) return null;
  const head = headOf(grade);
  const available = grade.sections;
  if (mode === 'grade-only') return { reach, grade: head, sections: [], allSections: true, learner: null };
  if (available.length === 1 && available[0]) return { reach, grade: head, sections: [available[0]], allSections: true, learner: null };
  if (choice.pick === 'sections') return null;
  if (mode === 'multi' && choice.sections.length === 0) return { reach, grade: head, sections: available, allSections: true, learner: null };
  const picked = available.filter((section) => choice.sections.includes(section.name));
  if (picked.length === 0 || picked.length !== choice.sections.length) return null;
  if (mode === 'single' && picked.length !== 1) return null;
  return { reach, grade: head, sections: picked, allSections: picked.length === available.length, learner: null };
}

export function chosenGrade(grades: readonly ScopeGrade[], choice: ScopeChoice): ScopeGrade | null {
  if (grades.length === 1) return grades[0] ?? null;
  return grades.find((option) => option.level === choice.grade) ?? null;
}

export function sectionsText(scope: MultiScope): string {
  if (scope.sections.length === 0) return '';
  if (scope.grade === null) return scope.sections.map((section) => section.label).join(', ');
  if (scope.sections.length > 1 && scope.allSections) return 'All sections';
  const names = scope.sections.map((section) => section.name).join(', ');
  return scope.sections.length === 1 ? `Section ${names}` : `Sections ${names}`;
}

export const choiceOf = (scope: MultiScope): ScopeChoice =>
  scope.grade === null
    ? { grade: null, sections: [], learner: null, mine: true }
    : { grade: scope.grade.level, sections: scope.sections.map((section) => section.name), learner: scope.learner?.id ?? null };

export function choiceOfSection(grades: readonly ScopeGrade[], sectionId: string | null): ScopeChoice | null {
  if (!sectionId) return null;
  for (const grade of grades) {
    const section = grade.sections.find((option) => option.id === sectionId);
    if (section) return { grade: grade.level, sections: [section.name], learner: null };
  }
  return null;
}

const sumStudents = (sections: readonly ScopeSection[]): number | null =>
  sections.every((section) => section.students !== null) ? sections.reduce((total, section) => total + (section.students ?? 0), 0) : null;

export function gradesFromSeeds(seeds: readonly SectionSeed[], sectionIds: ReadonlySet<string> | null): ScopeGrade[] {
  const byLevel = new Map<number, SectionSeed[]>();
  for (const seed of seeds) {
    if (sectionIds !== null && !sectionIds.has(seed.id)) continue;
    byLevel.set(seed.grade, [...(byLevel.get(seed.grade) ?? []), seed]);
  }
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, rows]) => {
      const sections = [...rows]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((row) => ({ id: row.id, name: row.name, label: sectionLabel(level, row.name), students: null, capacity: null, room: null, classTeacher: null }));
      return { level, id: rows[0]?.gradeId ?? `grade-${level}`, name: rows[0]?.gradeName ?? `Class ${level}`, students: sumStudents(sections), sections };
    });
}

const levelIn = (text: string | undefined): number | null => {
  const digits = text?.match(/\d{1,2}/)?.[0];
  return digits ? Number.parseInt(digits, 10) : null;
};

export function seedsOfRows(rows: readonly SectionRow[]): SectionSeed[] {
  return rows.flatMap((row) => {
    const grade = row.edges?.grade_level;
    const level = levelIn(grade?.code) ?? levelIn(grade?.name);
    const name = row.name ?? row.code;
    if (level === null || !name) return [];
    return [{ id: row.id, grade: level, name, gradeId: row.grade_level_id ?? grade?.id, gradeName: grade?.name }];
  });
}

export function adaptChoice(stored: ScopeChoice, reach: ScopeReach, mode: ScopeMode, grades: readonly ScopeGrade[], learners: readonly ScopeLearner[]): ScopeChoice | null {
  if (LEARNER_SCOPED.has(reach)) return learners.some((learner) => learner.id === stored.learner) ? { grade: null, sections: [], learner: stored.learner } : null;
  if (stored.mine && offersMine(reach, mode, grades)) return { grade: null, sections: [], learner: null, mine: true };
  const grade = grades.find((option) => option.level === stored.grade);
  if (!grade) return null;
  if (mode === 'grade-only') return { grade: grade.level, sections: [], learner: null };
  const valid = stored.sections.filter((name) => grade.sections.some((section) => section.name === name));
  const sections = mode === 'single' ? valid.slice(0, 1) : valid;
  return sections.length > 0 ? { grade: grade.level, sections, learner: null } : { grade: grade.level, sections: [], learner: null, pick: 'sections' };
}
