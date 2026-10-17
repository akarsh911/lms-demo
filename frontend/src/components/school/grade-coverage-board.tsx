'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import {
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import {
  useBranchSchemeGrades,
  useGradeLevels,
  usePeriodSchemes,
} from '@/hooks/query/use-school';
import { gradeLevelLabel, schemeByGrade, schemeLabel } from '@/lib/school/scheme-grades';
import { useSchoolScope } from './school-scope';

export function GradeCoverageBoard(): React.ReactElement {
  const scope = useSchoolScope();

  const levels = useGradeLevels();
  const schemes = usePeriodSchemes(scope.branchId);
  const schemeRows = React.useMemo(() => schemes.data?.rows ?? [], [schemes.data]);
  const links = useBranchSchemeGrades(
    React.useMemo(() => schemeRows.map((row) => row.id), [schemeRows]),
  );

  const holders = schemeByGrade(links.data);
  const levelRows = React.useMemo(
    () =>
      [...(levels.data?.rows ?? [])].sort(
        (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
      ),
    [levels.data],
  );
  const adrift = levelRows.filter((level) => !holders.has(level.id));

  const pending =
    levels.isPending ||
    (scope.branchId !== null && schemes.isPending) ||
    (schemeRows.length > 0 && links.isPending);
  const failure = levels.isError
    ? levels.error
    : schemes.isError
      ? schemes.error
      : links.isError
        ? links.error
        : null;

  return (
    <Stack spacing={2.5}>
      <SectionHeader
        title="Which grade runs which pattern"
        subtitle="One pattern per grade, per campus and year. Change it by opening that pattern above and attaching or detaching the grade."
      />

      {pending ? <WidgetLoading rows={5} /> : null}
      {failure ? (
        <WidgetError
          error={failure}
          onRetry={() => {
            void levels.refetch();
            void schemes.refetch();
            void links.refetch();
          }}
        />
      ) : null}

      {!pending && !failure && levelRows.length === 0 ? (
        <WidgetEmpty message="This school has no grade levels yet, so there is nobody for a pattern of the day to describe." />
      ) : null}

      {!pending && !failure && levelRows.length > 0 ? (
        <>
          {adrift.length > 0 ? (
            <Alert severity="warning" variant="outlined">
              {adrift.length === 1 && adrift[0]
                ? `${gradeLevelLabel(adrift[0])} runs no pattern of the day.`
                : `${adrift.length} grades run no pattern of the day.`}{' '}
              A grade with no pattern has no periods, so no timetable can be built for
              it and nothing can be scheduled against its sections.
            </Alert>
          ) : null}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Grade</TableCell>
                  <TableCell>Runs</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {levelRows.map((level) => {
                  const holder = holders.get(level.id);
                  const scheme = schemeRows.find((row) => row.id === holder);
                  return (
                    <TableRow key={level.id} hover>
                      <TableCell>
                        <Typography variant="body2">{gradeLevelLabel(level)}</Typography>
                      </TableCell>
                      <TableCell>
                        {holder ? (
                          <EmergeChip label={schemeLabel(scheme)} tone="teal" />
                        ) : (
                          <EmergeChip label="No pattern" tone="amber" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : null}
    </Stack>
  );
}
