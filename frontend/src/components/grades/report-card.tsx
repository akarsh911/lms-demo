'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import GlobalStyles from '@mui/material/GlobalStyles';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { Printer } from 'lucide-react';

import { ResultBreakdown } from '@/components/grades/result-breakdown';
import { useResultGrants } from '@/components/school/results/result-grants';
import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { useReportCard } from '@/hooks/query/use-report-card';
import { useRosterMember } from '@/hooks/query/use-roster-member';
import { useAcademicSessions } from '@/hooks/query/use-school';
import { apiFailureKind, SESSION_ENDED } from '@/lib/api-failure';
import { codeOf, nameOf, personOf } from '@/lib/core/roster';
import { trimNumber } from '@/lib/exams/exam';
import { joinFacts } from '@/lib/people/text';
import { formatDateOnly, isoDay } from '@/lib/people/window';
import { compositionGaps, marksOf, scoreScale } from '@/lib/results/outcome';
import {
  reportPupilResult,
  reportStatusLabel,
  reportStatusTally,
  reportStatusTone,
} from '@/lib/results/report-card';
import { paths } from '@/paths';
import type { ApiError } from '@/services/api';
import type { ReportCard, ReportSubjectLine } from '@/types/report-card';
import type { StudentRow } from '@/types/roster';
import type { AcademicSessionRow } from '@/types/school';

const SHEET_WIDTH = 880;

const WITHHELD_NAME = 'Name not shown to you';

const PROVISIONAL_CARD =
  'A mark behind one of these subjects was given by machine and is still waiting for a ' +
  'teacher to read the written answers, so a total on this card can still move.';

const SETTLED_CARD =
  'Every subject on this card is settled: every mark is in, every one has been read by ' +
  'a teacher, and every part of each scheme was scored.';

const subscribeToNothing = (): (() => void) => () => {};
const printedToday = (): string | null => formatDateOnly(isoDay(new Date()));
const printedNowhere = (): string | null => null;

const printStyles = (
  <GlobalStyles
    styles={{
      '@page': { margin: '14mm' },
      '@media print': {
        'html, body': { background: '#fff' },
        '[data-print="hide"]': { display: 'none !important' },
        '[data-print="page"]': { padding: 0, background: '#fff', minHeight: 0 },
        '[data-print="sheet"]': {
          boxShadow: 'none',
          border: 'none',
          borderRadius: 0,
          padding: 0,
          maxWidth: 'none',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        },
        '[data-print="keep"]': { breakInside: 'avoid', pageBreakInside: 'avoid' },
        '[data-print="head"]': { breakAfter: 'avoid', pageBreakAfter: 'avoid' },
      },
    }}
  />
);

