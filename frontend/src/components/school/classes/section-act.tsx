'use client';

import * as React from 'react';

import type { YearEnrollment } from '@/types/foundation';
import type { StructureClass, StructureSection } from '@/types/structure';

import { MergeDialog } from './merge-dialog';
import { RollDialog } from './roll-dialog';
import { RoomDialog } from './room-dialog';
import { SectionDialog } from './section-dialog';
import { SplitDialog } from './split-dialog';
import { TeacherDialog } from './teacher-dialog';

import { shortSection } from './structure-mode';

export const SECTION_ACTS = ['edit', 'room', 'teacher', 'rolls', 'merge', 'split'] as const;
export type SectionAct = (typeof SECTION_ACTS)[number];

export const isSectionAct = (value: string | null): value is SectionAct => SECTION_ACTS.some((act) => act === value);

// The one dialog a section action opens. `section` null with `edit` adds a new section.
export function SectionActDialog({
  act,
  section,
  yearId,
  row,
  pupils,
  onClose,
  onGone,
}: {
  act: SectionAct;
  section: StructureSection | null;
  yearId: string;
  row: StructureClass;
  pupils: readonly YearEnrollment[];
  onClose: () => void;
  // The section no longer exists under this name (merged away); the caller decides where to go.
  onGone?: () => void;
}): React.ReactElement | null {
  const taken = row.sections.map((s) => s.name.toUpperCase());
  const label = section ? shortSection(row.name, section.name) : row.name;
  const inSection = pupils.filter((p) => p.section_id === section?.id);

  if (act === 'edit') return <SectionDialog yearId={yearId} gradeId={row.grade_level_id} className={row.name} section={section} taken={taken} onClose={onClose} />;
  if (!section) return null;
  switch (act) {
    case 'room':
      return <RoomDialog yearId={yearId} label={label} section={section} onClose={onClose} />;
    case 'teacher':
      return <TeacherDialog yearId={yearId} label={label} section={section} onClose={onClose} />;
    case 'rolls':
      return <RollDialog label={label} sectionId={section.id} rows={inSection} onClose={onClose} />;
    case 'merge':
      return <MergeDialog className={row.name} from={section} siblings={row.sections} onClose={onClose} onMerged={onGone ?? onClose} />;
    case 'split':
      return <SplitDialog yearId={yearId} gradeId={row.grade_level_id} className={row.name} from={section} rows={inSection} taken={taken} onClose={onClose} onSplit={onClose} />;
    default: {
      const never: never = act;
      return never;
    }
  }
}
