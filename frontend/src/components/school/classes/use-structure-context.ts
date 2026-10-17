'use client';

import { useYearEnrollments } from '@/hooks/query/use-foundation';
import { useYearStructure } from '@/hooks/query/use-structure';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { yearLifecycle } from '@/lib/school/years';
import type { YearEnrollment } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';
import type { StructureClass } from '@/types/structure';

import { modeOf, type StructureMode } from './structure-mode';

export interface StructureContext {
  year: AcademicSession | undefined;
  row: StructureClass | undefined;
  // This class's active pupils this year, placed or not.
  pupils: YearEnrollment[];
  mode: StructureMode;
  isPending: boolean;
  error: Error | null;
  refetch: () => void;
}

// The year (the current one when none is named), the class within it, its pupils, and what may be done with them.
export function useStructureContext(yearId: string | undefined, gradeId: string): StructureContext {
  const sessions = useMdmSessions();
  const year = sessions.data?.rows.find((row) => (yearId ? row.id === yearId : row.is_current));
  const structure = useYearStructure(year?.id);
  const enrollments = useYearEnrollments(year?.id ?? '');
  return {
    year,
    row: structure.data?.classes.find((c) => c.grade_level_id === gradeId),
    pupils: (enrollments.data ?? []).filter((e) => e.grade_level_id === gradeId && e.status !== 'withdrawn'),
    mode: year ? modeOf(yearLifecycle(year)) : 'readOnly',
    isPending: sessions.isPending || (Boolean(year) && (structure.isPending || enrollments.isPending)),
    error: sessions.error ?? structure.error ?? enrollments.error ?? null,
    refetch: () => {
      void sessions.refetch();
      void structure.refetch();
      void enrollments.refetch();
    },
  };
}
