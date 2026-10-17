import type { StructureFix } from '@/types/structure';

export interface FixTarget {
  grade_level_id: string;
  section_id: string | null;
  fix: StructureFix;
}

// Where a class or section gap is fixed, below a class base path: the board, the class's tabs, or the section with its dialog open.
export function fixPath(target: FixTarget): { tail: string; query: Record<string, string> } {
  const { grade_level_id: grade, section_id: section, fix } = target;
  if (fix === 'arrange') return { tail: `${grade}/arrange`, query: {} };
  if (fix === 'teaching') return section ? { tail: `${grade}/${section}`, query: { tab: 'subjects' } } : { tail: grade, query: { tab: 'subjects' } };
  if (!section || fix === 'sections') return { tail: grade, query: {} };
  return { tail: `${grade}/${section}`, query: { act: fix === 'capacity' ? 'room' : fix } };
}

export const withQuery = (path: string, query: Record<string, string>): string => {
  const search = new URLSearchParams(query).toString();
  return search ? `${path}?${search}` : path;
};
