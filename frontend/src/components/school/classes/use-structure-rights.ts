'use client';

import { useReach } from '@/hooks/query/use-reach';
import { leadsSection } from '@/lib/reach/reach';

import type { SectionAct } from './section-act';
import type { StructureMode } from './structure-mode';

export interface StructureRights {
  // False until the caller's reach has loaded; no right is granted before then.
  ready: boolean;
  // Sections, rooms, class and subject teachers, subjects and moves between sections: the school office's.
  structure: boolean;
  // A section's register, roll numbers and groups: its class teacher's, and the office's.
  lead: (sectionId: string) => boolean;
}

export function useStructureRights(mode: StructureMode): StructureRights {
  const reach = useReach();
  const open = mode !== 'readOnly' && reach !== undefined;
  return {
    ready: reach !== undefined,
    structure: open && reach.kind === 'school',
    lead: (sectionId) => open && leadsSection(reach, sectionId),
  };
}

export const mayAct = (rights: StructureRights, act: SectionAct, sectionId: string): boolean => (act === 'rolls' ? rights.lead(sectionId) : rights.structure);
