'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import {
  useAcademicSessions,
  useBellSchedules,
  useBranches,
  usePeriodSchemes,
} from '@/hooks/query/use-school';
import { useUrlState } from './url-state';
import type { AcademicSessionRow, BellSchedule, BranchRow, PeriodScheme } from '@/types/school';

/**
 * What every school-administration screen has to settle before it can ask a
 * question: which branch, which academic session, and which pattern of periods.
 *
 * ## The session is found, not chosen
 *
 * Every list here defaults to the session flagged `is_current` and a calendar
 * day has to be created under one, so the current session is read once and used
 * everywhere. It is NOT a picker: editing last year's calendar is a different
 * screen with different warnings, and offering the year as a dropdown invites
 * someone to build next April's timetable into the year that is running.
 *
 * ## The scheme is chosen per branch, and a branch usually has one
 *
 * `period_schemes` are unique per (session, branch, code). A school with a
 * junior and a senior pattern has two; most have one, and when there is one the
 * picker does not draw itself — a select with a single option is furniture.
 */
export interface SchoolScope {
  branches: BranchRow[];
  branchId: string | null;
  setBranchId: (id: string) => void;

  sessionId: string | null;
  session: AcademicSessionRow | undefined;

  schemes: PeriodScheme[];
  schemeId: string | null;
  setSchemeId: (id: string) => void;

  bells: BellSchedule[];
  /** The bell chosen for reading times, defaulting to the school's default. */
  bellId: string | null;
  setBellId: (id: string) => void;

  isPending: boolean;
  isError: boolean;
  error: unknown;
}

export function useSchoolScope(): SchoolScope {
  const { get, put } = useUrlState();

  const branches = useBranches();
  const sessions = useAcademicSessions();

  const branchRows = branches.data?.rows ?? [];
  const chosenBranch = get('branch');
  const branchId =
    branchRows.find((row) => row.id === chosenBranch)?.id ?? branchRows[0]?.id ?? null;

  const sessionRows = sessions.data?.rows ?? [];
  const session = sessionRows.find((row) => row.is_current) ?? sessionRows[0];

  const schemes = usePeriodSchemes(branchId);
  const schemeRows = schemes.data?.rows ?? [];
  const chosenScheme = get('scheme');
  const schemeId =
    schemeRows.find((row) => row.id === chosenScheme)?.id ?? schemeRows[0]?.id ?? null;

  const bells = useBellSchedules(schemeId);
  const bellRows = bells.data?.rows ?? [];
  const chosenBell = get('bell');
  const bellId =
    bellRows.find((row) => row.id === chosenBell)?.id ??
    bellRows.find((row) => row.is_default)?.id ??
    bellRows[0]?.id ??
    null;

  return {
    branches: branchRows,
    branchId,
    setBranchId: (id) => put({ branch: id, scheme: null, bell: null, section: null }),
    sessionId: session?.id ?? null,
    session,
    schemes: schemeRows,
    schemeId,
    setSchemeId: (id) => put({ scheme: id, bell: null }),
    bells: bellRows,
    bellId,
    setBellId: (id) => put({ bell: id }),
    isPending: branches.isPending || sessions.isPending,
    isError: branches.isError || sessions.isError,
    error: branches.error ?? sessions.error,
  };
}

/**
 * The controls for the above, drawn only where there is a choice to make.
 *
 * `showBells` is off by default: the calendar and the rooms have no opinion
 * about which bell is ringing, and the builder does, because it renders times
 * against one.
 */
export function SchoolScopeBar({
  scope,
  showScheme = true,
  showBells = false,
}: {
  scope: SchoolScope;
  showScheme?: boolean;
  showBells?: boolean;
}): React.ReactElement | null {
  const noBranches = scope.branches.length === 0 && !scope.isPending;
  const hasChoice =
    scope.branches.length > 1 || (showScheme && scope.schemes.length > 1) || (showBells && scope.bells.length > 1);
  // With one branch and nothing to choose, an empty bar would still take a row of spacing.
  if (!hasChoice && !noBranches) return null;

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}>
        {scope.branches.length > 1 ? (
          <TextField
            select
            size="small"
            label="Branch"
            value={scope.branchId ?? ''}
            onChange={(event) => scope.setBranchId(event.target.value)}
            sx={{ minWidth: 220 }}
          >
            {scope.branches.map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name ?? branch.code ?? branch.id}
              </MenuItem>
            ))}
          </TextField>
        ) : null}

        {showScheme && scope.schemes.length > 1 ? (
          <TextField
            select
            size="small"
            label="Period scheme"
            value={scope.schemeId ?? ''}
            onChange={(event) => scope.setSchemeId(event.target.value)}
            sx={{ minWidth: 220 }}
          >
            {scope.schemes.map((scheme) => (
              <MenuItem key={scheme.id} value={scheme.id}>
                {scheme.name ?? scheme.code ?? scheme.id}
              </MenuItem>
            ))}
          </TextField>
        ) : null}

        {showBells && scope.bells.length > 1 ? (
          <TextField
            select
            size="small"
            label="Times shown from"
            value={scope.bellId ?? ''}
            onChange={(event) => scope.setBellId(event.target.value)}
            sx={{ minWidth: 220 }}
            helperText="Periods carry no times of their own"
          >
            {scope.bells.map((bell) => (
              <MenuItem key={bell.id} value={bell.id}>
                {bell.name ?? bell.code ?? bell.id}
                {bell.is_default ? ' (default)' : ''}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </Stack>

      {noBranches ? (
        <Alert severity="info" variant="outlined">
          This school has no branches yet, so there is nothing to build a year or a
          week against.
        </Alert>
      ) : null}
    </Stack>
  );
}
