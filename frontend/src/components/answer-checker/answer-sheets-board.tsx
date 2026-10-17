'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import CardHeader from '@mui/material/CardHeader';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { ArrowRight, RotateCcw } from 'lucide-react';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { RowMenu } from '@/components/ui/row-menu';
import { useToast } from '@/components/ui/toast';
import { WidgetDegraded, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useQueries } from '@tanstack/react-query';

import { config } from '@/config';
import { queryKeys } from '@/constants/query-keys';
import { useResetDemo } from '@/hooks/mutation/use-answer-checker';
import { useCheckablePapers, useCheckerExams } from '@/hooks/query/use-answer-checker';
import { linkedPaperId, paperClassLine, paperTitle, readyToCheck, sectionLetter } from '@/lib/answer-checker/paper';
import { trimNumber } from '@/lib/exams/exam';
import { omrService } from '@/services/omr';
import type { CheckerExamSummary, CheckerStage } from '@/types/answer-checker';
import type { PaperSummary } from '@/types/papersetter';

import { mayCheck, type CheckingReach } from './use-checking-reach';

const STAGE_LABELS: Record<CheckerStage, string> = {
  created: 'Started',
  rubric: 'Scheme',
  collecting: 'Collecting',
  verifying: 'Names',
  marking: 'Marking',
  reviewing: 'Reviewing',
  done: 'Done',
};

const STAGE_TONES: Record<CheckerStage, ChipTone> = {
  created: 'grey',
  rubric: 'blue',
  collecting: 'blue',
  verifying: 'amber',
  marking: 'violet',
  reviewing: 'green',
  done: 'green',
};

const NARROW_HIDDEN = { display: { xs: 'none', sm: 'table-cell' } } as const;

function ResetDemo(): React.ReactElement {
  const reset = useResetDemo();
  const notify = useToast();
  const [confirming, setConfirming] = React.useState(false);
  return (
    <>
      <RowMenu label="Demo actions" actions={[{ label: 'Reset demo', icon: <RotateCcw size={16} />, destructive: true, onSelect: () => setConfirming(true) }]} />
      {confirming ? (
        <ConfirmDialog
          title="Reset the demo?"
          body="Every paper goes back to its seeded state: bubble sheets scored on the objective tests are cleared, and papers checked since the page loaded start again."
          confirmLabel="Reset demo"
          pending={reset.isPending}
          error={reset.error}
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            reset.mutate(undefined, {
              onSuccess: () => {
                setConfirming(false);
                notify('Demo reset');
              },
            })
          }
        />
      ) : null}
    </>
  );
}

function latestByPaper(exams: readonly CheckerExamSummary[]): Map<string, CheckerExamSummary> {
  const out = new Map<string, CheckerExamSummary>();
  for (const exam of exams) {
    const paperId = linkedPaperId(exam.name);
    if (!paperId) continue;
    const held = out.get(paperId);
    if (!held || held.updated_at < exam.updated_at) out.set(paperId, exam);
  }
  return out;
}

function classKey(paper: PaperSummary): string {
  const letter = sectionLetter(paper);
  return paper.class_id ? `${paper.class_id}${letter ?? ''}` : 'Other';
}

const ALL_CLASSES = 'all';

