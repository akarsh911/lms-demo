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
import { useMdmOfferings, useMdmSections } from '@/hooks/query/use-mdm';
import { useSectionTeaching } from '@/hooks/query/use-rostering';
import { useTeacherDirectory } from '@/hooks/query/use-school';
import { withheldOnPage } from '@/lib/core/roster';
import { emptyListMessage, partialListMessage } from '@/lib/school/reach';
import { offeringLabel, sectionLabel, teacherNames } from '@/lib/school/names';
import { MdmBoard } from '../mdm/mdm-board';
import { MdmDialog } from '../mdm/mdm-dialog';
import { SchoolScopeBar, useSchoolScope } from '../school-scope';
import { useUrlState } from '../url-state';
import { useRosteringGrants } from './grants';
import { TeachingForm } from './teaching-dialog';
import { TEACHING_ROLE_LABELS, TEACHING_STATUS_LABELS } from './options';
import type { TeacherAssignmentRow } from '@/types/academic';

export function TeachingBoard(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();
  const grants = useRosteringGrants();

  const sections = useMdmSections(scope.branchId, scope.sessionId);
  const sectionRows = React.useMemo(() => sections.data?.rows ?? [], [sections.data]);
  const chosen = get('section');
  const sectionId =
    sectionRows.find((row) => row.id === chosen)?.id ?? sectionRows[0]?.id ?? null;
  const section = sectionRows.find((row) => row.id === sectionId);

  const assignments = useSectionTeaching(sectionId);
  const offerings = useMdmOfferings(sectionId);
  const directory = useTeacherDirectory(Boolean(scope.branchId));

  const [editing, setEditing] = React.useState<TeacherAssignmentRow | 'new' | null>(null);

  const rows = React.useMemo(() => assignments.data?.rows ?? [], [assignments.data]);
  const offeringRows = React.useMemo(() => offerings.data?.rows ?? [], [offerings.data]);
  const offeringsById = React.useMemo(
    () => new Map(offeringRows.map((row) => [row.id, row])),
    [offeringRows],
  );
  const teachers = React.useMemo(
    () => teacherNames(directory.data?.rows ?? []),
    [directory.data],
  );
  const withheld = assignments.data
    ? withheldOnPage(assignments.data.count, assignments.data.rows.length)
    : 0;

  const partial = partialListMessage(
    grants.teachingReach,
    rows.length,
    'This account reaches only part of the school, so these are the assignments it may see rather than every one this class has.',
  );

  const emptyMessage = emptyListMessage(grants.teachingReach, {
    school_wide: 'Nobody is assigned to teach this class in the current year.',
    narrowed:
      'No assignment on this class is one this account may see. That is a reach, not a count: the class may well be fully staffed.',
    unknown:
      'No assignment on this class came back, and what this account reaches is not known yet.',
    denied:
      'This account holds no grant to read teaching assignments, so who teaches this class cannot be shown here.',
  });

  const blockedByReach = grants.mayWriteTeaching && grants.teachingWriteNarrowed;
  const addDisabled =
    !sectionId ||
    !scope.sessionId ||
    !grants.mayWriteTeaching ||
    blockedByReach ||
    teachers.size === 0;

  return (
    <>
      <MdmBoard
        summary={
          section
            ? `${rows.length} ${rows.length === 1 ? 'assignment' : 'assignments'} on ${sectionLabel(section)}`
            : `${rows.length} ${rows.length === 1 ? 'assignment' : 'assignments'}`
        }
        addLabel="Give a teacher this class"
        onAdd={() => setEditing('new')}
        addDisabled={addDisabled}
        isPending={assignments.isPending && Boolean(sectionId)}
        error={assignments.error}
        onRetry={() => void assignments.refetch()}
        isEmpty={rows.length === 0}
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
            {directory.isError ? (
              <WidgetDegraded
                error={directory.error}
                denied="This account cannot read the teacher directory, so an assignment already made cannot be named here and no new one can be started. Re-dating and revoking still work."
                unavailable="The teacher directory could not be loaded, so an assignment already made cannot be named here and no new one can be started. Re-dating and revoking still work."
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
                  ? 'One more assignment on this class was returned with its fields withheld and is not listed.'
                  : `${withheld} more assignments on this class were returned with their fields withheld and are not listed.`}
              </Alert>
            ) : null}
            {blockedByReach ? (
              <Alert severity="info" variant="outlined">
                Starting a new assignment needs a grant over the whole school. This
                account&apos;s grant to write teaching assignments covers only part of
                it, so the API refuses a new one. An assignment it already reaches can
                still be re-dated or revoked.
              </Alert>
            ) : null}
            {!grants.mayWriteTeaching && grants.settled ? (
              <Alert severity="info" variant="outlined">
                This account holds no grant to write teaching assignments, so who teaches
                this class can be read here but not changed.
              </Alert>
            ) : null}
          </Stack>
        }
      >
        <TableHead>
          <TableRow>
            <TableCell>Teacher</TableCell>
            <TableCell>Teaches</TableCell>
            <TableCell>Role</TableCell>
            <TableCell>Chiefly answerable</TableCell>
            <TableCell>From</TableCell>
            <TableCell>To</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {row.teacher_id
                    ? (teachers.get(row.teacher_id) ?? 'Named elsewhere')
                    : 'Not shown to you'}
                </Typography>
              </TableCell>
              <TableCell>
                {row.subject_offering_id
                  ? offeringLabel(
                      offeringsById.get(row.subject_offering_id) ??
                        row.edges?.subject_offering,
                    )
                  : 'The whole class'}
              </TableCell>
              <TableCell>
                {row.role_type
                  ? (TEACHING_ROLE_LABELS[row.role_type] ?? row.role_type)
                  : '—'}
              </TableCell>
              <TableCell>{row.is_primary ? 'Yes' : 'No'}</TableCell>
              <TableCell>{row.valid_from?.slice(0, 10) ?? '—'}</TableCell>
              <TableCell>{row.valid_to?.slice(0, 10) ?? '—'}</TableCell>
              <TableCell>
                <EmergeChip
                  label={
                    row.status
                      ? (TEACHING_STATUS_LABELS[row.status] ?? row.status)
                      : 'Teaching'
                  }
                  tone={(row.status ?? 'active') === 'active' ? 'green' : 'grey'}
                />
              </TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  disabled={!grants.mayWriteTeaching}
                  onClick={() => setEditing(row)}
                >
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </MdmBoard>

      <MdmDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        formKey={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        maxWidth="sm"
      >
        <TeachingForm
          assignment={editing === 'new' ? undefined : (editing ?? undefined)}
          teacherName={
            editing !== null && editing !== 'new' && editing.teacher_id
              ? (teachers.get(editing.teacher_id) ?? null)
              : null
          }
          sectionId={sectionId}
          sessionId={scope.sessionId}
          offerings={offeringRows}
          teachers={teachers}
          mayDelete={grants.mayDeleteTeaching}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>
    </>
  );
}
