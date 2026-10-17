'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowLeft } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { TabLabel } from '@/components/ui/tab-label';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useCheckablePaper, useCheckerExam, useCheckerHealth } from '@/hooks/query/use-answer-checker';
import { modesFor, paperClassLine, paperTitle, setQuestions, type CheckingMode } from '@/lib/answer-checker/paper';
import type { FeatureKey } from '@/constants/features';
import { failureText } from '@/lib/exams/exam';
import { answerCheckerService } from '@/services/answer-checker';
import type { CheckerExamDetail } from '@/types/answer-checker';

import { BookletsSteps, type ReviewView, type ScanStepKey } from './scan-steps';
import { SchemeStep } from './scheme-step';
import { SeeGapsLink } from './see-gaps-link';
import { ClassStep } from './class-step';
import { JobProgress } from './job-progress';
import { OmrStep } from './omr-step';
import { PaperStep } from './paper-step';
import { useCheckingTarget } from './use-checking-target';
import { SCOPE_RESETS, useScopedSection } from './use-paper-scope';
import { mayCheck, type CheckingReach } from './use-checking-reach';
import { useLiveUrlState } from './use-live-url-state';

type StepKey = 'paper' | 'class' | ScanStepKey | 'bubbles';

const SCAN_STEPS: readonly { key: StepKey; label: string }[] = [
  { key: 'paper', label: 'Paper & scheme' },
  { key: 'class', label: 'Class' },
  { key: 'sheets', label: 'Sheets' },
  { key: 'names', label: 'Names' },
  { key: 'review', label: 'Review & send' },
];

const OMR_STEPS: readonly { key: StepKey; label: string }[] = [
  { key: 'paper', label: 'Paper' },
  { key: 'class', label: 'Class' },
  { key: 'bubbles', label: 'Bubble Sheets' },
];

const RETIRED_STEPS: Readonly<Record<string, StepKey>> = { scheme: 'paper', mark: 'names', finish: 'review' };

function reachable(key: StepKey, exam: CheckerExamDetail | undefined, mode: CheckingMode): boolean {
  if (key === 'paper' || key === 'class') return true;
  if (key === 'bubbles') return mode === 'omr';
  if (!exam) return false;
  switch (key) {
    case 'sheets':
      return true;
    case 'names':
      return exam.booklets.length > 0;
    case 'review':
      return exam.counts.marked + exam.counts.signed_off > 0;
    default: {
      const never: never = key;
      return never;
    }
  }
}

function furthest(exam: CheckerExamDetail | undefined): StepKey {
  if (!exam) return 'paper';
  if (exam.booklets.length === 0) return 'sheets';
  if (exam.counts.marked + exam.counts.signed_off > 0) return 'review';
  return 'names';
}

const checkedSection = (klass: string | null | undefined, section: string | undefined): string | null => (klass && section ? `${klass}${section}` : null);

