'use client';

import * as React from 'react';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import type { RosterStudent } from '@/lib/answer-checker/roster-match';
import { trimNumber } from '@/lib/exams/exam';
import type { OmrMarkingResult, OmrOutcome, OmrSheetIn } from '@/types/answer-checker';

import { ActionIcon } from './action-icon';
import { BubbleGrid } from './bubble-grid';

export interface OmrRow {
  sheet: OmrSheetIn;
  result: OmrMarkingResult | null;
  source: 'json' | 'image';
  student: RosterStudent | null;
}

export function OmrSheetsTable({
  rows,
  numbers,
  onEdit,
}: {
  rows: readonly OmrRow[];
  numbers: readonly number[];
  onEdit: (roll: string, sheet: OmrSheetIn) => void;
}): React.ReactElement {
  const [open, setOpen] = React.useState<string | null>(null);

  return (
    <TableContainer>
      <Table size="small" aria-label="Bubble sheets">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 56 }}>Roll</TableCell>
            <TableCell>Pupil</TableCell>
            <TableCell sx={{ width: 88, display: { xs: 'none', sm: 'table-cell' } }}>Filled</TableCell>
            <TableCell sx={{ width: 180 }}>Score</TableCell>
            <TableCell sx={{ width: 48 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(({ sheet, result, source, student }) => {
            const key = sheet.roll_number;
            const outcomes = new Map<number, OmrOutcome>((result?.questions ?? []).map((row) => [row.n, row.outcome]));
            return (
              <React.Fragment key={key}>
                <TableRow hover>
                  <TableCell>{sheet.roll_number || '—'}</TableCell>
                  <TableCell>
                    {student?.name || sheet.name || '—'}
                    {student ? null : (
                      <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                        Not in class
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {sheet.responses.filter((response) => response.chosen.length > 0).length} / {numbers.length}
                  </TableCell>
                  <TableCell>
                    {result ? (
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {trimNumber(result.awarded)} / {trimNumber(result.paper_marks)}
                        </Typography>
                        {source === 'image' ? <EmergeChip label="Scan" tone="blue" /> : null}
                        {(result.tally.multiple ?? 0) > 0 ? <EmergeChip label={`${result.tally.multiple}×2`} tone="amber" /> : null}
                        {!result.complete ? <EmergeChip label={`${result.unmarkable_questions.length} no key`} tone="red" /> : null}
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        —
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <ActionIcon label={open === key ? 'Hide bubbles' : 'Bubbles'} onClick={() => setOpen(open === key ? null : key)}>
                      {open === key ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </ActionIcon>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 0, borderBottom: open === key ? undefined : 0 }}>
                    <Collapse in={open === key} unmountOnExit>
                      <Stack sx={{ py: 1.5 }}>
                        <BubbleGrid
                          numbers={numbers}
                          responses={sheet.responses}
                          outcomes={outcomes}
                          label={`Bubbles for ${student?.name || sheet.name || sheet.roll_number}`}
                          onChange={(responses) => onEdit(key, { ...sheet, responses })}
                        />
                      </Stack>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
