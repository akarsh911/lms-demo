'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import { PencilLine, Printer, Upload } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';

import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useScoreSheets, useUploadSheetImages } from '@/hooks/mutation/use-answer-checker';
import { useOmrSheets } from '@/hooks/query/use-answer-checker';
import type { FeatureKey } from '@/constants/features';
import type { CheckedTotal } from '@/lib/answer-checker/marks';
import type { SetQuestion } from '@/lib/answer-checker/paper';
import { normalisedName, normalisedRoll, type RosterStudent } from '@/lib/answer-checker/roster-match';
import { failureText, trimNumber } from '@/lib/exams/exam';
import { checkingPaperService } from '@/services/answer-checker';
import type { ApiError } from '@/services/api';
import { omrService } from '@/services/omr';
import type { OmrSheetIn, OmrSheetRead } from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

import { ActionIcon } from './action-icon';
import { OmrSheetsTable, type OmrRow } from './omr-sheets-table';
import { QuestionDifficulty } from './question-difficulty';
import { RecordMarksPanel } from './record-marks-panel';
import { SeeGapsLink } from './see-gaps-link';
import type { CheckingTarget } from './use-checking-target';

function studentFor(roll: string, name: string, students: readonly RosterStudent[]): RosterStudent | null {
  const wanted = normalisedRoll(roll);
  return (
    students.find((student) => wanted !== null && normalisedRoll(student.roll) === wanted) ??
    students.find((student) => name !== '' && normalisedName(student.name) === normalisedName(name)) ??
    null
  );
}

const rollFromFile = (file: File): string => file.name.replace(/\.[^.]+$/, '').trim();

