'use client';

import * as React from 'react';
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
import { durationLabel } from '@/lib/school/time';
import type { OfferingProgress } from '@/lib/school/grid';
import type { NameBook } from './name-book';

/**
 * What this class's week still owes each subject.
 *
 * Two obligations, reported separately because they are different promises:
 *
 *   `periods_per_week`  the hard placement constraint — how many times this
 *                       subject should appear in the grid.
 *   `minutes_per_week`  the stated obligation — how long that adds up to, which
 *                       a syllabus or a board states in minutes and a
 *                       timetabler satisfies in periods of unequal length.
 *
 * They can legitimately disagree. Six 40-minute periods is 240 minutes, and an
 * obligation of 300 is not met by a count that looks right. That gap is a
 * FINDING to show, not an error to block on, so nothing here refuses anything —
 * it reports.
 *
 * An offering that states NEITHER is a third case, and is not drawn as "0 of 0
 * placed", which reads as satisfied. It says what is placed and that nothing
 * was asked for, because a subject nobody set a target for has not met one.
 *
 * Minutes are a FLOOR when some placed period has no time in the bell being
 * read: `times_resolved` is false for those, and counting them as zero would
 * report a shortfall the school does not have.
 */
export function RequirementsPanel({
  progress,
  names,
}: {
  progress: readonly OfferingProgress[];
  names: NameBook;
}): React.ReactElement {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Subject</TableCell>
            <TableCell>Periods</TableCell>
            <TableCell>Minutes</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {progress.map((row) => (
            <TableRow key={row.offering.id} hover>
              <TableCell>
                <Typography variant="body2">{names.offering(row.offering.id)}</Typography>
              </TableCell>

              <TableCell>
                <Typography variant="body2">
                  {row.requiredPeriods === null
                    ? `${row.placed} placed`
                    : `${row.placed} of ${row.requiredPeriods} placed`}
                </Typography>
              </TableCell>

              <TableCell>
                <Typography variant="body2">
                  {row.requiredMinutes === null
                    ? durationLabel(row.minutesPlaced)
                    : `${row.minutesPlaced} of ${row.requiredMinutes} minutes`}
                </Typography>
                {row.untimed > 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    {row.untimed} placed {row.untimed === 1 ? 'period has' : 'periods have'}{' '}
                    no time in this bell
                  </Typography>
                ) : null}
              </TableCell>

              <TableCell>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
                  {row.requiredPeriods === null && row.requiredMinutes === null ? (
                    <EmergeChip label="No requirement stated" tone="grey" />
                  ) : null}
                  {row.periodsMatch === false ? (
                    <EmergeChip
                      label={
                        row.requiredPeriods !== null && row.placed < row.requiredPeriods
                          ? `${row.requiredPeriods - row.placed} short`
                          : 'Over'
                      }
                      tone="orange"
                    />
                  ) : null}
                  {row.minutesMatch === false ? (
                    <EmergeChip label="Minutes differ" tone="amber" />
                  ) : null}
                  {row.periodsMatch === true && row.minutesMatch !== false ? (
                    <EmergeChip label="Met" tone="green" />
                  ) : null}
                </Stack>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
