'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { X } from 'lucide-react';

import { useRememberedGrade } from '@/components/learning-scope/use-remembered-grade';
import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { useBlueprints } from '@/hooks/query/use-blueprints';
import { useMdmGradeLevels } from '@/hooks/query/use-mdm';

const GRADE_PARAM = 'grade';
const EVERY_CLASS = 'all';

export function usePaperGrade(): number | null {
  const { get } = useUrlState();
  const remembered = useRememberedGrade();
  const raw = get(GRADE_PARAM);
  if (raw === EVERY_CLASS) return null;
  if (raw && /^\d{1,2}$/.test(raw)) return Number.parseInt(raw, 10);
  return remembered;
}

export function useBlueprintLevel(): (blueprintId: string | undefined) => number | null {
  const blueprints = useBlueprints('all');
  const grades = useMdmGradeLevels();
  return React.useMemo(() => {
    const levels = new Map((grades.data?.rows ?? []).map((row) => [row.id, row.sequence ?? null]));
    const byBlueprint = new Map((blueprints.data?.rows ?? []).map((row) => [row.id, levels.get(row.grade_level_id ?? '') ?? null]));
    return (blueprintId) => (blueprintId ? (byBlueprint.get(blueprintId) ?? null) : null);
  }, [blueprints.data, grades.data]);
}

export function PaperGradeNote(): React.ReactElement | null {
  const level = usePaperGrade();
  const { get, put } = useUrlState();
  const unstated = get(GRADE_PARAM) === null;
  React.useEffect(() => {
    if (unstated && level !== null) put({ [GRADE_PARAM]: String(level) });
  }, [unstated, level, put]);
  if (level === null) return null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
      <EmergeChip label={`Showing Class ${level} only`} tone="indigo" />
      <Button size="small" startIcon={<X size={14} />} onClick={() => put({ [GRADE_PARAM]: EVERY_CLASS })}>
        Show every class
      </Button>
    </Stack>
  );
}
