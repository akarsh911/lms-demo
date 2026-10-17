import type {
  GradeLevelRef,
  PeriodScheme,
  PeriodSchemeGradeLevel,
  SchemeGradeLinks,
} from '@/types/school';

export function schemeByGrade(
  pages: readonly SchemeGradeLinks[] | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const page of pages ?? []) {
    for (const row of page.rows) {
      if (row.grade_level_id) out.set(row.grade_level_id, page.schemeId);
    }
  }
  return out;
}

export function gradeLabel(
  link: PeriodSchemeGradeLevel,
  levels: readonly GradeLevelRef[],
): string {
  const level = levels.find((row) => row.id === link.grade_level_id);
  const named = level?.name ?? level?.code ?? link.edges?.grade_level?.name;
  if (named) return named;
  return link.grade_level_id ? `Grade ${link.grade_level_id.slice(0, 8)}` : 'Unknown grade';
}

export function gradeLevelLabel(level: GradeLevelRef): string {
  return level.name ?? level.code ?? `Grade ${level.id.slice(0, 8)}`;
}

export function schemeLabel(scheme: PeriodScheme | undefined): string {
  if (!scheme) return 'another pattern';
  return scheme.name ?? scheme.code ?? 'another pattern';
}

export function freeGradeLevels(
  levels: readonly GradeLevelRef[],
  holders: Map<string, string>,
): GradeLevelRef[] {
  return levels.filter((level) => !holders.has(level.id));
}

export function takenGradesFrom(details: unknown): string[] {
  if (typeof details !== 'object' || details === null) return [];
  const grades = (details as { grades?: unknown }).grades;
  if (!Array.isArray(grades)) return [];
  return grades.filter((name): name is string => typeof name === 'string');
}
