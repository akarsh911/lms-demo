import type { EnrollmentStatus, NextYearDisposition, YearEnrollment } from '@/types/foundation';

export const STATUS_LABEL: Readonly<Record<EnrollmentStatus, string>> = {
  new_admission: 'New admission',
  continuing: 'Continuing',
  promoted: 'Promoted',
  retained: 'Retained',
  withdrawn: 'Withdrawn',
  graduated: 'Graduated',
};

export const STATUS_TONE = {
  new_admission: 'blue',
  continuing: 'grey',
  promoted: 'green',
  retained: 'amber',
  withdrawn: 'grey',
  graduated: 'violet',
} as const satisfies Record<EnrollmentStatus, string>;

export const PLAN_LABEL: Readonly<Record<NextYearDisposition, string>> = {
  promote: 'Moving up a class',
  retain: 'Repeating the class',
  graduate: 'Finishing the final class',
  not_returning: 'Not returning',
  undecided: 'Next-year decision required',
};

// The views of a year's students. Each is a filter over the same rows; "unassigned" is a placement, not a status.
export const STUDENT_VIEWS = ['all', 'new_admission', 'promoted', 'continuing', 'retained', 'withdrawn', 'graduated', 'unassigned'] as const;

export type StudentView = (typeof STUDENT_VIEWS)[number];

export const VIEW_LABEL: Readonly<Record<StudentView, string>> = {
  all: 'All',
  new_admission: 'New Admissions',
  promoted: 'Promoted',
  continuing: 'Continuing',
  retained: 'Retained',
  withdrawn: 'Withdrawn',
  graduated: 'Graduated',
  unassigned: 'Unassigned',
};

export const isUnassigned = (row: YearEnrollment): boolean => row.status !== 'withdrawn' && row.section_id === null;

export function inView(row: YearEnrollment, view: StudentView): boolean {
  if (view === 'all') return true;
  return view === 'unassigned' ? isUnassigned(row) : row.status === view;
}

export interface ClassGroup {
  grade_level_id: string;
  class_name: string;
  rows: YearEnrollment[];
  sections: { key: string; name: string; rows: YearEnrollment[] }[];
}

// Rows by class, and within a class by section, with the unplaced first so they are never the group nobody opens.
export function groupByClass(rows: readonly YearEnrollment[]): ClassGroup[] {
  const groups = new Map<string, ClassGroup>();
  for (const row of [...rows].sort((a, b) => a.class_order - b.class_order)) {
    const group = groups.get(row.grade_level_id) ?? { grade_level_id: row.grade_level_id, class_name: row.class_name, rows: [], sections: [] };
    group.rows.push(row);
    groups.set(row.grade_level_id, group);
  }
  for (const group of groups.values()) {
    const sections = new Map<string, YearEnrollment[]>();
    for (const row of group.rows) sections.set(row.section_name ?? '', [...(sections.get(row.section_name ?? '') ?? []), row]);
    group.sections = [...sections.entries()]
      .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
      .map(([name, list]) => ({ key: name || 'unassigned', name: name === '' ? 'Unassigned' : `Section ${name}`, rows: list }));
  }
  return [...groups.values()];
}
