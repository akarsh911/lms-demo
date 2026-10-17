'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useTimetableGrants } from '@/components/school/timetable-grants';
import { useUrlState } from '@/components/school/url-state';
import {
  WidgetDegraded,
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import {
  useExamMarks,
  useExamSittings,
  useExamSubjects,
  useReachableExams,
  useSittingDays,
} from '@/hooks/query/use-exams';
import { usePaperRoster } from '@/hooks/query/use-paper-roster';
import { useOffering } from '@/hooks/query/use-section';
import { useRecordExamMarks } from '@/hooks/mutation/use-exams';
import { useAllOfferings } from '@/hooks/query/use-school';
import { useReach } from '@/hooks/query/use-reach';
import { examLabel, examWindowLabel, failureText, resultsStance, trimNumber } from '@/lib/exams/exam';
import {
  BLANK_DRAFT,
  buildBatch,
  draftFromRow,
  entriesToSend,
  problemCount,
  refusedStudents,
  tallyDrafts,
  unsavableClearCount,
  type MarkDraft,
} from '@/lib/exams/marks';
import { offeringLabel, sectionLabel, shortId } from '@/lib/school/names';
import { EXAM_MAX_PAGE } from '@/services/exams';
import { dateOnly, longDate } from '@/lib/school/time';
import { EXAM_MARK_BATCH_LIMIT, type ExamMarkRow } from '@/types/exam-marks';
import type { ExamSittingRow, ExamSubjectRow } from '@/types/exams';
import type { SchoolOfferingRow } from '@/types/school';
import { MarksGrid } from './marks-grid';

const NO_SITTING = '';

export function MarksEntry(): React.ReactElement {
  const { get, put } = useUrlState();
  const grants = useTimetableGrants();

  const examId = get('exam');
  const paperId = get('paper');

  const exams = useReachableExams();
  const subjects = useExamSubjects(examId);
  const sittings = useExamSittings(examId);
  const offerings = useAllOfferings(Boolean(examId));
  const marks = useExamMarks(paperId);

  const reach = useReach();
  // A teacher enters marks only for the subjects they teach; emerge-core refuses the rest regardless.
  const subjectRows = React.useMemo(() => (subjects.data ?? []).filter((row) => reach?.kind !== 'teaching' || reach.offerings.has(row.subject_offering_id ?? '')), [subjects.data, reach]);
  const offeringRows = React.useMemo(() => offerings.data ?? [], [offerings.data]);

  const paper = subjectRows.find((row) => row.id === paperId);
  const listedOffering = offeringRows.find(
    (row) => row.id === paper?.subject_offering_id,
  );
  const offering = useOffering(paper?.subject_offering_id ?? '');
  const sectionId =
    offering.data?.section_id ??
    listedOffering?.section_id ??
    listedOffering?.edges?.section?.id ??
    null;

  const roster = usePaperRoster(paper?.subject_offering_id ?? null, sectionId);

  const [drafts, setDrafts] = React.useState<Record<string, MarkDraft>>({});
  const [chosenSitting, setChosenSitting] = React.useState(NO_SITTING);

  const scopeKey = paperId ?? '';
  const [draftScope, setDraftScope] = React.useState(scopeKey);
  if (draftScope !== scopeKey) {
    setDraftScope(scopeKey);
    setDrafts({});
    setChosenSitting(NO_SITTING);
  }

  const saved = React.useMemo(() => {
    const out = new Map<string, ExamMarkRow>();
    for (const row of marks.data ?? []) {
      if (row.student_id) out.set(row.student_id, row);
    }
    return out;
  }, [marks.data]);

  const order = React.useMemo(
    () => roster.rows.map((row) => row.studentId),
    [roster.rows],
  );

  const effective = React.useMemo(() => {
    const out = new Map<string, MarkDraft>();
    for (const studentId of order) {
      out.set(studentId, drafts[studentId] ?? draftFromRow(saved.get(studentId)));
    }
    return out;
  }, [order, drafts, saved]);

  const paperSittings = React.useMemo(
    () => (sittings.data ?? []).filter((row) => row.exam_subject_id === paperId),
    [sittings.data, paperId],
  );
  const needsSittingChoice = paperSittings.length > 1;
  const dayIds = React.useMemo(
    () =>
      needsSittingChoice
        ? paperSittings.flatMap((row) => (row.calendar_day_id ? [row.calendar_day_id] : []))
        : [],
    [needsSittingChoice, paperSittings],
  );
  const days = useSittingDays(dayIds);
  const dateOfDay = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const day of days.data ?? []) out.set(day.id, dateOnly(day.calendar_date));
    return out;
  }, [days.data]);

  const sittingId = needsSittingChoice
    ? chosenSitting === NO_SITTING
      ? null
      : chosenSitting
    : (paperSittings[0]?.id ?? null);

  const maximum = paper?.maximum_marks;
  const entries = entriesToSend(order, effective, saved);
  const problems = problemCount(order, effective, saved, maximum);
  const clears = unsavableClearCount(order, effective, saved);
  const tally = tallyDrafts(order, effective);
  const overBatch = entries.length > EXAM_MARK_BATCH_LIMIT;

  const record = useRecordExamMarks();
  const refused = React.useMemo(
    () => new Set(refusedStudents(record.error)),
    [record.error],
  );

  const save = (): void => {
    if (!paperId || entries.length === 0 || problems > 0 || overBatch) return;
    record.mutate(buildBatch(paperId, sittingId, entries), {
      onSuccess: () => setDrafts({}),
    });
  };

  const examOptions = React.useMemo(
    () => [...(exams.data ?? [])].sort(byNewest),
    [exams.data],
  );
  const exam = examOptions.find((row) => row.id === examId);
  const stance = exam ? resultsStance(exam) : null;

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label="Assessment"
          value={exam?.id ?? ''}
          disabled={!exams.data || examOptions.length === 0}
          onChange={(event) => put({ exam: event.target.value, paper: null })}
          sx={{ minWidth: 280 }}
        >
          {examOptions.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {examLabel(row)}
              {examWindowLabel(row) ? ` · ${examWindowLabel(row)}` : ''}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          size="small"
          label="Paper"
          value={subjects.data ? (paper?.id ?? '') : ''}
          disabled={!examId || !subjects.data || subjectRows.length === 0}
          onChange={(event) => put({ paper: event.target.value })}
          sx={{ minWidth: 320 }}
        >
          {subjectRows.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {paperLabel(row, offeringRows)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {exams.isPending ? <WidgetLoading rows={1} /> : null}
      {exams.isError ? (
        <WidgetError error={exams.error} onRetry={() => void exams.refetch()} />
      ) : null}
      {exams.data && examOptions.length === 0 ? (
        <WidgetEmpty message="No assessment here is one you may mark. A paper appears once somebody has added it to an assessment for a class you teach." />
      ) : null}

      {examId && subjects.isError ? (
        <WidgetError error={subjects.error} onRetry={() => void subjects.refetch()} />
      ) : null}
      {examId && subjects.data && subjectRows.length === 0 ? (
        <WidgetEmpty message="This assessment has no paper you may open." />
      ) : null}

      {examId && offerings.isError ? (
        <WidgetDegraded
          error={offerings.error}
          denied="You may not read this school's subject offerings, so the papers below are listed without their subject and class."
          unavailable="Subjects and classes could not be loaded, so the papers below are listed without them."
        />
      ) : null}

      {stance === 'practice' ? (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>Practice: none of this counts</AlertTitle>
          This paper is marked like any other, and not one mark from it reaches the
          report card.
        </Alert>
      ) : null}
      {stance === 'unstated' ? (
        <Alert severity="info" variant="outlined">
          This record does not say whether these marks count toward the report card,
          so this screen will not guess.
        </Alert>
      ) : null}

      {!paper ? (
        <WidgetEmpty message="Choose an assessment and a paper to mark it." />
      ) : (
        <>
          <Stack spacing={0.5}>
            <Typography variant="h4" component="h3">
              {paperLabel(paper, offeringRows)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {maximum === undefined
                ? 'This paper does not say what it is marked out of, so nothing here can be checked against a maximum.'
                : `Marked out of ${trimNumber(maximum)}.`}
            </Typography>
          </Stack>

          {!grants.mayWrite ? (
            <Alert severity="info" variant="outlined">
              You may read these marks and not record them.
            </Alert>
          ) : null}

          {grants.mayWrite && needsSittingChoice ? (
            <TextField
              select
              size="small"
              label="Sitting attended"
              value={chosenSitting}
              onChange={(event) => setChosenSitting(event.target.value)}
              helperText="Saving records every pupil below as having sat the one chosen here, and clears any sitting already recorded against them."
              sx={{ maxWidth: 420 }}
            >
              <MenuItem value={NO_SITTING}>Do not record a sitting</MenuItem>
              {paperSittings.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {sittingLabel(row, dateOfDay)}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          {grants.mayWrite && paperSittings.length === 1 ? (
            <Typography variant="body2" color="text.secondary">
              These marks are recorded against the one sitting this paper has.
            </Typography>
          ) : null}

          {marks.isError ? (
            <WidgetError error={marks.error} onRetry={() => void marks.refetch()} />
          ) : null}

          {roster.isPending || marks.isPending ? <WidgetLoading rows={6} /> : null}

          {roster.isEmptyFailure ? (
            <WidgetError error={roster.takersError} onRetry={roster.refetch} />
          ) : null}

          {!roster.isEmptyFailure && roster.takersUnknown ? (
            <WidgetDegraded
              error={roster.takersError}
              denied="Nobody could tell this screen who takes this subject, so the whole class is listed. A pupil who does not take it will be refused, and the refusal names them."
              unavailable="Who takes this subject could not be loaded, so the whole class is listed. A pupil who does not take it will be refused, and the refusal names them."
            />
          ) : null}
          {!roster.isEmptyFailure && roster.studentsError ? (
            <WidgetDegraded
              error={roster.studentsError}
              denied="You may not read this school's student records, so this roll carries roll numbers and no names."
              unavailable="Student records could not be loaded, so this roll carries roll numbers and no names."
            />
          ) : null}
          {!roster.isEmptyFailure && roster.enrollmentsError ? (
            <Alert severity="info" variant="outlined">
              Roll numbers could not be loaded. The pupils below are complete.
            </Alert>
          ) : null}
          {roster.truncated ? (
            <Alert severity="warning" variant="outlined">
              This class is longer than the {EXAM_MAX_PAGE} rows one page carries, so
              not everybody is shown.
            </Alert>
          ) : null}

          {roster.isSettled && order.length === 0 && !roster.isEmptyFailure ? (
            <WidgetEmpty message="Nobody is actively enrolled in this subject, so there is nobody to mark." />
          ) : null}

          {order.length > 0 ? (
            <MarksGrid
              rows={roster.rows}
              draftFor={(studentId) => effective.get(studentId) ?? BLANK_DRAFT}
              savedFor={(studentId) => saved.get(studentId)}
              onDraft={(studentId, draft) =>
                setDrafts((current) => ({ ...current, [studentId]: draft }))
              }
              maximum={maximum}
              mayWrite={grants.mayWrite}
              refused={refused}
            />
          ) : null}

          {order.length > 0 ? (
            <Typography variant="body2" color="text.secondary" aria-live="polite">
              {tally.marked} marked · {tally.absent} absent · {tally.exempt} exempt ·{' '}
              {tally.blank} not entered
            </Typography>
          ) : null}

          {grants.mayWrite && order.length > 0 ? (
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Type a mark and press Enter for the next pupil. Press A for absent or E
                for exempt. Absent is not a zero and is never counted as one.
              </Typography>

              {problems > 0 ? (
                <Alert severity="warning" variant="outlined">
                  {problems === 1
                    ? 'One row cannot be saved as it stands. It is marked above.'
                    : `${problems} rows cannot be saved as they stand. They are marked above.`}{' '}
                  Nothing is saved until every one of them is right: this paper is
                  recorded in one request that the server accepts whole or refuses whole.
                </Alert>
              ) : null}

              {clears > 0 ? (
                <Alert severity="info" variant="outlined">
                  {clears === 1
                    ? 'One saved mark has been emptied here.'
                    : `${clears} saved marks have been emptied here.`}{' '}
                  Emptying a box does not remove a mark that is already recorded.
                </Alert>
              ) : null}

              {overBatch ? (
                <Alert severity="warning" variant="outlined">
                  One request carries at most {EXAM_MARK_BATCH_LIMIT} pupils, and this
                  one would carry {entries.length}.
                </Alert>
              ) : null}

              {record.isError ? (
                <Alert severity="error" variant="outlined">
                  <AlertTitle>Nothing was saved</AlertTitle>
                  {failureText(record.error)}
                </Alert>
              ) : null}

              {record.isSuccess && entries.length === 0 ? (
                <Alert severity="success" variant="outlined">
                  {record.data.created} recorded, {record.data.updated} amended.
                </Alert>
              ) : null}

              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={save}
                  disabled={
                    record.isPending || entries.length === 0 || problems > 0 || overBatch
                  }
                >
                  {record.isPending ? 'Saving…' : 'Save marks'}
                </Button>
                <Button
                  size="small"
                  onClick={() => setDrafts({})}
                  disabled={record.isPending || Object.keys(drafts).length === 0}
                >
                  Discard changes
                </Button>
                <Typography variant="body2" color="text.secondary" aria-live="polite">
                  {entries.length === 0
                    ? 'Nothing to save'
                    : `${entries.length} ${entries.length === 1 ? 'pupil' : 'pupils'} to save`}
                </Typography>
              </Stack>
            </Stack>
          ) : null}
        </>
      )}
    </Stack>
  );
}

function byNewest(left: { start_at?: string }, right: { start_at?: string }): number {
  return (right.start_at ?? '').localeCompare(left.start_at ?? '');
}

function paperLabel(
  subject: ExamSubjectRow,
  offerings: readonly SchoolOfferingRow[],
): string {
  const offering = offerings.find((row) => row.id === subject.subject_offering_id);
  if (!offering) return `Paper ${shortId(subject.id)}`;
  return `${offeringLabel(offering)} · ${sectionLabel(offering.edges?.section)}`;
}

function sittingLabel(
  sitting: ExamSittingRow,
  dateOfDay: ReadonlyMap<string, string>,
): string {
  const date = dateOfDay.get(sitting.calendar_day_id ?? '');
  return date ? longDate(date) : `Sitting ${shortId(sitting.id)}`;
}
