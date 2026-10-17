'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { Grid } from '@/components/ui/layout';
import { Row } from '@/components/ui/row';
import { TIMETABLE_WINDOW_DAYS } from '@/constants/people-detail';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useOfferingIndex } from '@/hooks/query/use-offering-index';
import { useRosterMember } from '@/hooks/query/use-roster-member';
import { useSubjectIndex } from '@/hooks/query/use-subject-index';
import {
  useAuthoredStream,
  useTeacherAssignments,
  useTeacherTimetable,
} from '@/hooks/query/use-teacher-page';
import { capabilityFor, readVisibility } from '@/lib/core/fields';
import { codeOf, fieldsIntact, nameOf, personOf } from '@/lib/core/roster';
import { teacherBranchIds } from '@/lib/people/audience';
import { joinFacts } from '@/lib/people/text';
import {
  formatDateOnly,
  formatMinuteOfDay,
  formatTimestamp,
  forwardWindow,
} from '@/lib/people/window';
import { formatLongDate } from '@/lib/dates';
import { paths } from '@/paths';
import type { ApiError } from '@/services/api';
import type { SectionRow } from '@/types/academic';
import type {
  IdentifiablePerson,
  StreamPostRow,
  TimetableOccurrence,
} from '@/types/people-detail';
import type { TeacherRow } from '@/types/roster';

import { FreeTimeFinder } from './free-time-finder';
import { IdentifierList, type IdentifierEntry } from './copy-id';
import { Panel, PanelList, PanelNote } from './panel';
import { PersonHeader } from './person-header';
import { RecordFields } from './record-fields';
import { TeacherExperience } from './teacher-experience';