export function StudentReportCardView({
  studentId,
  personaSlug,
}: {
  studentId: string;
  personaSlug: string;
}): React.ReactElement {
  const { get, put } = useUrlState();
  const asked = get('session');
  const grants = useResultGrants();

  const card = useReportCard(studentId, asked, grants.mayReadExams);
  const record = useRosterMember<StudentRow>('students', studentId);
  const sessions = useAcademicSessions();

  const [detailed, setDetailed] = React.useState(false);
  const printedOn = React.useSyncExternalStore(
    subscribeToNothing,
    printedToday,
    printedNowhere,
  );

  const back = (
    <Button
      component={NextLink}
      href={paths.personaSection(personaSlug, `people/students/${studentId}`)}
      variant="outlined"
    >
      Back to the pupil
    </Button>
  );

  if (!grants.mayReadExams) {
    return (
      <Page>
        <EmptyState
          title="You cannot read results"
          body="A report card is assembled from what each subject's marks add up to, and your school has not granted you that."
          action={back}
        />
      </Page>
    );
  }

  const person = record.data ? personOf('students', record.data) : null;
  const name =
    person?.status === 'present' ? (nameOf(person.person) ?? WITHHELD_NAME) : null;
  const admission = record.data
    ? codeOf(record.data, ['admission_number', 'student_code'])
    : null;

  const sessionRows = sessions.data?.rows ?? [];
  const named = sessionRows.find((row) => row.id === card.data?.academic_session_id);

  return (
    <Page>
      {printStyles}
      <Stack
        data-print="hide"
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5, mb: 2.5 }}
      >
        {back}
        {sessionRows.length > 1 ? (
          <TextField
            select
            size="small"
            label="Session"
            value={asked ?? card.data?.academic_session_id ?? ''}
            onChange={(event) => put({ session: event.target.value })}
            sx={{ minWidth: 220 }}
          >
            {sessionRows.map((row) => (
              <MenuItem key={row.id} value={row.id}>
                {sessionName(row) ?? row.id}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={detailed}
              onChange={(event) => setDetailed(event.target.checked)}
            />
          }
          label="Show how each total was reached"
        />
        <Button
          variant="contained"
          startIcon={<Printer size={18} />}
          onClick={() => window.print()}
          disabled={!card.data}
        >
          Print
        </Button>
      </Stack>

      <Paper
        data-print="sheet"
        variant="outlined"
        sx={{ maxWidth: SHEET_WIDTH, mx: 'auto', p: { xs: 2.5, sm: 4 } }}
      >
        <Stack spacing={2.5}>
          <Box data-print="head">
            <Typography variant="h2" component="h1">
              {record.isPending ? <Skeleton width={260} /> : (name ?? WITHHELD_NAME)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {joinFacts([
                'Report card',
                sessionName(named),
                admission,
                printedOn ? `Printed ${printedOn}` : null,
              ])}
            </Typography>
          </Box>

          {card.isError ? (
            <CardProblem error={card.error} onRetry={() => void card.refetch()} />
          ) : null}

          {card.isPending ? (
            <Stack spacing={1.5}>
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} variant="rounded" height={64} />
              ))}
            </Stack>
          ) : null}

          {card.data ? (
            <CardBody
              card={card.data}
              detailed={detailed}
              unnamedSession={named === undefined && sessionRows.length > 0}
            />
          ) : null}
        </Stack>
      </Paper>
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box
      data-print="page"
      sx={{
        minHeight: '100dvh',
        bgcolor: 'background.default',
        px: { xs: 2, sm: 3 },
        py: 3,
      }}
    >
      {children}
    </Box>
  );
}

function CardBody({
  card,
  detailed,
  unnamedSession,
}: {
  card: ReportCard;
  detailed: boolean;
  unnamedSession: boolean;
}): React.ReactElement {
  const tally = reportStatusTally(card.subjects_by_status);

  return (
    <Stack spacing={2.5}>
      {card.count === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {card.reason ?? 'There is nothing on this card for that session.'}
        </Typography>
      ) : null}

      {tally.length > 0 ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ flexWrap: 'wrap', rowGap: 0.75 }}
          role="group"
          aria-label="Where each subject on this card stands"
        >
          <EmergeChip label={`${card.count} subjects`} />
          {tally.map((entry) => (
            <EmergeChip
              key={entry.status}
              label={`${entry.label} ${entry.count}`}
              tone={entry.tone}
              dot
            />
          ))}
        </Stack>
      ) : null}

      {card.provisional ? (
        <Alert severity="warning" variant="outlined" data-print="keep">
          <AlertTitle>This card is not settled</AlertTitle>
          {PROVISIONAL_CARD}
        </Alert>
      ) : null}

      {card.final ? (
        <Alert severity="success" variant="outlined" data-print="keep">
          {SETTLED_CARD}
        </Alert>
      ) : null}

      {!card.covers_every_subject && card.coverage_reason ? (
        <Alert severity="info" variant="outlined" data-print="keep">
          <AlertTitle>This is part of the card, not the whole of it</AlertTitle>
          {card.coverage_reason}
        </Alert>
      ) : null}

      {unnamedSession ? (
        <Typography variant="caption" color="text.secondary">
          The session this card covers is not one whose name you may read, so it is not
          named above.
        </Typography>
      ) : null}

      <Stack component="ul" spacing={0} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {card.subjects.map((line) => (
          <SubjectLine
            key={line.subject_offering_id}
            studentId={card.student_id}
            line={line}
            detailed={detailed}
          />
        ))}
      </Stack>

      {card.count > 0 ? (
        <Box
          data-print="keep"
          sx={{ borderTop: '1px solid', borderTopColor: 'divider', pt: 2 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            There is no total across subjects
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {card.aggregate_reason}
          </Typography>
        </Box>
      ) : null}
    </Stack>
  );
}

