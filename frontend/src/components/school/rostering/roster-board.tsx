'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { WidgetDegraded } from '@/components/widgets/widget-states';
import { useIdentity } from '@/hooks/query/use-identity';
import { useMdmSections } from '@/hooks/query/use-mdm';
import { useSectionEnrolments, useSectionRollNames } from '@/hooks/query/use-rostering';
import { todayInSchool } from '@/lib/classroom/week';
import { mergeRoll } from '@/lib/classroom/roll';
import { withheldOnPage } from '@/lib/core/roster';
import { emptyListMessage, partialListMessage } from '@/lib/school/reach';
import { sectionLabel, studentNames } from '@/lib/school/names';
import { MdmBoard } from '../mdm/mdm-board';
import { MdmDialog } from '../mdm/mdm-dialog';
import { SchoolScopeBar, useSchoolScope } from '../school-scope';
import { useUrlState } from '../url-state';
import { EnrolmentForm } from './enrolment-dialog';
import { useRosteringGrants } from './grants';
import { ENROLMENT_STATUS_LABELS, PROMOTION_STATUS_LABELS } from './options';
import type { EnrollmentRow } from '@/types/academic';

export function RosterBoard(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();
  const grants = useRosteringGrants();
  const identity = useIdentity();

  const sections = useMdmSections(scope.branchId, scope.sessionId);
  const sectionRows = React.useMemo(() => sections.data?.rows ?? [], [sections.data]);
  const chosen = get('section');
  const sectionId =
    sectionRows.find((row) => row.id === chosen)?.id ?? sectionRows[0]?.id ?? null;
  const section = sectionRows.find((row) => row.id === sectionId);

  const enrolments = useSectionEnrolments(sectionId);
  const names = useSectionRollNames(sectionId);

  const [editing, setEditing] = React.useState<EnrollmentRow | 'new' | null>(null);

  const roll = React.useMemo(
    () => mergeRoll(names.data?.rows ?? [], enrolments.data?.rows ?? []),
    [names.data, enrolments.data],
  );
  const pupils = React.useMemo(
    () => studentNames(names.data?.rows ?? []),
    [names.data],
  );
  const withheld = enrolments.data
    ? withheldOnPage(enrolments.data.count, enrolments.data.rows.length)
    : 0;

  const partial = partialListMessage(
    grants.enrolmentReach,
    roll.length,
    'This account reaches only part of the school, so this roll is what it may see of the class rather than the whole of it.',
  );

  const emptyMessage = emptyListMessage(grants.enrolmentReach, {
    school_wide: 'Nobody is enrolled in this class for the current year.',
    narrowed:
      'No enrolment in this class is one this account may see. That is a reach, not a count: the class may well be full. An account that reaches every class shows the real roll.',
    unknown: 'No enrolment in this class came back, and what this account reaches is not known yet.',
    denied:
      'This account holds no grant to read enrolments, so the roll of this class cannot be shown here.',
  });

  const addDisabled = !sectionId || !scope.sessionId || !grants.mayWriteEnrolment;

  return (
    <>
      <MdmBoard
        summary={
          section
            ? `${roll.length} on the roll of ${sectionLabel(section)}`
            : `${roll.length} on the roll`
        }
        addLabel="Enrol a pupil"
        onAdd={() => setEditing('new')}
        addDisabled={addDisabled}
        isPending={enrolments.isPending && Boolean(sectionId)}
        error={enrolments.error}
        onRetry={() => void enrolments.refetch()}
        isEmpty={roll.length === 0}
        emptyMessage={emptyMessage}
        controls={
          <Stack spacing={1.5}>
            <SchoolScopeBar scope={scope} showScheme={false} />
            {sectionRows.length > 0 ? (
              <TextField
                select
                size="small"
                label="Class"
                value={sectionId ?? ''}
                onChange={(event) => put({ section: event.target.value })}
                sx={{ minWidth: 240 }}
              >
                {sectionRows.map((row) => (
                  <MenuItem key={row.id} value={row.id}>
                    {sectionLabel(row)}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}
          </Stack>
        }
        notice={
          <Stack spacing={1.5}>
            {sectionRows.length === 0 && !sections.isPending && scope.branchId ? (
              <Alert severity="info" variant="outlined">
                This branch has no classes for the current year, so there is no roll to
                keep yet.
              </Alert>
            ) : null}
            {names.isError ? (
              <WidgetDegraded
                error={names.error}
                denied="This account cannot read pupil records, so this roll is built from the enrolments alone and carries no names."
                unavailable="Pupil records could not be loaded, so this roll is built from the enrolments alone and carries no names."
              />
            ) : null}
            {partial ? (
              <Alert severity="info" variant="outlined">
                {partial}
              </Alert>
            ) : null}
            {withheld > 0 ? (
              <Alert severity="info" variant="outlined">
                {withheld === 1
                  ? 'One more enrolment in this class was returned with its fields withheld and is not listed.'
                  : `${withheld} more enrolments in this class were returned with their fields withheld and are not listed.`}
              </Alert>
            ) : null}
            {!grants.mayWriteEnrolment && grants.settled ? (
              <Alert severity="info" variant="outlined">
                This account holds no grant to write enrolments, so pupils can be read
                here but not enrolled, moved or withdrawn.
              </Alert>
            ) : null}
          </Stack>
        }
      >
        <TableHead>
          <TableRow>
            <TableCell>Roll</TableCell>
            <TableCell>Pupil</TableCell>
            <TableCell>Enrolment number</TableCell>
            <TableCell>Enrolled on</TableCell>
            <TableCell>Promotion</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {roll.map((entry) => {
            const studentId = entry.student?.id ?? entry.enrollment?.student_id;
            const name = studentId ? pupils.get(studentId) : undefined;
            const enrolment = entry.enrollment;
            return (
              <TableRow key={entry.key} hover>
                <TableCell>{enrolment?.roll_number ?? '—'}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {name ?? 'Name not shown to you'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entry.student?.admission_number ??
                      entry.student?.student_code ??
                      ''}
                  </Typography>
                </TableCell>
                <TableCell>{enrolment?.enrollment_number ?? '—'}</TableCell>
                <TableCell>{enrolment?.enrollment_date?.slice(0, 10) ?? '—'}</TableCell>
                <TableCell>
                  {enrolment?.promotion_status
                    ? (PROMOTION_STATUS_LABELS[enrolment.promotion_status] ??
                      enrolment.promotion_status)
                    : '—'}
                </TableCell>
                <TableCell>
                  {enrolment?.status ? (
                    <EmergeChip
                      label={
                        ENROLMENT_STATUS_LABELS[enrolment.status] ?? enrolment.status
                      }
                      tone={enrolment.status === 'active' ? 'green' : 'grey'}
                    />
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      No enrolment readable
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    disabled={!enrolment || !grants.mayWriteEnrolment}
                    onClick={() => enrolment && setEditing(enrolment)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </MdmBoard>

      <MdmDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        formKey={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        maxWidth="sm"
      >
        <EnrolmentForm
          enrolment={editing === 'new' ? undefined : (editing ?? undefined)}
          pupilName={
            editing !== null && editing !== 'new' && editing.student_id
              ? (pupils.get(editing.student_id) ?? null)
              : null
          }
          sectionId={sectionId}
          sessionId={scope.sessionId}
          sections={sectionRows}
          today={todayInSchool(identity.data?.school?.timezone)}
          mayDelete={grants.mayDeleteEnrolment}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}