export function TeacherDetail({
  teacherId,
  personaSlug,
}: {
  teacherId: string;
  personaSlug: string;
}): React.ReactElement {
  const record = useRosterMember<TeacherRow>('teachers', teacherId);
  const capabilities = useCapabilities();
  const teacherFields = capabilityFor(capabilities.data?.capabilities, 'core.teachers.read');
  const staffFields = capabilityFor(capabilities.data?.capabilities, 'core.staff.read');
  const personFields = capabilityFor(capabilities.data?.capabilities, 'core.persons.read');

  const assignments = useTeacherAssignments(teacherId);
  const assignmentRows = assignments.data?.rows ?? [];

  const branches = teacherBranchIds(assignmentRows);
  const branchId = branches[0] ?? null;

  const timetableWindow = React.useMemo(() => forwardWindow(TIMETABLE_WINDOW_DAYS), []);
  const timetable = useTeacherTimetable(teacherId, branchId, timetableWindow);

  const person = record.data ? personOf('teachers', record.data) : null;
  const identity = person?.status === 'present' ? (person.person as IdentifiablePerson) : null;
  const authorPersonId = identity?.id ?? null;
  const stream = useAuthoredStream(authorPersonId);

  const subjectIndex = useSubjectIndex(assignmentRows.length > 0);
  const offeringIndex = useOfferingIndex(assignmentRows.length > 0);

  const classRoles = assignmentRows.filter((row) => !row.subject_offering_id);
  const subjectRoles = assignmentRows.filter((row) => row.subject_offering_id);

  const sectionOfId = new Map<string, SectionRow>();
  for (const row of assignmentRows) {
    const section = row.edges?.section;
    if (section?.id) sectionOfId.set(section.id, section);
  }

  const nameOffering = (offeringId: string | undefined): string | null => {
    if (!offeringId) return null;
    const offering = offeringIndex.get(offeringId);
    const fromIndex = subjectIndex.nameOf(offering?.subject_id);
    if (fromIndex) return fromIndex;
    const nested = assignmentRows.find(
      (row) => row.edges?.subject_offering?.id === offeringId,
    )?.edges?.subject_offering;
    return subjectIndex.nameOf(nested?.subject_id);
  };

  const authored = (stream.data?.rows ?? []).filter(
    (row) => row.author_person_id === authorPersonId,
  );

  if (record.isError && record.error.status !== 403) {
    return <UnreachableTeacher error={record.error} personaSlug={personaSlug} />;
  }

  const name = person?.status === 'present' ? nameOf(person.person) : null;
  const staff = record.data?.edges?.staff;
  const teacherCode = record.data
    ? codeOf(record.data, ['teacher_code', 'specialization'])
    : null;

  const casVisibility = readVisibility(personFields, 'cas_user_id', identity?.cas_user_id);
  const identifierCandidates: (IdentifierEntry | null)[] = [
    { label: 'Teacher id', value: teacherId },
    record.data?.staff_id ? { label: 'Staff id', value: record.data.staff_id } : null,
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

  const byDate = new Map<string, TimetableOccurrence[]>();
  for (const occurrence of timetable.data?.occurrences ?? []) {
    const key = occurrence.date ?? 'unknown';
    byDate.set(key, [...(byDate.get(key) ?? []), occurrence]);
  }
  const days = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <Stack spacing={3}>
      <PersonHeader
        name={name}
        subtitle={teacherCode}
        chips={record.data?.status ? [record.data.status] : []}
        isPending={record.isPending}
      />

      <Panel
        title="Details"
        note="The school's own record for this teacher."
        isPending={record.isPending || capabilities.isPending}
        error={record.isError ? record.error : ((capabilities.error as ApiError | null) ?? null)}
        denied="Your school has not granted anyone permission to read teacher records, so this teacher's own details cannot be shown. What they teach is listed below."
      >
        {record.data ? (
          <Stack spacing={3}>
            <RecordFields
              capability={teacherFields}
              row={record.data as unknown as Record<string, unknown>}
              intact={fieldsIntact(record.data)}
              unnamed="The catalogue does not name the columns on a teacher record, so nothing can be listed by field. The record itself was returned."
              denied="You do not have permission to read the details of a teacher record."
            />
            {staffFields && staff ? (
              <div>
                <Typography variant="h4" component="h3" sx={{ mb: 1.5 }}>
                  Employment
                </Typography>
                <RecordFields
                  capability={staffFields}
                  row={staff as unknown as Record<string, unknown>}
                  intact={fieldsIntact(staff)}
                  unnamed="The catalogue does not name the columns on a staff record."
                  denied="You do not have permission to read staff records."
                />
              </div>
            ) : null}
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
                    : 'No person record is attached to this teacher.'}
                </Typography>
              )}
            </div>
          </Stack>
        ) : null}
      </Panel>

      <Panel
        title="Identifiers"
        note="What to quote when asking someone to look this teacher up."
        denied="No identifiers are readable here."
      >
        <>
          <IdentifierList entries={identifiers} />
          {!identity && !record.isPending ? (
            <PanelNote>
              The person behind this teacher is not readable by you, so only the
              teacher record id is listed.
            </PanelNote>
          ) : null}
        </>
      </Panel>

      <Panel
        title="Experience"
        note="Credentials and service, as the school records them."
        isPending={record.isPending}
        error={record.isError ? record.error : null}
        denied="Teacher records are not readable here, so experience and credentials cannot be shown."
      >
        <TeacherExperience
          teacher={record.data}
          staff={staff}
          teacherFields={teacherFields}
          staffFields={staffFields}
        />
      </Panel>

      <Grid cols={2}>
        <Panel
          title="Class teacher of"
          note="Sections this teacher is responsible for, rather than a subject they teach in."
          isPending={assignments.isPending}
          error={assignments.error}
          isEmpty={classRoles.length === 0}
          empty="This teacher is not the class teacher of any section you may see."
          denied="You do not have permission to read teacher assignments."
          onRetry={() => void assignments.refetch()}
        >
          <PanelList>
            {classRoles.map((row) => (
              <Box component="li" key={row.id}>
                <Row
                  title={sectionTitle(row.edges?.section)}
                  subtitle={joinFacts([
                    row.role_type,
                    row.is_primary ? 'primary' : null,
                    validityLine(row.valid_from, row.valid_to),
                  ])}
                  trailing={row.status ? <EmergeChip label={row.status} /> : undefined}
                />
              </Box>
            ))}
          </PanelList>
        </Panel>

        <Panel
          title="Subjects taught"
          note="One row per subject, section and session."
          isPending={assignments.isPending}
          error={assignments.error}
          isEmpty={subjectRoles.length === 0}
          empty="This teacher teaches no subject you may see."
          denied="You do not have permission to read teacher assignments."
          onRetry={() => void assignments.refetch()}
        >
          <>
            <PanelList>
              {subjectRoles.map((row) => {
                const offering = offeringIndex.get(row.subject_offering_id) ??
                  row.edges?.subject_offering;
                return (
                  <Box component="li" key={row.id}>
                    <Row
                      title={
                        nameOffering(row.subject_offering_id) ?? 'Subject not named to you'
                      }
                      subtitle={joinFacts([
                        sectionTitle(row.edges?.section),
                        offering?.periods_per_week
                          ? `${offering.periods_per_week} periods a week`
                          : null,
                        row.role_type,
                      ])}
                      trailing={row.status ? <EmergeChip label={row.status} /> : undefined}
                    />
                  </Box>
                );
              })}
            </PanelList>
            {!subjectIndex.readable && subjectRoles.length > 0 ? (
              <PanelNote>
                You may see which offerings this teacher holds but not the subject
                catalogue, so they cannot be named here.
              </PanelNote>
            ) : null}
            {offeringIndex.partial ? (
              <PanelNote>
                The school holds more subject offerings than were read here, so a few
                rows may fall back to less detail.
              </PanelNote>
            ) : null}
          </>
        </Panel>
      </Grid>

      <Panel
        title="Timetable"
        note={`The next ${TIMETABLE_WINDOW_DAYS} days. A cancelled lesson is listed with its state rather than left out.`}
        blocked={
          !branchId && !assignments.isPending
            ? 'A timetable is resolved per campus, and no campus could be established for this teacher from what you may see. Nothing is listed rather than widening the question to the whole school.'
            : undefined
        }
        isPending={assignments.isPending || timetable.isPending}
        error={timetable.error}
        isEmpty={days.length === 0}
        empty="No lessons fall in this window."
        denied="You do not have permission to read the timetable."
        onRetry={() => void timetable.refetch()}
      >
        <>
          <Stack spacing={2}>
            {days.map(([date, occurrences]) => (
              <div key={date}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {formatLongDate(date)}
                </Typography>
                <PanelList>
                  {[...occurrences]
                    .sort((a, b) => (a.period_sequence ?? 0) - (b.period_sequence ?? 0))
                    .map((occurrence) => (
                      <Box component="li" key={occurrence.id}>
                        <Row
                          title={
                            nameOffering(occurrence.subject_offering_id) ??
                            occurrence.label ??
                            occurrence.period_name ??
                            'Lesson'
                          }
                          subtitle={joinFacts([
                            sectionTitle(
                              occurrence.section_id
                                ? sectionOfId.get(occurrence.section_id)
                                : undefined,
                            ),
                            occurrence.period_code ?? occurrence.period_name,
                            timeRange(occurrence),
                            occurrence.reason,
                          ])}
                          trailing={
                            occurrence.state ? (
                              <EmergeChip label={occurrence.state} />
                            ) : undefined
                          }
                        />
                      </Box>
                    ))}
                </PanelList>
              </div>
            ))}
          </Stack>
          {branches.length > 1 ? (
            <PanelNote>
              This teacher is assigned at more than one campus. Only the first is
              resolved here, because a timetable is asked for one campus at a time.
            </PanelNote>
          ) : null}
        </>
      </Panel>

      <FreeTimeFinder
        teacherId={teacherId}
        branchId={branchId}
        branchPending={assignments.isPending}
        nameOffering={nameOffering}
      />

      <Panel
        title="Posts"
        note="Stream posts this teacher wrote, as far as your own reach shows them."
        blocked={
          !authorPersonId && !record.isPending
            ? 'The person who authors as this teacher is not shown to you, so nothing can be attributed to them. Nothing is listed rather than showing the whole stream.'
            : undefined
        }
        isPending={record.isPending || stream.isPending}
        error={stream.error}
        isEmpty={authored.length === 0}
        empty="Nothing this teacher wrote appears in the stream you can see."
        denied="You do not have permission to read the stream."
        unavailable="The stream is not served by your school's system yet."
        onRetry={() => void stream.refetch()}
      >
        <>
          <PanelList>
            {authored.map((row) => (
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
          <PanelNote>
            The stream cannot be asked for one author, so this is the stream you may
            read, narrowed to posts written by this teacher. Posts outside your own
            reach are not counted.
          </PanelNote>
        </>
      </Panel>
    </Stack>
  );
}

function UnreachableTeacher({
  error,
  personaSlug,
}: {
  error: ApiError;
  personaSlug: string;
}): React.ReactElement {
  const back = (
    <Button component={NextLink} href={paths.personaSection(personaSlug, 'people/teachers')}>
      Back to the list
    </Button>
  );

  if (error.status === 404) {
    return (
      <EmptyState
        title="This teacher is not one you may see"
        body="The school either holds no such record or it is outside what you may reach. Both answer the same way on purpose, so a link cannot be used to find out which."
        action={back}
      />
    );
  }

  if (error.status === 400) {
    return (
      <EmptyState
        title="That link does not name a teacher"
        body="The address is not a record identifier this school would recognise."
        action={back}
      />
    );
  }

  return (
    <Alert severity="warning" variant="outlined" action={back}>
      This teacher could not be loaded.
    </Alert>
  );
}

function sectionTitle(section: SectionRow | undefined): string {
  if (!section) return 'Class not shown to you';
  const grade = section.edges?.grade_level?.name;
  if (grade) return joinFacts([grade, section.name ?? section.code]) ?? grade;
  return section.code ?? section.name ?? 'Class';
}

function validityLine(from: string | undefined, to: string | undefined): string | null {
  const start = formatDateOnly(from);
  const end = formatDateOnly(to);
  if (start && end) return `${start} to ${end}`;
  if (start) return `from ${start}`;
  return end ? `until ${end}` : null;
}

function timeRange(occurrence: TimetableOccurrence): string | null {
  if (occurrence.times_resolved === false) return 'Times not resolved';
  const start = formatMinuteOfDay(occurrence.start_minute);
  const end = formatMinuteOfDay(occurrence.end_minute);
  if (start && end) return `${start} to ${end}`;
  return start ?? end;
}

function postTitle(row: StreamPostRow): string {
  if (row.title) return row.title;
  if (row.body) return row.body.split('\n')[0] ?? 'Post';
  return 'Post not shown to you';
}
