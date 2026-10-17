'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, Award, AlertOctagon } from 'lucide-react';

import { StudentGradesPanel } from '@/components/grades/student-grades-panel';
import { useReach } from '@/hooks/query/use-reach';
import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { TabLabel } from '@/components/ui/tab-label';
import { FactStrip } from '@/components/ui/fact-strip';
import { EmptyState } from '@/components/ui/empty-state';
import { Grid } from '@/components/ui/layout';
import { Metric } from '@/components/ui/metric';
import { Row } from '@/components/ui/row';
import { ATTENDANCE_WINDOW_DAYS } from '@/constants/people-detail';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { useRosterMember } from '@/hooks/query/use-roster-member';
import { useSubjectIndex } from '@/hooks/query/use-subject-index';
import {
  useStudentAssignments,
  useStudentAttendanceDays,
  useStudentAttendancePeriods,
  useStudentEnrollments,
  useStudentStream,
  useStudentSubjects,
  useStudentSubmissions,
} from '@/hooks/query/use-student-page';
import { capabilityFor, readVisibility } from '@/lib/core/fields';
import { codeOf, fieldsIntact, nameOf, personOf } from '@/lib/core/roster';
import { studentAudience } from '@/lib/people/audience';
import { tally, totalOf } from '@/lib/people/tally';
import { joinFacts } from '@/lib/people/text';
import { formatDateOnly, formatTimestamp, trailingWindow } from '@/lib/people/window';
import { paths } from '@/paths';
import type { ApiError } from '@/services/api';
import type { SectionRow } from '@/types/academic';
import type {
  AssignmentSubmissionRow,
  IdentifiablePerson,
  StreamPostRow,
} from '@/types/people-detail';
import type { StudentRow } from '@/types/roster';

import { AttendanceDetail } from './attendance-detail';
import { IdentifierList, type IdentifierEntry } from './copy-id';
import { Panel, PanelList, PanelNote } from './panel';
import { ReportIncidentDialog } from './report-incident-dialog';
import { PersonHeader } from './person-header';
import { RecordFields } from './record-fields';
import { StudentReportCard } from './student-report-card';

const STUDENT_TABS = ['overview', 'profile', 'academics', 'assignments', 'posts'] as const;

type StudentTab = (typeof STUDENT_TABS)[number];

const TAB_LABEL: Readonly<Record<StudentTab, string>> = {
  overview: 'Overview',
  profile: 'Profile',
  academics: 'Subjects & results',
  assignments: 'Assignments',
  posts: 'Posts',
};

