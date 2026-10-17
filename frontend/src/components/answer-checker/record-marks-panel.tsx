'use client';

import * as React from 'react';
import NextLink from 'next/link';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTimetableGrants } from '@/components/school/timetable-grants';
import { WidgetEmpty, WidgetError } from '@/components/widgets/widget-states';
import { useRecordExamMarks } from '@/hooks/mutation/use-exams';
import { useExamMarks, useExamSittings } from '@/hooks/query/use-exams';
import { markEntries, needsScaling, recordedMark, type CheckedTotal } from '@/lib/answer-checker/marks';
import type { RosterStudent } from '@/lib/answer-checker/roster-match';
import { failureText, trimNumber } from '@/lib/exams/exam';
import { buildBatch } from '@/lib/exams/marks';
import { paths } from '@/paths';
import { EXAM_MARK_BATCH_LIMIT } from '@/types/exam-marks';

import type { CheckingTarget } from './use-checking-target';

export function RecordMarksPanel({
  rows,
  absentees,
  target,
  personaSlug,
  tools,
  checkerExamId,
  unsigned = 0,
  onward,
}: {
  tools?: React.ReactNode;
  unsigned?: number;
  onward?: React.ReactNode;
  rows: readonly CheckedTotal[];
  absentees: readonly RosterStudent[];
  target: CheckingTarget;
  personaSlug: string;
  checkerExamId?: string;
}): React.ReactElement {
  const { targetId, assessmentId } = target;
  const maximum = target.target?.maximum_marks;
  const saved = useExamMarks(targetId);
  const sittings = useExamSittings(assessmentId);
  const record = useRecordExamMarks(checkerExamId ? { examId: checkerExamId, sectionCode: target.sectionCode } : undefined);
  const grants = useTimetableGrants();
  const [scale, setScale] = React.useState(true);
  const [markAbsent, setMarkAbsent] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  if (!targetId) return <WidgetEmpty message="Choose a class first." />;

  const scaling = needsScaling(rows, maximum);
  const savedBy = new Map((saved.data ?? []).map((row) => [row.student_id ?? '', row]));
  const entries = markEntries(rows, markAbsent ? absentees.map((student) => student.studentId) : [], maximum, scale);
  const tooMany = entries.length > EXAM_MARK_BATCH_LIMIT;
  const paperSittings = (sittings.data ?? []).filter((row) => row.exam_subject_id === targetId);
  const sittingId = paperSittings.length === 1 ? (paperSittings[0]?.id ?? null) : null;
  const marksEntry = paths.personaSection(personaSlug, `grades?exam=${assessmentId ?? ''}&paper=${targetId}`);

  const send = (): void => {
    setConfirming(false);
    record.mutate(buildBatch(targetId, sittingId, entries));
  };

  const primary = (
    <Tooltip title="Replaces existing marks for these pupils; saved all together or not at all">
      <span>
        <Button size="small" variant="contained" disabled={!grants.mayWrite || entries.length === 0 || tooMany || record.isPending} onClick={() => (unsigned > 0 ? setConfirming(true) : send())}>
          {record.isPending ? 'Recording…' : `Record ${entries.length} marks`}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Card>
      <CardHeader title="Send to marks entry" subheader={maximum === undefined ? 'Marks entry' : `Marked out of ${trimNumber(maximum)}`} action={primary} />
      <CardContent>
        <Stack spacing={2}>
          <CardToolbar
            start={
              scaling || absentees.length > 0 ? (
                <Stack direction="row" spacing={2} sx={{ pl: 1, flexWrap: 'wrap' }}>
                  {scaling ? (
                    <FormControlLabel control={<Switch size="small" checked={scale} onChange={(event) => setScale(event.target.checked)} />} label={<Typography variant="body2">Scale to {trimNumber(maximum ?? 0)}</Typography>} />
                  ) : null}
                  {absentees.length > 0 ? (
                    <FormControlLabel control={<Switch size="small" checked={markAbsent} onChange={(event) => setMarkAbsent(event.target.checked)} />} label={<Typography variant="body2">Mark {absentees.length} absent</Typography>} />
                  ) : null}
                </Stack>
              ) : undefined
            }
            summary={`${rows.length} pupils`}
          >
            {!grants.mayWrite ? <EmergeChip label="Read only" tone="grey" /> : null}
            {tools}
          </CardToolbar>

          {saved.isError ? <WidgetError error={saved.error} onRetry={() => void saved.refetch()} /> : null}

          <TableContainer sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader aria-label="Marks to record">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 56 }}>Roll</TableCell>
                  <TableCell>Pupil</TableCell>
                  <TableCell align="right" sx={{ width: 96, display: { xs: 'none', sm: 'table-cell' } }}>
                    On the sheet
                  </TableCell>
                  <TableCell align="right" sx={{ width: 88 }}>
                    Checked
                  </TableCell>
                  <TableCell align="right" sx={{ width: 112 }}>
                    In marks entry
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const current = savedBy.get(row.studentId);
                  return (
                    <TableRow key={row.studentId} hover>
                      <TableCell>{row.roll ?? '—'}</TableCell>
                      <TableCell>{row.name || '—'}</TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                        {trimNumber(row.total)}/{trimNumber(row.possible)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {trimNumber(recordedMark(row, maximum, scale))}
                      </TableCell>
                      <TableCell align="right" sx={{ color: 'text.secondary' }}>
                        {current?.status === 'marked' && current.marks_obtained !== undefined ? trimNumber(current.marks_obtained) : current?.status === undefined ? '—' : current.status}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {tooMany ? (
            <Alert severity="warning" variant="outlined">
              At most {EXAM_MARK_BATCH_LIMIT} per batch; this is {entries.length}.
            </Alert>
          ) : null}
          {record.isError ? (
            <Alert severity="error" variant="outlined">
              {failureText(record.error)}
            </Alert>
          ) : null}
          {record.isSuccess ? (
            <Alert
              severity="success"
              variant="outlined"
              action={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Button size="small" component={NextLink} href={marksEntry}>
                    Open marks entry
                  </Button>
                  {onward}
                </Stack>
              }
            >
              {record.data.created} recorded, {record.data.updated} amended in marks entry.
            </Alert>
          ) : null}
          {confirming ? (
            <ConfirmDialog
              title="Record marks before sign-off?"
              body={`${unsigned} of ${rows.length} sheets are not signed off yet. Their marks go into marks entry as the checker left them, and you can record again after reviewing.`}
              confirmLabel={`Record ${entries.length} marks`}
              tone="primary"
              pending={record.isPending}
              onConfirm={send}
              onClose={() => setConfirming(false)}
            />
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
