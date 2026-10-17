import type { YearLifecycle } from '@/types/foundation';

// What the screens may do with a year: set it up, run it, or only read it.
export type StructureMode = 'setup' | 'active' | 'readOnly';

export const modeOf = (lifecycle: YearLifecycle): StructureMode => (lifecycle === 'closed' ? 'readOnly' : lifecycle === 'draft' ? 'setup' : 'active');

// Where this year's classes live: under the year, or under the sidebar's Classes & Sections for the current year.
export interface StructureBase {
  // Path under the persona, without a leading slash, e.g. `sections` or `school/years/{id}/classes`.
  path: string;
}

export const classHref = (base: StructureBase, gradeId: string): string => `${base.path}/${gradeId}`;
export const sectionHref = (base: StructureBase, gradeId: string, sectionId: string): string => `${base.path}/${gradeId}/${sectionId}`;
export const arrangeHref = (base: StructureBase, gradeId: string): string => `${base.path}/${gradeId}/arrange`;

// "Class 8" and "B" as the school writes it: 8B.
export const shortSection = (className: string, section: string): string => `${className.replace(/^Class\s+/, '')}${section}`;