export function StudentDetail({
  studentId,
  personaSlug,
  gradesSession,
  listPath = 'people/students',
}: {
  studentId: string;
  personaSlug: string;
  // The academic year the examinations open on; the current one when absent.
  gradesSession?: string;
  // Where the list this record was opened from lives: People, or a teacher's My students.
  listPath?: string;
}): React.ReactElement {
  const { get, put } = useUrlState();
  const teaching = useReach()?.kind === 'teaching';
  const [reporting, setReporting] = React.useState(false);
  const tab = STUDENT_TABS.find((name) => name === get('tab')) ?? 'overview';
  const record = useRosterMember<StudentRow>('students', studentId);
  const capabilities = useCapabilities();
  const studentFields = capabilityFor(capabilities.data?.capabilities, 'core.students.read');
  const personFields = capabilityFor(capabilities.data?.capabilities, 'core.persons.read');

  const enrollments = useStudentEnrollments(studentId);
  const subjects = useStudentSubjects(studentId);

  const attendanceWindow = React.useMemo(() => trailingWindow(ATTENDANCE_WINDOW_DAYS), []);
  const days = useStudentAttendanceDays(studentId, attendanceWindow);
  const sessions = useMdmSessions();
  const sessionStart = (sessions.data?.rows.find((row) => row.is_current)?.start_date ?? '').slice(0, 10);
  const yearWindow = React.useMemo(() => ({ from: sessionStart || attendanceWindow.from, to: attendanceWindow.to }), [sessionStart, attendanceWindow]);
  const yearDays = useStudentAttendanceDays(studentId, yearWindow, 200);
  const periods = useStudentAttendancePeriods(studentId, attendanceWindow);

  const audience = studentAudience(
    studentId,
    enrollments.data?.rows ?? [],
    subjects.data?.rows ?? [],
  );

  const assignments = useStudentAssignments(audience.ids);
  const submissions = useStudentSubmissions(studentId);
  const stream = useStudentStream(audience.ids);

  const subjectRows = subjects.data?.rows ?? [];
  const assignmentRows = assignments.data?.rows ?? [];
  const subjectIndex = useSubjectIndex(subjectRows.length > 0 || assignmentRows.length > 0);

  const subjectOfOffering = new Map<string, string>();
  for (const row of subjectRows) {
    const offering = row.edges?.subject_offering;
    if (offering?.id && offering.subject_id) {
      subjectOfOffering.set(offering.id, offering.subject_id);
    }
  }

  const latestSubmission = new Map<string, AssignmentSubmissionRow>();
  for (const row of submissions.data?.rows ?? []) {
    if (!row.assignment_id) continue;
    const held = latestSubmission.get(row.assignment_id);
    if (!held || (row.attempt_number ?? 0) >= (held.attempt_number ?? 0)) {
      latestSubmission.set(row.assignment_id, row);
    }
  }

  const audienceResolved = audience.ids.length > 0;
  const audiencePending = enrollments.isPending || subjects.isPending;
  const audienceLine = audienceResolved
    ? `Addressed to ${audience.kinds.join(', ')}. An audience is a union, so anything sent to a group this student belongs to appears here too.`
    : undefined;

  if (record.isError) {
    return <UnreachableStudent error={record.error} personaSlug={personaSlug} listPath={listPath} />;
  }

  const person = record.data ? personOf('students', record.data) : null;
  const identity = person?.status === 'present' ? (person.person as IdentifiablePerson) : null;
  const name = person?.status === 'present' ? nameOf(person.person) : null;
  const currentEnrollment = enrollments.data?.rows[0];
  const currentSection = currentEnrollment?.edges?.section;
  const admission = record.data
    ? codeOf(record.data, ['admission_number', 'student_code'])
    : null;

  const casVisibility = readVisibility(personFields, 'cas_user_id', identity?.cas_user_id);
  const identifierCandidates: (IdentifierEntry | null)[] = [
    { label: 'Student id', value: studentId },
    identity?.id ? { label: 'Person id', value: identity.id } : null,
    identity && casVisibility === 'shown'
      ? { label: 'CAS user id', value: identity.cas_user_id }
      : identity && casVisibility === 'withheld'
        ? { label: 'CAS user id', withheld: true }
        : null,
  ];
  const identifiers = identifierCandidates.filter(
    (entry): entry is IdentifierEntry => entry !== null,
  );

  const halfDays = tally([
    ...(days.data?.rows ?? []).map((row) => row.forenoon_status),
    ...(days.data?.rows ?? []).map((row) => row.afternoon_status),
  ]);
  const periodMarks = tally((periods.data?.rows ?? []).map((row) => row.status));
  const halfDayTotal = totalOf(halfDays);
  const attendancePct = halfDayTotal === 0 ? null : Math.round(((halfDays.find((entry) => entry.value === 'present')?.count ?? 0) / halfDayTotal) * 100);
  const pendingWork = assignmentRows.filter((row) => {
    const status = latestSubmission.get(row.id)?.status;
    return status === undefined || status === 'not_submitted' || status === 'draft';
  }).length;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <PersonHeader
          name={name}
          subtitle={admission}
          chips={record.data?.status ? [record.data.status] : []}
          isPending={record.isPending}
        />
        {teaching ? (
          <Button variant="outlined" startIcon={<AlertOctagon size={15} />} onClick={() => setReporting(true)} sx={{ flex: 'none', alignSelf: { xs: 'flex-start', sm: 'center' } }}>
            Report an Incident
          </Button>
        ) : null}
      </Stack>
      {reporting ? <ReportIncidentDialog studentId={studentId} name={name ?? 'this pupil'} onClose={() => setReporting(false)} /> : null}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, next: StudentTab) => put({ tab: next === 'overview' ? null : next })} variant="scrollable" allowScrollButtonsMobile aria-label="Parts of this student's record">
          {STUDENT_TABS.map((name) => (
            <Tab
              key={name}
              value={name}
              label={<TabLabel label={TAB_LABEL[name]} count={name === 'assignments' ? pendingWork : 0} />}
            />
          ))}
        </Tabs>
      </Box>

      {tab === 'overview' ? (
        <>
          <FactStrip
            facts={[
              { label: 'Class', value: currentSection ? sectionTitle(currentSection) : '—', note: currentEnrollment?.roll_number ? `Roll ${currentEnrollment.roll_number}` : undefined },
              { label: 'Attendance', value: attendancePct === null ? '—' : `${attendancePct}%`, note: `Last ${ATTENDANCE_WINDOW_DAYS} days; the year is below` },
              { label: 'Subjects', value: subjectRows.length, note: 'This session' },
              { label: 'Work outstanding', value: pendingWork, note: `${assignmentRows.length} set in all` },
            ]}
          />
          <Grid cols={2}>
          <Panel
            title="Class"
            note="The current academic session."
            isPending={enrollments.isPending}
            error={enrollments.error}
            isEmpty={(enrollments.data?.rows.length ?? 0) === 0}
            empty="This student is not enrolled in a class in the current session."
            denied="You do not have permission to read enrolments."
            onRetry={() => void enrollments.refetch()}
          >
            <PanelList>
              {(enrollments.data?.rows ?? []).map((row) => (
                <Box component="li" key={row.id}>
                  <Row
                    title={sectionTitle(row.edges?.section)}
                    subtitle={joinFacts([
                      row.roll_number ? `Roll ${row.roll_number}` : null,
                      row.enrollment_number,
                      formatDateOnly(row.enrollment_date),
                    ])}
                    trailing={row.status ? <EmergeChip label={row.status} /> : undefined}
                  />
                </Box>
              ))}
            </PanelList>
          </Panel>
          <Panel
            title="Identifiers"
            note="What to quote when asking someone to look this student up."
            denied="No identifiers are readable here."
          >
            <>
              <IdentifierList entries={identifiers} />
              {!identity && !record.isPending ? (
                <PanelNote>
                  The person behind this student is not readable by you, so only the
                  student record id is listed.
                </PanelNote>
              ) : null}
            </>
          </Panel>
          </Grid>
          <AttendanceDetail rows={yearDays.data?.rows ?? []} from={yearWindow.from} to={yearWindow.to} isPending={yearDays.isPending} hasMore={Boolean(yearDays.data?.page.has_more)} />
        </>
      ) : null}

      {tab === 'profile' ? (
        <>
        <Panel
          title="Details"
          note="The school's own record for this student, and the person behind it."
          isPending={record.isPending || capabilities.isPending}
          error={(capabilities.error as ApiError | null) ?? null}
          denied="You do not have permission to read student records."
        >
          {record.data ? (
            <Stack spacing={3}>
              <RecordFields
                capability={studentFields}
                row={record.data as unknown as Record<string, unknown>}
                intact={fieldsIntact(record.data)}
                unnamed="The catalogue does not name the columns on a student record, so nothing can be listed by field. The record itself was returned."
                denied="You do not have permission to read the details of a student record."
              />
              <div>
                <Typography variant="h4" component="h3" sx={{ mb: 1.5 }}>
                  Contact
                </Typography>
                {person?.status === 'present' ? (
                  <RecordFields
                    capability={personFields}
                    row={person.person as unknown as Record<string, unknown>}
                    intact
                    unnamed="The catalogue does not name the columns on a person record, so nothing can be listed by field."
                    denied="You do not have permission to read person records."
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    {person?.status === 'withheld'
                      ? 'The person behind this record is not shown to you.'
                      : 'No person record is attached to this student.'}
                  </Typography>
                )}
              </div>
            </Stack>
          ) : null}
        </Panel>
        </>
      ) : null}

      {tab === 'academics' ? (
        <>
          <Card>
            <CardHeader title="Examinations" subheader="The same reading as the grade explorer: the trend, the subjects, and every paper" />
            <CardContent>
              <StudentGradesPanel studentId={studentId} personaSlug={personaSlug} sessionId={gradesSession} />
            </CardContent>
          </Card>
        <Panel
          title="Subjects"
          note="What this student is enrolled to study this session."
          isPending={subjects.isPending}
          error={subjects.error}
          isEmpty={subjectRows.length === 0}
          empty="No subject enrolments are recorded for this student."
          denied="You do not have permission to read subject enrolments."
          onRetry={() => void subjects.refetch()}
        >
          <>
            <PanelList>
              {subjectRows.map((row) => {
                const offering = row.edges?.subject_offering;
                return (
                  <Box component="li" key={row.id}>
                    <Row
                      title={subjectIndex.nameOf(offering?.subject_id) ?? 'Subject not named to you'}
                      subtitle={joinFacts([
                        subjectIndex.codeOf(offering?.subject_id),
                        offering?.periods_per_week
                          ? `${offering.periods_per_week} periods a week`
                          : null,
                      ])}
                      trailing={row.status ? <EmergeChip label={row.status} /> : undefined}
                    />
                  </Box>
                );
              })}
            </PanelList>
            {!subjectIndex.readable && subjectRows.length > 0 ? (
              <PanelNote>
                You may see which subjects this student takes but not the subject
                catalogue, so they cannot be named here.
              </PanelNote>
            ) : null}
          </>
        </Panel>
  

        <StudentReportCard studentId={studentId} personaSlug={personaSlug} />
        </>
      ) : null}

      {tab === 'assignments' ? (
      <Panel
        title="Assignments"
        note={audienceLine}
        blocked={
          !audienceResolved && !audiencePending
            ? 'Nothing could be established about which work is set for this student, so nothing is listed. This screen does not fall back to every assignment in the school.'
            : undefined
        }
        isPending={audiencePending || assignments.isPending || submissions.isPending}
        error={assignments.error}
        isEmpty={assignmentRows.length === 0}
        empty="No work has been set for this student."
        denied="You do not have permission to read assignments."
        unavailable="Assignments are not served by your school's system yet."
        onRetry={() => void assignments.refetch()}
      >
        <>
          <PanelList>
            {assignmentRows.map((row) => {
              const submission = latestSubmission.get(row.id);
              const subjectId = row.subject_offering_id
                ? subjectOfOffering.get(row.subject_offering_id)
                : undefined;
              return (
                <Box component="li" key={row.id}>
                  <Row
                    title={row.title ?? 'Untitled'}
                    subtitle={joinFacts([
                      subjectIndex.nameOf(subjectId),
                      row.due_at ? `Due ${formatTimestamp(row.due_at)}` : null,
                      row.assignment_type,
                      submissionLine(submission),
                    ])}
                    trailing={
                      <Stack direction="row" spacing={0.5}>
                        {submission?.late ? <EmergeChip label="late" /> : null}
                        <EmergeChip label={submission?.status ?? 'not submitted'} />
                      </Stack>
                    }
                  />
                </Box>
              );
            })}
          </PanelList>
          {submissions.isError ? (
            <PanelNote>
              Submission status could not be read, so the work is listed without it.
            </PanelNote>
          ) : null}
          {assignments.data?.page.has_more ? (
            <PanelNote>More work is set than is shown here.</PanelNote>
          ) : null}
        </>
      </Panel>
      ) : null}

      {tab === 'posts' ? (
      <Panel
        title="Posts"
        note={audienceLine}
        blocked={
          !audienceResolved && !audiencePending
            ? 'Nothing could be established about which audiences this student belongs to, so nothing is listed. This screen does not fall back to the whole school stream.'
            : undefined
        }
        isPending={audiencePending || stream.isPending}
        error={stream.error}
        isEmpty={(stream.data?.rows.length ?? 0) === 0}
        empty="Nothing has been posted to this student."
        denied="You do not have permission to read the stream."
        unavailable="The stream is not served by your school's system yet."
        onRetry={() => void stream.refetch()}
      >
        <PanelList>
          {(stream.data?.rows ?? []).map((row) => (
            <Box component="li" key={row.id}>
              <Row
                title={postTitle(row)}
                subtitle={joinFacts([
                  row.post_type,
                  formatTimestamp(row.published_at ?? row.created_at),
                ])}
                trailing={row.pinned ? <EmergeChip label="pinned" /> : undefined}
              />
            </Box>
          ))}
        </PanelList>
      </Panel>
      ) : null}
    </Stack>
  );
}

