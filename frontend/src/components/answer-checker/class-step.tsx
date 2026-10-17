'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowRight } from 'lucide-react';

import { LearningScopeGate } from '@/components/learning-scope/learning-scope-gate';
import type { LearningScope } from '@/components/learning-scope/scope-model';
import type { LegacyScope } from '@/components/learning-scope/use-learning-scope';
import { EmergeChip } from '@/components/ui/chip';
import { SettingsSection } from '@/components/ui/settings-section';
import { WidgetDegraded, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useStartChecking } from '@/hooks/mutation/use-answer-checker';
import type { CheckingMode } from '@/lib/answer-checker/paper';
import { examLabel, failureText, trimNumber } from '@/lib/exams/exam';
import { offeringLabel, sectionLabel } from '@/lib/school/names';
import type { ExamSubjectRow } from '@/types/exams';
import type { Paper } from '@/types/papersetter';
import type { SchoolOfferingRow } from '@/types/school';

import type { CheckingTarget } from './use-checking-target';
import { paperGrades, paperInitial, sectionChoice } from './use-paper-scope';

const ROSTER_PREVIEW = 12;

function targetLabel(row: ExamSubjectRow, offerings: readonly SchoolOfferingRow[]): string {
  const offering = offerings.find((entry) => entry.id === row.subject_offering_id);
  const marks = row.maximum_marks === undefined ? '' : ` · /${trimNumber(row.maximum_marks)}`;
  return `${offeringLabel(offering)} · ${sectionLabel(offering?.edges?.section)}${marks}`;
}

export function ClassStep({
  paper,
  mode,
  target,
  examId,
  onChoose,
  onStarted,
  onNext,
}: {
  paper: Paper;
  mode: CheckingMode;
  target: CheckingTarget;
  examId: string | null;
  onChoose: (change: { assessment?: string | null; target?: string | null }) => void;
  onStarted: (examId: string, jobId: string) => void;
  onNext: () => void;
}): React.ReactElement {
  const start = useStartChecking();
  const { exams, subjects, offerings, examOptions, assessmentId, students, roster, sectionCode } = target;
  const ready = Boolean(target.target) && students.length > 0 && sectionCode !== null;
  const legacy: LegacyScope = { keys: ['target'], resolve: (grades) => sectionChoice(grades, target.sectionId) };

  const begin = (): void => {
    if (!sectionCode) return;
    void start.mutateAsync({ paper, klass: sectionCode }).then(({ exam, job }) => onStarted(exam.id, job.id), () => undefined);
  };

  const preview = students
    .slice(0, ROSTER_PREVIEW)
    .map((student) => `${student.roll ?? ''} ${student.name || '—'}`.trim())
    .join(', ');

  const primary =
    mode === 'omr' ? (
      <Button variant="contained" size="small" disabled={!ready} endIcon={<ArrowRight size={16} />} onClick={onNext}>
        Next
      </Button>
    ) : examId ? (
      <Button variant="contained" size="small" endIcon={<ArrowRight size={16} />} onClick={onNext}>
        Continue
      </Button>
    ) : (
      <Tooltip title="Sends the paper and its key to the checker">
        <span>
          <Button variant="contained" size="small" disabled={!ready || start.isPending} endIcon={<ArrowRight size={16} />} onClick={begin}>
            {start.isPending ? 'Starting…' : 'Start checking'}
          </Button>
        </span>
      </Tooltip>
    );

  return (
    <Card>
      <CardHeader title="Class" subheader="Who sat this paper, and where the marks go" />
      {exams.isPending ? (
        <CardContent>
          <WidgetLoading rows={2} />
        </CardContent>
      ) : null}
      <Stack spacing={1.5} sx={{ px: 3, '&:empty': { display: 'none' } }}>
        {exams.isError ? <WidgetError error={exams.error} onRetry={() => void exams.refetch()} /> : null}
        {subjects.isError ? <WidgetError error={subjects.error} onRetry={() => void subjects.refetch()} /> : null}
        {offerings.isError ? <WidgetDegraded error={offerings.error} denied="Classes are hidden from you." unavailable="Classes could not load." /> : null}
        {roster.isEmptyFailure ? <WidgetError error={roster.takersError} onRetry={roster.refetch} /> : null}
        {start.isError ? (
          <Alert severity="error" variant="outlined">
            {failureText(start.error)}
          </Alert>
        ) : null}
      </Stack>
      <SettingsSection title="Assessment" hint="The exam the marks belong to.">
        <TextField
          select
          size="small"
          label="Assessment"
          value={examOptions.some((row) => row.id === assessmentId) ? (assessmentId ?? '') : ''}
          disabled={examOptions.length === 0}
          onChange={(event) => onChoose({ assessment: event.target.value })}
          sx={{ maxWidth: 360 }}
        >
          {examOptions.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {examLabel(row)}
            </MenuItem>
          ))}
        </TextField>
      </SettingsSection>
      <CardContent>
        {examId ? (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              {`This check was started for ${paper.class_id ? `Class ${paper.class_id} ` : ''}${target.offering?.edges?.section?.name ? `Section ${target.offering.edges.section.name}` : 'its class'}.`}
            </Typography>
            <ClassSummary target={target} preview={preview} primary={primary} />
          </Stack>
        ) : (
          <LearningScopeGate
            mode="single"
            grades={paperGrades(paper)}
            sections={target.sittingSections}
            legacy={legacy}
            initial={paperInitial(paper)}
            prompt="The pupils whose sheets these are."
            ungated={<ClassSelect target={target} onChoose={onChoose} preview={preview} primary={primary} />}
          >
            {(scope) => <ScopedClass scope={scope} paper={paper} target={target} preview={preview} primary={primary} />}
          </LearningScopeGate>
        )}
      </CardContent>
    </Card>
  );
}