export function AnswerSheetsBoard({ reach, onOpen }: { reach: CheckingReach; onOpen: (paperId: string, examId: string | null, bubbles: boolean) => void }): React.ReactElement {
  const papers = useCheckablePapers();
  const exams = useCheckerExams();
  const linked = React.useMemo(() => latestByPaper(exams.data ?? []), [exams.data]);
  const ready = (papers.data ?? []).filter((paper) => readyToCheck(paper) && mayCheck(reach, paper));
  const [klass, setKlass] = React.useState(ALL_CLASSES);
  const sheets = useQueries({
    queries: ready.map((paper) => ({
      queryKey: queryKeys.answerChecker.omrSheets(paper.paper_id),
      queryFn: ({ signal }: { signal: AbortSignal }) => omrService.listSheets(paper.paper_id, signal),
      retry: false,
    })),
  });

  if (papers.isPending) return <WidgetLoading rows={4} />;
  if (papers.isError) return <WidgetError error={papers.error} onRetry={() => void papers.refetch()} />;

  const classes = [...new Set(ready.map(classKey))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  const rows = ready
    .map((paper, index) => {
      const exam = linked.get(paper.paper_id);
      const scored = sheets[index]?.data?.sheets.length ?? 0;
      return { paper, exam, scored, started: Boolean(exam) || scored > 0 };
    })
    .filter((row) => klass === ALL_CLASSES || classKey(row.paper) === klass);
  const nextUp = rows.find((row) => row.exam && row.exam.stage !== 'done') ?? rows.find((row) => !row.started);
  const open = (row: (typeof rows)[number]): void => onOpen(row.paper.paper_id, row.exam?.id ?? null, !row.exam && row.scored > 0);

  const status = (row: (typeof rows)[number]): React.ReactElement =>
    row.exam ? (
      <EmergeChip label={`${STAGE_LABELS[row.exam.stage]} · ${row.exam.marked}/${row.exam.booklets}`} tone={STAGE_TONES[row.exam.stage]} dot />
    ) : row.scored > 0 ? (
      <EmergeChip label={`Scored · ${row.scored}`} tone="green" dot />
    ) : (
      <EmergeChip label="Not started" tone="grey" />
    );

  return (
    <Card>
      <CardHeader
        title="Papers"
        subheader={`${ready.length} set in the paper setter`}
        action={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {classes.length > 1 ? (
              <TextField select size="small" label="Class" value={klass} onChange={(event) => setKlass(event.target.value)} sx={{ minWidth: 120 }}>
                <MenuItem value={ALL_CLASSES}>All classes</MenuItem>
                {classes.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
            {config.devBypass ? <ResetDemo /> : null}
          </Stack>
        }
      />
      {exams.isError ? (
        <Box sx={{ px: 3, pb: 2 }}>
          <WidgetDegraded error={exams.error} denied="Checking progress is hidden from you." unavailable="The checker is unreachable." />
        </Box>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState title={ready.length === 0 ? 'No set papers for your classes yet' : 'No papers for this class'} body={ready.length === 0 ? 'Papers for the sections you teach appear here once they are set in the paper setter.' : 'Choose another class, or All classes.'} />
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Papers">
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 3 }}>Paper</TableCell>
                <TableCell sx={{ ...NARROW_HIDDEN, width: 72 }}>Marks</TableCell>
                <TableCell sx={{ ...NARROW_HIDDEN, width: 150 }}>Status</TableCell>
                <TableCell sx={{ ...NARROW_HIDDEN, width: 140, pr: 3 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const primary = row === nextUp;
                return (
                  <TableRow
                    key={row.paper.paper_id}
                    hover
                    tabIndex={0}
                    aria-label={`Open ${paperTitle(row.paper)}`}
                    onClick={() => open(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        open(row);
                      }
                    }}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ pl: 3 }}>
                      <Typography variant="subtitle2" component="p">
                        {paperTitle(row.paper)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {paperClassLine(row.paper)}
                      </Typography>
                      <Box sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.75 }}>{status(row)}</Box>
                    </TableCell>
                    <TableCell sx={NARROW_HIDDEN}>{typeof row.paper.marks === 'number' ? trimNumber(row.paper.marks) : '—'}</TableCell>
                    <TableCell sx={NARROW_HIDDEN}>{status(row)}</TableCell>
                    <TableCell align="right" sx={{ ...NARROW_HIDDEN, pr: 3 }}>
                      <Button
                        size="small"
                        variant={primary ? 'contained' : 'text'}
                        endIcon={primary ? <ArrowRight size={14} /> : undefined}
                        tabIndex={-1}
                        onClick={(event) => {
                          event.stopPropagation();
                          open(row);
                        }}
                      >
                        {row.started ? 'Continue' : 'Check'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}
