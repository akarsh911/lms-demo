'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { rollLine } from '@/lib/classroom/roll';
import { nameOf, personOf } from '@/lib/core/roster';
import { trimNumber } from '@/lib/exams/exam';
import {
  DRAFT_STATUS_LABELS,
  isUnsavableClear,
  markWithheld,
  rowProblem,
  sameAsSaved,
  type DraftStatus,
  type MarkDraft,
} from '@/lib/exams/marks';
import type { PaperRosterRow } from '@/lib/exams/paper-roster';
import { EXAM_MARK_STATUSES, type ExamMarkRow } from '@/types/exam-marks';

const WITHHELD_NAME = 'Name not shown to you';

const STATUS_TONE: Record<DraftStatus, 'green' | 'amber' | 'grey'> = {
  blank: 'grey',
  marked: 'green',
  absent: 'amber',
  exempt: 'grey',
};

export interface MarksGridProps {
  rows: readonly PaperRosterRow[];
  draftFor: (studentId: string) => MarkDraft;
  savedFor: (studentId: string) => ExamMarkRow | undefined;
  onDraft: (studentId: string, draft: MarkDraft) => void;
  maximum: number | undefined;
  mayWrite: boolean;
  refused: ReadonlySet<string>;
}

export function MarksGrid({
  rows,
  draftFor,
  savedFor,
  onDraft,
  maximum,
  mayWrite,
  refused,
}: MarksGridProps): React.ReactElement {
  const inputs = React.useRef(new Map<string, HTMLInputElement>());

  const focusRow = React.useCallback(
    (index: number) => {
      const target = rows[index];
      if (!target) return;
      const field = inputs.current.get(target.studentId);
      field?.focus();
      field?.select();
    },
    [rows],
  );

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    index: number,
    studentId: string,
  ): void => {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusRow(index + 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusRow(index - 1);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const pressed = event.key.toLowerCase();
    if (pressed !== 'a' && pressed !== 'e') return;
    event.preventDefault();
    onDraft(studentId, { status: pressed === 'a' ? 'absent' : 'exempt', value: '' });
    focusRow(index + 1);
  };

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 64 }}>Roll</TableCell>
            <TableCell>Pupil</TableCell>
            <TableCell sx={{ width: 180 }}>
              Mark{maximum === undefined ? '' : ` out of ${trimNumber(maximum)}`}
            </TableCell>
            <TableCell sx={{ width: 190 }}>State</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => {
            const { studentId, entry } = row;
            const person = entry.student ? personOf('students', entry.student) : null;
            const name =
              person?.status === 'present'
                ? (nameOf(person.person) ?? WITHHELD_NAME)
                : WITHHELD_NAME;

            const draft = draftFor(studentId);
            const saved = savedFor(studentId);
            const problem = rowProblem(draft, saved, maximum);
            const changed = !sameAsSaved(draft, saved);
            const wasRefused = refused.has(studentId);
            const secondary = rollLine(entry);

            return (
              <TableRow
                key={studentId}
                sx={{
                  borderLeft: '4px solid',
                  borderLeftColor: wasRefused
                    ? 'error.main'
                    : changed
                      ? 'primary.main'
                      : 'transparent',
                }}
              >
                <TableCell>
                  <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                    {entry.enrollment?.roll_number ?? '—'}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {name}
                  </Typography>
                  {secondary ? (
                    <Typography variant="caption" color="text.secondary">
                      {secondary}
                    </Typography>
                  ) : null}
                </TableCell>

                <TableCell>
                  {mayWrite ? (
                    <TextField
                      size="small"
                      value={draft.status === 'marked' ? draft.value : ''}
                      error={Boolean(problem)}
                      helperText={helperFor(draft, saved, problem)}
                      placeholder={
                        draft.status === 'marked' || draft.status === 'blank'
                          ? ''
                          : DRAFT_STATUS_LABELS[draft.status]
                      }
                      inputRef={(node: HTMLInputElement | null) => {
                        if (node) inputs.current.set(studentId, node);
                        else inputs.current.delete(studentId);
                      }}
                      onKeyDown={(event) => onKeyDown(event, index, studentId)}
                      onChange={(event) =>
                        onDraft(studentId, {
                          status: event.target.value.trim() === '' ? 'blank' : 'marked',
                          value: event.target.value,
                        })
                      }
                      slotProps={{
                        htmlInput: {
                          inputMode: 'decimal',
                          autoComplete: 'off',
                          spellCheck: false,
                          'aria-label': `Mark for ${name}`,
                        },
                      }}
                      sx={{ width: 160, '& input': { fontVariantNumeric: 'tabular-nums' } }}
                    />
                  ) : (
                    <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {savedMarkText(saved)}
                    </Typography>
                  )}
                </TableCell>

                <TableCell>
                  <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                    {mayWrite ? (
                      <TextField
                        select
                        size="small"
                        value={draft.status === 'blank' ? '' : draft.status}
                        slotProps={{
                          select: {
                            'aria-label': `State of the mark for ${name}`,
                            displayEmpty: true,
                            renderValue: (value: unknown) =>
                              value ? (
                                DRAFT_STATUS_LABELS[value as DraftStatus]
                              ) : (
                                <Box component="span" sx={{ color: 'text.disabled' }}>
                                  {DRAFT_STATUS_LABELS.blank}
                                </Box>
                              ),
                          },
                        }}
                        onChange={(event) =>
                          onDraft(studentId, {
                            status: event.target.value as DraftStatus,
                            value: event.target.value === 'marked' ? draft.value : '',
                          })
                        }
                        sx={{ width: 170 }}
                      >
                        {EXAM_MARK_STATUSES.map((status) => (
                          <MenuItem key={status} value={status}>
                            {DRAFT_STATUS_LABELS[status]}
                          </MenuItem>
                        ))}
                      </TextField>
                    ) : (
                      <EmergeChip
                        label={DRAFT_STATUS_LABELS[draft.status]}
                        tone={STATUS_TONE[draft.status]}
                      />
                    )}
                    {saved?.provisional ? (
                      <EmergeChip dot tone="amber" label="Provisional" />
                    ) : null}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function helperFor(
  draft: MarkDraft,
  saved: ExamMarkRow | undefined,
  problem: string | null,
): string | undefined {
  if (problem) return problem;
  if (isUnsavableClear(draft, saved)) {
    return 'Emptying a box does not remove a saved mark. Type another, or record absent or exempt.';
  }
  if (draft.status === 'marked' && draft.value.trim() === '' && markWithheld(saved)) {
    return 'This pupil is marked and the number is not one you may read.';
  }
  return undefined;
}

function savedMarkText(saved: ExamMarkRow | undefined): string {
  if (!saved?.status) return '—';
  if (saved.status !== 'marked') return '—';
  return saved.marks_obtained === undefined
    ? 'Not shown to you'
    : trimNumber(saved.marks_obtained);
}