function ScopedClass({
  scope,
  paper,
  target,
  preview,
  primary,
}: {
  scope: LearningScope;
  paper: Paper;
  target: CheckingTarget;
  preview: string;
  primary: React.ReactNode;
}): React.ReactElement {
  const section = scope.sections[0];
  const { roster, students, subjects } = target;
  if (!target.assessmentId) {
    return (
      <Typography variant="body2" color="text.secondary">
        Choose the assessment these marks belong to.
      </Typography>
    );
  }
  if (subjects.isPending) return <WidgetLoading rows={1} />;
  if (!target.target || target.sectionId !== section?.id) {
    return (
      <Typography variant="body2" color="text.secondary">
        {`This assessment has no ${paper.subject ?? ''} paper for ${section?.label ?? 'this section'}. Choose another assessment or section.`}
      </Typography>
    );
  }
  return <ClassSummary target={target} preview={preview} primary={primary} />;
}

function ClassSummary({ target, preview, primary }: { target: CheckingTarget; preview: string; primary: React.ReactNode }): React.ReactElement | null {
  const { roster, students } = target;
  if (!target.target) return null;
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1.5 }}>
      {roster.isPending ? (
        <EmergeChip label="Loading class" />
      ) : (
        <Tooltip title={students.length > ROSTER_PREVIEW ? `${preview} …` : preview || 'Nobody enrolled'}>
          <span>
            <EmergeChip label={target.target.maximum_marks === undefined ? `${students.length} pupils` : `${students.length} pupils · marked out of ${trimNumber(target.target.maximum_marks)}`} tone={students.length > 0 ? 'green' : 'red'} dot />
          </span>
        </Tooltip>
      )}
      {primary}
    </Stack>
  );
}

function ClassSelect({
  target,
  onChoose,
  preview,
  primary,
}: {
  target: CheckingTarget;
  onChoose: (change: { target?: string | null }) => void;
  preview: string;
  primary: React.ReactNode;
}): React.ReactElement {
  const rows = target.subjects.data ?? [];
  return (
    <Stack spacing={2}>
      <TextField
        select
        size="small"
        label="Class"
        value={rows.some((row) => row.id === target.targetId) ? (target.targetId ?? '') : ''}
        disabled={!target.assessmentId || rows.length === 0}
        onChange={(event) => onChoose({ target: event.target.value })}
        sx={{ width: '100%', maxWidth: 360 }}
      >
        {rows.map((row) => (
          <MenuItem key={row.id} value={row.id}>
            {targetLabel(row, target.offerings.data ?? [])}
          </MenuItem>
        ))}
      </TextField>
      <ClassSummary target={target} preview={preview} primary={primary} />
    </Stack>
  );
}
