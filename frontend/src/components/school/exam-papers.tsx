'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { CalendarPlus, Plus, X } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useDeleteSitting } from '@/hooks/mutation/use-exams';
import {
  useBranchPeriods,
  useExam,
  useExamSittings,
  useExamSubjects,
} from '@/hooks/query/use-exams';
import {
  useAllOfferings,
  useCalendarDays,
  useGradingSchemes,
  usePeriodSchemes,
  useRooms,
  useSchoolSections,
  useTeacherDirectory,
} from '@/hooks/query/use-school';
import { isDenial } from '@/lib/api-failure';
import {
  EXAM_STATUS_LABELS,
  examLabel,
  examWindowLabel,
  instantDate,
  resultsStance,
  trimNumber,
} from '@/lib/exams/exam';
import { offeringLabel, periodLabel, roomLabel, sectionLabel, teacherNames } from '@/lib/school/names';
import { dateOnly, longDate } from '@/lib/school/time';
import { ExamSubjectDialog } from './exam-subject-dialog';
import { makeNameBook, type TeacherDirectoryState } from './name-book';
import { useSchoolScope } from './school-scope';
import { SittingDialog, type PickerOption } from './sitting-dialog';
import { useTimetableGrants } from './timetable-grants';
import { useUrlState } from './url-state';
import type { ExamSittingRow, ExamSubjectRow } from '@/types/exams';