export function OmrStep({
  paper,
  questions,
  target,
  personaSlug,
  reachableLinks,
}: {
  paper: Paper;
  questions: readonly SetQuestion[];
  target: CheckingTarget;
  personaSlug: string;
  reachableLinks: readonly FeatureKey[];
}): React.ReactElement {
  const numbers = React.useMemo(() => questions.map((question) => question.n), [questions]);
  const stored = useOmrSheets(paper.paper_id);
  const score = useScoreSheets(paper);
  const upload = useUploadSheetImages(paper);
  const [drafts, setDrafts] = React.useState<Map<string, OmrSheetIn>>(new Map());
  const inputId = React.useId();
  const template = omrService.templateUrl(paper.paper_id);

  const sample = useMutation<OmrSheetRead[], ApiError, void>({
    mutationFn: () => checkingPaperService.sampleBubbleSheets(paper, target.sectionCode ?? ''),
    onSuccess: (sheets) => setDrafts(new Map(sheets.map((sheet) => [sheet.roll_number, sheet]))),
  });

  const rows = React.useMemo<OmrRow[]>(() => {
    const out = new Map<string, OmrRow>();
    for (const sheet of stored.data?.sheets ?? []) {
      out.set(sheet.roll_number, { sheet, result: sheet.result, source: sheet.source, student: studentFor(sheet.roll_number, sheet.name, target.students) });
    }
    for (const [roll, sheet] of drafts) {
      out.set(roll, { sheet, result: null, source: 'json', student: studentFor(roll, sheet.name, target.students) });
    }
    return [...out.values()].sort((left, right) => left.sheet.roll_number.localeCompare(right.sheet.roll_number, undefined, { numeric: true }));
  }, [drafts, stored.data, target.students]);

  const byHand = (): void =>
    setDrafts(
      new Map(
        target.students.flatMap((student) =>
          student.roll ? [[student.roll, { roll_number: student.roll, name: student.name, responses: numbers.map((n) => ({ n, chosen: [] })) }] as const] : [],
        ),
      ),
    );

  const edit = (roll: string, sheet: OmrSheetIn): void => setDrafts((current) => new Map(current).set(roll, sheet));

  const scoreDrafts = (): void => {
    void score.mutateAsync([...drafts.values()]).then(() => setDrafts(new Map()), () => undefined);
  };

  const uploadFiles = (files: FileList | null): void => {
    const chosen = Array.from(files ?? []);
    if (chosen.length === 0) return;
    const uploads = chosen.map((file) => {
      const roll = rollFromFile(file);
      return { file, roll, name: studentFor(roll, '', target.students)?.name ?? '' };
    });
    void upload.mutateAsync(uploads).catch(() => undefined);
  };

  const printBlank = (): void => {
    if (!template) return;
    void score.mutateAsync([]).then(() => window.open(template, '_blank', 'noopener'), () => undefined);
  };

  const checked: CheckedTotal[] = rows.flatMap((row) =>
    row.student && row.result
      ? [{ studentId: row.student.studentId, name: row.student.name || row.sheet.name, roll: row.student.roll, total: row.result.awarded, possible: row.result.paper_marks, note: `Bubble sheet (${row.source}), scored by OMR` }]
      : [],
  );
  const covered = new Set(checked.map((row) => row.studentId));
  const absentees = checked.length > 0 ? target.students.filter((student) => !covered.has(student.studentId)) : [];
  const generated = score.data?.generatedKey ?? upload.data?.generatedKey ?? false;
  const failure = sample.error ?? score.error ?? upload.error;

  const scoredRows = rows.filter((row) => row.result);
  const mean = scoredRows.length > 0 ? scoredRows.reduce((sum, row) => sum + (row.result?.awarded ?? 0), 0) / scoredRows.length : null;
  const outOf = scoredRows[0]?.result?.paper_marks ?? null;

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Sheets', value: rows.length },
          { label: 'Scored', value: `${scoredRows.length} of ${rows.length}` },
          { label: 'Class mean', value: mean === null ? '—' : `${trimNumber(mean)} / ${trimNumber(outOf ?? 0)}` },
        ]}
      />
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CardToolbar
              start={
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', pl: 1 }}>
                  <Tooltip title="Upload scans, named by roll (07.png)">
                    <IconButton size="small" component="label" htmlFor={inputId} aria-label="Upload scans" disabled={upload.isPending}>
                      <Upload size={15} />
                      <input id={inputId} type="file" accept="image/png,image/jpeg" multiple hidden onChange={(event) => uploadFiles(event.target.files)} />
                    </IconButton>
                  </Tooltip>
                  <ActionIcon label="Enter bubbles by hand" disabled={target.students.length === 0} onClick={byHand}>
                    <PencilLine size={15} />
                  </ActionIcon>
                  {template ? (
                    <ActionIcon label="Print a blank sheet" disabled={score.isPending} onClick={printBlank}>
                      <Printer size={15} />
                    </ActionIcon>
                  ) : null}
                </Stack>
              }
              summary={drafts.size > 0 ? `${drafts.size} not scored yet` : undefined}
            >
              {generated ? (
                <Tooltip title="The paper setter does not release keys; this is a demo key.">
                  <span>
                    <EmergeChip label="Demo key" tone="amber" />
                  </span>
                </Tooltip>
              ) : null}
              {upload.isPending ? <EmergeChip label="Reading scans…" tone="blue" /> : null}
              {drafts.size > 0 ? (
                <Button size="small" variant="contained" disabled={score.isPending} onClick={scoreDrafts}>
                  {score.isPending ? 'Scoring…' : `Score ${drafts.size}`}
                </Button>
              ) : (
                <Button size="small" variant={checked.length > 0 ? 'outlined' : 'contained'} disabled={sample.isPending || !target.sectionCode} onClick={() => sample.mutate()}>
                  {sample.isPending ? 'Reading…' : 'Read sample sheets'}
                </Button>
              )}
            </CardToolbar>

            {failure ? (
              <Alert severity="warning" variant="outlined">
                {failureText(failure)}
              </Alert>
            ) : null}
            {stored.isError ? <WidgetError error={stored.error} onRetry={() => void stored.refetch()} /> : null}
            {stored.isPending ? <WidgetLoading rows={3} /> : null}
            {!stored.isPending && rows.length === 0 ? <EmptyState title="No sheets yet" body="Read the sample sheets, upload scans, or enter the bubbles by hand." /> : null}
            {rows.length > 0 ? <OmrSheetsTable rows={rows} numbers={numbers} onEdit={edit} /> : null}
          </Stack>
        </CardContent>
      </Card>

      {scoredRows.length > 0 ? <QuestionDifficulty results={scoredRows.flatMap((row) => (row.result ? [row.result] : []))} /> : null}

      {checked.length > 0 ? <RecordMarksPanel rows={checked} absentees={absentees} target={target} personaSlug={personaSlug} onward={<SeeGapsLink paper={paper} target={target} personaSlug={personaSlug} reachableLinks={reachableLinks} />} /> : null}
    </Stack>
  );
}
