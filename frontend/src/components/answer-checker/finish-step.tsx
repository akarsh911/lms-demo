'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import { FileArchive, FileSpreadsheet } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useCheckerHealth, useClassResults } from '@/hooks/query/use-answer-checker';
import type { CheckedTotal } from '@/lib/answer-checker/marks';
import { matchBooklet } from '@/lib/answer-checker/roster-match';
import { failureText, trimNumber } from '@/lib/exams/exam';
import { answerCheckerService } from '@/services/answer-checker';
import type { ApiError } from '@/services/api';
import type { PresetStrictness } from '@/types/answer-checker';

import { ActionIcon } from './action-icon';
import { downloadBlob, downloadText } from './download';
import { RecordMarksPanel } from './record-marks-panel';
import type { CheckingTarget } from './use-checking-target';

const COUNTED = new Set(['marked', 'signed_off']);

export function FinishStep({
  examId,
  target,
  personaSlug,
  onReview,
  onward,
}: {
  onReview: (bookletId: string) => void;
  examId: string;
  target: CheckingTarget;
  personaSlug: string;
  onward?: React.ReactNode;
}): React.ReactElement {
  const results = useClassResults(examId);
  const health = useCheckerHealth();
  const csv = useMutation<string, ApiError, void>({ mutationFn: () => answerCheckerService.exportCsv(examId) });
  const zip = useMutation<Blob, ApiError, void>({ mutationFn: () => answerCheckerService.downloadZip(examId) });

  if (results.isPending) return <WidgetLoading rows={6} />;
  if (results.isError) return <WidgetError error={results.error} onRetry={() => void results.refetch()} />;

  const marked = results.data.booklets.filter((ref) => COUNTED.has(ref.state) && ref.total_marks !== null);
  if (marked.length === 0) return <WidgetEmpty message="Nothing is marked yet." />;

  const label = (level: string | null): string => health.data?.strictness[(level ?? 'medium') as PresetStrictness]?.label ?? level ?? '';
  const matched = marked.map((ref) => ({ ref, match: matchBooklet(ref, target.students) }));
  const rows: CheckedTotal[] = matched.flatMap(({ ref, match }) =>
    match
      ? [{ studentId: match.student.studentId, name: match.student.name || ref.student.name || '', roll: match.student.roll, total: ref.total_marks ?? 0, possible: ref.total_possible ?? 0, note: `Answer-sheet checker, ${label(ref.strictness)}` }]
      : [],
  );
  const unmatched = matched.filter((row) => !row.match);
  const covered = new Set(rows.map((row) => row.studentId));
  const absentees = target.students.filter((student) => !covered.has(student.studentId));
  const unsigned = marked.filter((ref) => ref.state !== 'signed_off').length;

  const unmatchedNames = unmatched.map(({ ref }) => ref.student.name ?? 'Unnamed').join(', ');
  const outliers = results.data.outliers;
  const byId = new Map(results.data.booklets.map((ref) => [ref.id, ref]));

  const tools = (
    <>
      <ActionIcon label="Marks sheet (CSV)" disabled={csv.isPending} onClick={() => void csv.mutateAsync().then((text) => downloadText(text, `${examId}-marks.csv`, 'text/csv'), () => undefined)}>
        <FileSpreadsheet size={15} />
      </ActionIcon>
      <ActionIcon label="Checked sheets (zip)" disabled={zip.isPending} onClick={() => void zip.mutateAsync().then((blob) => downloadBlob(blob, `${examId}-checked-sheets.zip`), () => undefined)}>
        <FileArchive size={15} />
      </ActionIcon>
    </>
  );

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Marked', value: marked.length },
          { label: 'Class mean', value: `${trimNumber(results.data.mean)} / ${trimNumber(results.data.total_possible)}` },
          { label: 'Signed off', value: `${marked.length - unsigned} of ${marked.length}` },
          { label: 'Out of step', value: outliers.length, note: unmatched.length > 0 ? `${unmatched.length} unmatched: ${unmatchedNames}` : undefined },
        ]}
      />
      {csv.isError || zip.isError ? (
        <Alert severity="error" variant="outlined">
          {failureText(csv.error ?? zip.error)}
        </Alert>
      ) : null}
      <RecordMarksPanel rows={rows} absentees={absentees} target={target} personaSlug={personaSlug} tools={tools} checkerExamId={examId} unsigned={unsigned} onward={onward} />
      {outliers.length > 0 ? (
        <Card>
          <CardHeader title="Marked out of step" subheader="Same question, far from the class median: worth a second look" />
          <List disablePadding sx={{ px: 1, pb: 1 }}>
            {outliers.map((outlier) => {
              const ref = byId.get(outlier.booklet_id);
              return (
                <ListItemButton key={`${outlier.booklet_id}-${outlier.question_number}`} onClick={() => onReview(outlier.booklet_id)} sx={{ borderRadius: 2, gap: 1.5 }}>
                  <ListItemText
                    primary={ref?.student.name ?? 'Unnamed'}
                    secondary={`Roll ${ref?.student.roll_number ?? '—'} · Q${outlier.question_number}`}
                    slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'body2' } }}
                    sx={{ my: 0 }}
                  />
                  <EmergeChip label={`${trimNumber(outlier.marks)} vs median ${trimNumber(outlier.peer_median)}`} tone={outlier.marks > outlier.peer_median ? 'blue' : 'amber'} />
                </ListItemButton>
              );
            })}
          </List>
        </Card>
      ) : null}
    </Stack>
  );
}