export function ExamPapers(): React.ReactElement {
  const scope = useSchoolScope();
  const { get } = useUrlState();
  const grants = useTimetableGrants();

  const examId = get('exam');
  const exam = useExam(examId);
  const subjects = useExamSubjects(examId);
  const sittings = useExamSittings(examId);

  const from = dateOnly(scope.session?.start_date) || instantDate(exam.data?.start_at);
  const to = dateOnly(scope.session?.end_date) || instantDate(exam.data?.end_at);
  const days = useCalendarDays(scope.branchId, from, to);

  const schemes = usePeriodSchemes(scope.branchId);
  const schemeRows = React.useMemo(() => schemes.data?.rows ?? [], [schemes.data]);
  const schemeIds = React.useMemo(() => schemeRows.map((row) => row.id), [schemeRows]);
  const periods = useBranchPeriods(schemeIds);

  const rooms = useRooms(scope.branchId);
  const sections = useSchoolSections(scope.branchId);
  const offerings = useAllOfferings(Boolean(scope.branchId));
  const gradingSchemes = useGradingSchemes(scope.sessionId ?? undefined);
  const directory = useTeacherDirectory(Boolean(examId));

  const periodRows = React.useMemo(() => periods.data ?? [], [periods.data]);
  const sectionRows = React.useMemo(() => sections.data?.rows ?? [], [sections.data]);
  const roomRows = React.useMemo(() => rooms.data?.rows ?? [], [rooms.data]);
  const offeringRows = React.useMemo(() => offerings.data ?? [], [offerings.data]);

  const directoryState: TeacherDirectoryState = !directory.isError
    ? 'readable'
    : isDenial(directory.error)
      ? 'denied'
      : 'unavailable';

  const names = React.useMemo(
    () =>
      makeNameBook({
        sections: sectionRows,
        periods: periodRows,
        rooms: roomRows,
        offerings: offeringRows,
        teachers: teacherNames(directory.data?.rows ?? []),
        teacherDirectory: directoryState,
      }),
    [sectionRows, periodRows, roomRows, offeringRows, directory.data, directoryState],
  );

  const dateOfDay = React.useMemo(() => {
    const out = new Map<string, string>();
    for (const day of days.data ?? []) out.set(day.id, dateOnly(day.calendar_date));
    return out;
  }, [days.data]);

  const periodOptions = React.useMemo<PickerOption[]>(() => {
    const schemeName = new Map(
      schemeRows.map((row) => [row.id, row.name ?? row.code ?? '']),
    );
    return periodRows.map((period) => {
      const scheme = schemeName.get(period.period_scheme_id ?? '');
      const suffix = schemeRows.length > 1 && scheme ? ` · ${scheme}` : '';
      return { id: period.id, label: `${periodLabel(period)}${suffix}` };
    });
  }, [periodRows, schemeRows]);

  const roomOptions = React.useMemo<PickerOption[]>(
    () => roomRows.map((room) => ({ id: room.id, label: roomLabel(room) })),
    [roomRows],
  );

  const schemeOptions = React.useMemo<PickerOption[]>(
    () =>
      (gradingSchemes.data?.rows ?? []).map((scheme) => ({
        id: scheme.id,
        label: scheme.name ?? scheme.code ?? scheme.id,
      })),
    [gradingSchemes.data],
  );

  const subjectRows = React.useMemo(() => subjects.data ?? [], [subjects.data]);

  const sittingsOf = React.useMemo(() => {
    const out = new Map<string, ExamSittingRow[]>();
    for (const sitting of sittings.data ?? []) {
      const key = sitting.exam_subject_id ?? '';
      const held = out.get(key);
      if (held) held.push(sitting);
      else out.set(key, [sitting]);
    }
    for (const list of out.values()) {
      list.sort((left, right) =>
        (dateOfDay.get(left.calendar_day_id ?? '') ?? '').localeCompare(
          dateOfDay.get(right.calendar_day_id ?? '') ?? '',
        ),
      );
    }
    return out;
  }, [sittings.data, dateOfDay]);

  const offeringOptions = React.useMemo<PickerOption[]>(() => {
    const taken = new Set(subjectRows.map((row) => row.subject_offering_id));
    const inBranch = new Set(sectionRows.map((row) => row.id));
    const session = exam.data?.academic_session_id;
    return offeringRows
      .filter(
        (offering) =>
          !taken.has(offering.id) &&
          inBranch.has(offering.section_id ?? '') &&
          (session === undefined || offering.academic_session_id === session),
      )
      .map((offering) => ({
        id: offering.id,
        label: `${offeringLabel(offering)} · ${sectionLabel(
          sectionRows.find((row) => row.id === offering.section_id),
        )}`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [offeringRows, subjectRows, sectionRows, exam.data]);

  const [editing, setEditing] = React.useState<ExamSubjectRow | 'new' | null>(null);
  const [scheduling, setScheduling] = React.useState<ExamSubjectRow | null>(null);
  const removeSitting = useDeleteSitting();

  const paperLabelOf = React.useCallback(
    (subject: ExamSubjectRow): string => {
      const offering = offeringRows.find((row) => row.id === subject.subject_offering_id);
      const section = sectionRows.find((row) => row.id === offering?.section_id);
      return `${offeringLabel(offering)} · ${sectionLabel(section)}`;
    },
    [offeringRows, sectionRows],
  );

  const sectionLabelOf = React.useCallback(
    (subject: ExamSubjectRow): string => {
      const offering = offeringRows.find((row) => row.id === subject.subject_offering_id);
      return sectionLabel(sectionRows.find((row) => row.id === offering?.section_id));
    },
    [offeringRows, sectionRows],
  );

  if (!examId) {
    return (
      <WidgetEmpty message="Choose an assessment above to see its papers and when each class sits them." />
    );
  }

  const stance = resultsStance(exam.data);
  const window = examWindowLabel(exam.data);

  return (
    <Stack spacing={2.5}>
      {exam.isPending ? <WidgetLoading rows={2} /> : null}
      {exam.isError ? (
        <WidgetError error={exam.error} onRetry={() => void exam.refetch()} />
      ) : null}

      {exam.data ? (
        <Stack spacing={1.5}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexWrap: 'wrap' }}
          >
            <Typography variant="h4" component="h3">
              {examLabel(exam.data)}
            </Typography>
            <EmergeChip
              label={exam.data.status ? EXAM_STATUS_LABELS[exam.data.status] : '—'}
              tone={exam.data.status === 'published' ? 'green' : 'grey'}
            />
            {window ? (
              <Typography variant="body2" color="text.secondary">
                {window}
              </Typography>
            ) : null}
          </Stack>

          {stance === 'counts' ? (
            <Alert severity="success" variant="outlined">
              Marks from this assessment count toward the report card.
            </Alert>
          ) : null}
          {stance === 'practice' ? (
            <Alert severity="warning" variant="outlined">
              <AlertTitle>Practice: none of this counts</AlertTitle>
              Every paper below is set, sat and marked as normal, and not one mark
              from it reaches the report card.
            </Alert>
          ) : null}
          {stance === 'unstated' ? (
            <Alert severity="info" variant="outlined">
              This record does not say whether these marks count toward the report
              card, so this screen will not guess. Ask somebody who can read the
              assessment in full before relying on it.
            </Alert>
          ) : null}
        </Stack>
      ) : null}

      <CardToolbar
        summary={
          <>
            {subjectRows.length} {subjectRows.length === 1 ? 'paper' : 'papers'} ·{' '}
            {sittings.data?.length ?? 0}{' '}
            {(sittings.data?.length ?? 0) === 1 ? 'sitting' : 'sittings'} scheduled
          </>
        }
      >
        {grants.mayWrite ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={() => setEditing('new')}
          >
            Add a paper
          </Button>
        ) : null}
      </CardToolbar>

      {subjects.isPending ? <WidgetLoading rows={4} /> : null}
      {subjects.isError ? (
        <WidgetError error={subjects.error} onRetry={() => void subjects.refetch()} />
      ) : null}
      {subjects.data && subjectRows.length === 0 ? (
        <WidgetEmpty message="No papers yet. A paper is one subject in one class, with what it is marked out of." />
      ) : null}

      {sittings.isError ? (
        <WidgetError error={sittings.error} onRetry={() => void sittings.refetch()} />
      ) : null}

      {subjectRows.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Paper</TableCell>
                <TableCell align="right">Marked out of</TableCell>
                <TableCell align="right">Pass mark</TableCell>
                <TableCell>Sittings</TableCell>
                {grants.mayWrite ? <TableCell align="right">Edit</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {subjectRows.map((subject) => {
                const held = sittingsOf.get(subject.id) ?? [];
                return (
                  <TableRow key={subject.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {paperLabelOf(subject)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {subject.maximum_marks === undefined
                        ? '—'
                        : trimNumber(subject.maximum_marks)}
                    </TableCell>
                    <TableCell align="right">
                      {subject.pass_marks === undefined
                        ? 'None'
                        : trimNumber(subject.pass_marks)}
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                        {held.length === 0 ? (
                          <Typography variant="body2" color="text.secondary">
                            Not scheduled
                          </Typography>
                        ) : (
                          held.map((sitting) => (
                            <Stack
                              key={sitting.id}
                              direction="row"
                              spacing={0.5}
                              sx={{ alignItems: 'center' }}
                            >
                              <Typography variant="body2">
                                {sittingLine(sitting, dateOfDay, names)}
                              </Typography>
                              {grants.mayDelete ? (
                                <Button
                                  size="small"
                                  color="error"
                                  aria-label={`Remove the sitting on ${sittingLine(sitting, dateOfDay, names)}`}
                                  disabled={removeSitting.isPending}
                                  onClick={() => removeSitting.mutate(sitting.id)}
                                  sx={{ minWidth: 0, px: 0.5 }}
                                >
                                  <X size={14} />
                                </Button>
                              ) : null}
                            </Stack>
                          ))
                        )}
                        {grants.mayWrite ? (
                          <Button
                            size="small"
                            startIcon={<CalendarPlus size={14} />}
                            onClick={() => setScheduling(subject)}
                            sx={{ px: 0.5 }}
                          >
                            Schedule a sitting
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                    {grants.mayWrite ? (
                      <TableCell align="right">
                        <Button size="small" onClick={() => setEditing(subject)}>
                          Edit
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {removeSitting.isError ? (
        <WidgetError error={removeSitting.error} />
      ) : null}

      {anySittings(subjectRows, sittingsOf) ? (
        <Typography variant="body2" color="text.secondary">
          A sitting cannot be moved once it is made. Remove it and schedule another.
        </Typography>
      ) : null}

      <ExamSubjectDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        examId={examId}
        subject={editing === 'new' ? undefined : (editing ?? undefined)}
        paperLabel={
          editing && editing !== 'new' ? paperLabelOf(editing) : ''
        }
        offerings={offeringOptions}
        gradingSchemes={schemeOptions}
        mayDelete={grants.mayDelete}
        sittingCount={
          editing && editing !== 'new' ? (sittingsOf.get(editing.id)?.length ?? 0) : 0
        }
      />

      <SittingDialog
        open={scheduling !== null}
        onClose={() => setScheduling(null)}
        subject={scheduling ?? undefined}
        paperLabel={scheduling ? paperLabelOf(scheduling) : ''}
        sectionLabel={scheduling ? sectionLabelOf(scheduling) : ''}
        periods={periodOptions}
        rooms={roomOptions}
        names={names}
      />
    </Stack>
  );
}

function sittingLine(
  sitting: ExamSittingRow,
  dateOfDay: ReadonlyMap<string, string>,
  names: { period: (id?: string) => string; room: (id?: string) => string },
): string {
  const date = dateOfDay.get(sitting.calendar_day_id ?? '');
  const parts = [
    date ? longDate(date) : 'Outside the dates shown',
    names.period(sitting.period_id),
  ];
  if (sitting.room_id) parts.push(names.room(sitting.room_id));
  return parts.join(' · ');
}

function anySittings(
  subjects: readonly ExamSubjectRow[],
  sittingsOf: ReadonlyMap<string, ExamSittingRow[]>,
): boolean {
  return subjects.some((subject) => (sittingsOf.get(subject.id)?.length ?? 0) > 0);
}