function UnreachableStudent({
  error,
  personaSlug,
  listPath,
}: {
  error: ApiError;
  personaSlug: string;
  listPath: string;
}): React.ReactElement {
  const back = (
    <Button component={NextLink} href={paths.personaSection(personaSlug, listPath)}>
      Back to the list
    </Button>
  );

  if (error.status === 404) {
    return (
      <EmptyState
        title="This student is not one you may see"
        body="The school either holds no such record or it is outside what you may reach. Both answer the same way on purpose, so a link cannot be used to find out which."
        action={back}
      />
    );
  }

  if (error.isForbidden) {
    return (
      <EmptyState
        title="You cannot read student records"
        body="Your school has not granted you access to the student register."
        action={back}
      />
    );
  }

  if (error.status === 400) {
    return (
      <EmptyState
        title="That link does not name a student"
        body="The address is not a record identifier this school would recognise."
        action={back}
      />
    );
  }

  return (
    <Alert severity="warning" variant="outlined" action={back}>
      This student could not be loaded.
    </Alert>
  );
}

function sectionTitle(section: SectionRow | undefined): string {
  if (!section) return 'Class not shown to you';
  const grade = section.edges?.grade_level?.name;
  if (grade) return joinFacts([grade, section.name ?? section.code]) ?? grade;
  return section.code ?? section.name ?? 'Class';
}

function submissionLine(submission: AssignmentSubmissionRow | undefined): string | null {
  if (!submission) return null;
  return (
    joinFacts([
      submission.submitted_at ? `Submitted ${formatTimestamp(submission.submitted_at)}` : null,
      typeof submission.marks_obtained === 'number'
        ? typeof submission.total_marks === 'number'
          ? `${submission.marks_obtained} of ${submission.total_marks}`
          : `${submission.marks_obtained} marks`
        : null,
    ]) ?? null
  );
}

function postTitle(row: StreamPostRow): string {
  if (row.title) return row.title;
  if (row.body) return row.body.split('\n')[0] ?? 'Post';
  return 'Post not shown to you';
}