export function CheckerWorkspace({
  paperId,
  personaSlug,
  reachableLinks,
  reach,
}: {
  paperId: string;
  personaSlug: string;
  reachableLinks: readonly FeatureKey[];
  reach: CheckingReach;
}): React.ReactElement {
  const { get, put } = useLiveUrlState();
  const paper = useCheckablePaper(paperId);
  const health = useCheckerHealth();
  const examId = get('exam');
  const exam = useCheckerExam(examId);
  const [startedJob, setStartedJob] = React.useState<string | null>(null);
  const runningJob = exam.data?.jobs.find((job) => job.state === 'queued' || job.state === 'running')?.id ?? null;
  const jobId = startedJob ?? runningJob;

  const questions = React.useMemo(() => (paper.data ? setQuestions(paper.data) : []), [paper.data]);
  const modes = modesFor(questions);
  const mode: CheckingMode = get('mode') === 'omr' && modes.includes('omr') ? 'omr' : 'scan';
  const scopedSection = useScopedSection(paper.data);
  const target = useCheckingTarget(paper.data, get('assessment'), scopedSection, get('target'), exam.data?.klass ?? null);
  const steps = mode === 'omr' ? OMR_STEPS : SCAN_STEPS;
  const raw = get('step');
  const asked = (raw ? (RETIRED_STEPS[raw] ?? raw) : null) as StepKey | null;
  const view: ReviewView = get('view') === 'send' || raw === 'finish' ? 'send' : 'review';
  const step: StepKey = asked && steps.some((entry) => entry.key === asked) && reachable(asked, exam.data, mode) ? asked : furthest(exam.data);

  const go = React.useCallback((next: StepKey) => put({ step: next }), [put]);
  const jobDone = React.useCallback(() => setStartedJob(null), []);

  if (paper.isPending || (examId && exam.isPending)) return <WidgetLoading rows={8} />;
  const leave = (): void => put({ paper: null, exam: null, step: null, view: null, booklet: null, mode: null, assessment: null, target: null, session: null, ...SCOPE_RESETS });
  const refused = paper.data && !mayCheck(reach, paper.data, exam.data?.klass);
  if (refused) {
    return (
      <Card>
        <EmptyState
          title="Not one of your classes"
          body="You can check answer sheets only for sections you teach."
          action={
            <Button variant="contained" startIcon={<ArrowLeft size={16} />} onClick={leave}>
              All papers
            </Button>
          }
        />
      </Card>
    );
  }
  if (paper.isError && paper.error.status === 404) {
    return (
      <Card>
        <EmptyState
          title="Paper not found"
          body="There is no paper with that link. It may have been deleted, or the link may be from another school."
          action={
            <Button variant="contained" startIcon={<ArrowLeft size={16} />} onClick={leave}>
              All papers
            </Button>
          }
        />
      </Card>
    );
  }
  if (paper.isError) return <WidgetError error={paper.error} onRetry={() => void paper.refetch()} />;

  const fixture = answerCheckerService.fromFixtures();
  const rehearsal = !fixture && health.data && !health.data.model_configured && mode === 'scan';
  const waiting = exam.data ? exam.data.counts.pending + exam.data.counts.identified : 0;
  const countFor = (key: StepKey): number => (key === 'names' ? waiting : 0);

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h3" component="h2">
              {paperTitle(paper.data)}
            </Typography>
            {fixture ? (
              <Tooltip title="Fixture checker: booklets, marks and annotations are generated sample data.">
                <span>
                  <EmergeChip label="Sample data" tone="blue" />
                </span>
              </Tooltip>
            ) : null}
            {rehearsal ? (
              <Tooltip title="No reading model on the checker: marks are rehearsal output.">
                <span>
                  <EmergeChip label="Rehearsal" tone="amber" dot />
                </span>
              </Tooltip>
            ) : null}
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            {paperClassLine(paper.data, checkedSection(paper.data.class_id, target.offering?.edges?.section?.name))}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<ArrowLeft size={14} />} onClick={leave}>
          All papers
        </Button>
      </Stack>

      {!fixture && health.isError ? (
        <Alert severity="error" variant="outlined">
          Checker unreachable. {failureText(health.error)}
        </Alert>
      ) : null}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={step} onChange={(_, next: StepKey) => go(next)} variant="scrollable" allowScrollButtonsMobile aria-label="Checking steps">
          {steps.map((entry) => (
            <Tab key={entry.key} value={entry.key} disabled={!reachable(entry.key, exam.data, mode)} label={<TabLabel label={entry.label} count={countFor(entry.key)} />} />
          ))}
        </Tabs>
      </Box>

      {jobId ? <JobProgress jobId={jobId} onFinished={jobDone} /> : null}
      {examId && exam.isError ? <WidgetError error={exam.error} onRetry={() => void exam.refetch()} /> : null}

      {step === 'paper' ? (
        <Stack spacing={2}>
          <PaperStep paper={paper.data} questions={questions} mode={mode} modes={modes} onMode={(next) => put({ mode: next === 'omr' ? 'omr' : null })} onNext={() => go(exam.data ? 'sheets' : 'class')} />
          {mode === 'scan' && exam.data ? <SchemeStep exam={exam.data} onNext={() => go('sheets')} /> : null}
          {mode === 'scan' && !exam.data ? (
            <Typography variant="body2" color="text.secondary">
              The marking scheme is built from the paper&apos;s answer key once you choose the class and start checking; you approve it before anything is marked.
            </Typography>
          ) : null}
        </Stack>
      ) : null}
      {step === 'class' ? (
        <ClassStep
          paper={paper.data}
          mode={mode}
          target={target}
          examId={examId}
          onChoose={(change) => put(change)}
          onStarted={(id, job) => {
            setStartedJob(job);
            put({ exam: id, step: 'sheets' });
          }}
          onNext={() => go(mode === 'omr' ? 'bubbles' : furthest(exam.data))}
        />
      ) : null}
      {step === 'bubbles' ? <OmrStep paper={paper.data} questions={questions} target={target} personaSlug={personaSlug} reachableLinks={reachableLinks} /> : null}
      {mode === 'scan' && exam.data && (step === 'sheets' || step === 'names' || step === 'review') ? (
        <BookletsSteps
          step={step}
          view={view}
          onView={(next) => put({ view: next === 'send' ? 'send' : null, step: 'review' })}
          onReviewScheme={() => go('paper')}
          onward={<SeeGapsLink paper={paper.data} target={target} personaSlug={personaSlug} reachableLinks={reachableLinks} />}
          exam={exam.data}
          paper={paper.data}
          questions={questions}
          target={target}
          personaSlug={personaSlug}
          selected={get('booklet')}
          onSelect={(bookletId) => put({ booklet: bookletId })}
          sessionId={get('session')}
          onSession={(sessionId) => put({ session: sessionId })}
          onJob={(job, next) => {
            setStartedJob(job);
            put({ step: next });
          }}
          go={go}
        />
      ) : null}
    </Stack>
  );
}
