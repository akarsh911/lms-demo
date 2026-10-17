'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { Segmented, type SegmentedOption } from '@/components/ui/segmented';
import { useUrlState } from '@/components/school/url-state';
import { useAcademicSessions } from '@/hooks/query/use-school';
import type { AcademicSessionRow } from '@/types/school';

export type PaperYearView = 'current' | 'all';

export type BlueprintView = 'current' | 'reusable' | 'all';

const PAPER_YEAR_OPTIONS: readonly SegmentedOption<PaperYearView>[] = [
  { value: 'current', label: 'This year' },
  { value: 'all', label: 'Every year' },
];

const BLUEPRINT_OPTIONS: readonly SegmentedOption<BlueprintView>[] = [
  { value: 'current', label: 'This year' },
  { value: 'reusable', label: 'Reusable templates' },
  { value: 'all', label: 'Every year' },
];

export interface PaperSessions {
  sessions: AcademicSessionRow[];
  current: AcademicSessionRow | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
}

export function usePaperSessions(): PaperSessions {
  const sessions = useAcademicSessions();
  const rows = sessions.data?.rows ?? [];
  return {
    sessions: rows,
    current: rows.find((row) => row.is_current) ?? rows[0],
    isPending: sessions.isPending,
    isError: sessions.isError,
    error: sessions.error,
  };
}

export function sessionLabel(
  sessions: readonly AcademicSessionRow[],
  id: string | undefined,
): string | null {
  if (!id) return null;
  const row = sessions.find((session) => session.id === id);
  if (!row) return id;
  return row.name ?? row.code ?? row.id;
}

export function useViewState<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const { get, put } = useUrlState();
  const chosen = get(key);
  const view = allowed.find((option) => option === chosen) ?? fallback;
  const setView = React.useCallback(
    (next: T) => put({ [key]: next === fallback ? null : next, paper: null, pattern: null }),
    [fallback, key, put],
  );
  return { view, setView };
}

export function PaperYearBar({
  view,
  onChange,
  caption,
  action,
}: {
  view: PaperYearView;
  onChange: (next: PaperYearView) => void;
  caption: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <CardToolbar
      start={<Segmented options={PAPER_YEAR_OPTIONS} value={view} onChange={onChange} ariaLabel="Which years of papers to list" />}
      summary={caption}
    >
      {action}
    </CardToolbar>
  );
}

export function BlueprintScopeBar({
  view,
  onChange,
  caption,
  action,
}: {
  view: BlueprintView;
  onChange: (next: BlueprintView) => void;
  caption: string;
  action?: React.ReactNode;
}): React.ReactElement {
  return (
    <CardToolbar
      start={<Segmented options={BLUEPRINT_OPTIONS} value={view} onChange={onChange} ariaLabel="Which patterns to list" />}
      summary={caption}
    >
      {action}
    </CardToolbar>
  );
}

export const PAPER_YEAR_VIEWS: readonly PaperYearView[] = ['current', 'all'];

export const BLUEPRINT_VIEWS: readonly BlueprintView[] = ['current', 'reusable', 'all'];