function SubjectLine({
  studentId,
  line,
  detailed,
}: {
  studentId: string;
  line: ReportSubjectLine;
  detailed: boolean;
}): React.ReactElement {
  const result = line.result;
  const scored = result !== null && result.assessed_total > 0;
  const pupil = reportPupilResult(studentId, line);
  const gaps = compositionGaps(line.composition);

  return (
    <Box
      component="li"
      data-print={detailed ? undefined : 'keep'}
      sx={{ py: 2, borderTop: '1px solid', borderTopColor: 'divider' }}
    >
      <Stack spacing={1.25}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            rowGap: 0.5,
          }}
        >
          <Box>
            <Typography variant="h4" component="h2">
              {line.subject}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {joinFacts([line.subject_code, line.result_scheme])}
            </Typography>
          </Box>
          <EmergeChip
            label={reportStatusLabel(line.status)}
            tone={reportStatusTone(line.status)}
            dot
          />
        </Stack>

        <Stack
          direction="row"
          spacing={2.5}
          sx={{ alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 1 }}
        >
          {scored && result ? (
            <Box>
              <Typography
                variant="h3"
                component="p"
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {marksOf(result.score, scoreScale(result).assessed)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Marks
              </Typography>
            </Box>
          ) : null}
          <SubjectGrade line={line} />
        </Stack>

        {line.reason ? (
          <Typography variant="body2" color="text.secondary">
            {line.reason}
          </Typography>
        ) : null}

        {detailed && pupil ? (
          <Box sx={{ pt: 1 }}>
            <ResultBreakdown pupil={pupil} composition={gaps} />
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}

function SubjectGrade({ line }: { line: ReportSubjectLine }): React.ReactElement {
  const grade = line.grade;

  if (grade) {
    return (
      <Box>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'baseline', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography variant="h3" component="p">
            {grade.label}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {trimNumber(grade.percentage)}%
          </Typography>
          {grade.provisional ? <EmergeChip label="Provisional" tone="amber" dot /> : null}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {joinFacts([
            grade.grading_scheme,
            `Band ${trimNumber(grade.min_percent)}–${trimNumber(grade.max_percent)}%`,
            grade.points === undefined ? null : `${trimNumber(grade.points)} points`,
            grade.description,
          ])}
        </Typography>
      </Box>
    );
  }

  const gap = line.grade_not_named;
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        No grade is named
      </Typography>
      {gap ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
          {gap.reason}
        </Typography>
      ) : null}
      {gap?.grading_scheme ? (
        <Typography variant="caption" color="text.secondary">
          {gap.grading_scheme}
        </Typography>
      ) : null}
    </Box>
  );
}

function CardProblem({
  error,
  onRetry,
}: {
  error: ApiError;
  onRetry: () => void;
}): React.ReactElement {
  if (error.status === 404) {
    return (
      <Alert severity="info" variant="outlined">
        <AlertTitle>This pupil is not one you may see</AlertTitle>
        The school either holds no such record or it is outside what you may reach. Both
        answer the same way on purpose.
      </Alert>
    );
  }

  if (error.status === 400) {
    return (
      <Alert severity="info" variant="outlined">
        {error.message}
      </Alert>
    );
  }

  const kind = apiFailureKind(error);
  if (kind === 'denied') {
    return (
      <Alert severity="info" variant="outlined">
        You do not have permission to read this pupil&rsquo;s results, so no report card
        can be assembled.
      </Alert>
    );
  }

  if (kind === 'signed_out') {
    return (
      <Alert severity="warning" variant="outlined">
        {SESSION_ENDED}
      </Alert>
    );
  }

  return (
    <Alert
      severity="warning"
      variant="outlined"
      action={
        <Button size="small" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      This report card could not be loaded.
    </Alert>
  );
}

function sessionName(row: AcademicSessionRow | undefined): string | null {
  if (!row) return null;
  return row.name ?? row.code ?? null;
}
