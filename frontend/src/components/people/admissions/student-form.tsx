'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useIdentity } from '@/hooks/query/use-identity';
import { useMdmBranches, useMdmHouses, useMdmSections, useMdmSessions } from '@/hooks/query/use-mdm';
import { isIsoDate, todayInSchool } from '@/lib/classroom/week';
import { sectionLabel } from '@/lib/school/names';
import { AdmissionShell } from './admission-shell';
import {
  EMPTY_IDENTITY,
  IdentityFields,
  identityUsable,
  provisionRequestOf,
  type IdentityDraft,
} from './identity-fields';
import {
  ADMISSION_GROUP_KEYS,
  STUDENT_STATUSES,
  STUDENT_STATUS_LABELS,
} from './options';
import type { useAdmission } from '@/hooks/mutation/use-admission';
import type { StudentStatus } from '@/types/people-write';

export function StudentForm({
  admission,
  acknowledged,
  onAcknowledge,
  mayEnrol,
  onClose,
}: {
  admission: ReturnType<typeof useAdmission>;
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
  mayEnrol: boolean;
  onClose: () => void;
}): React.ReactElement {
  const identity = useIdentity();
  const houses = useMdmHouses();
  const branches = useMdmBranches();
  const sessions = useMdmSessions();
  const today = todayInSchool(identity.data?.school?.timezone);

  const houseRows = houses.data?.rows ?? [];
  const branchRows = branches.data?.rows ?? [];
  const sessionRows = sessions.data?.rows ?? [];
  const session = sessionRows.find((row) => row.is_current) ?? sessionRows[0];

  const [person, setPerson] = React.useState<IdentityDraft>(EMPTY_IDENTITY);
  const [admissionNumber, setAdmissionNumber] = React.useState('');
  const [studentCode, setStudentCode] = React.useState('');
  const [chosenDate, setChosenDate] = React.useState<string | null>(null);
  const [houseId, setHouseId] = React.useState('');
  const [status, setStatus] = React.useState<StudentStatus>('active');
  const [enrol, setEnrol] = React.useState(false);
  const [chosenBranch, setChosenBranch] = React.useState<string | null>(null);
  const [sectionId, setSectionId] = React.useState('');
  const [roll, setRoll] = React.useState('');
  const [editing, setEditing] = React.useState(false);

  const admissionDate = chosenDate ?? today;
  const branchId =
    chosenBranch === null ? (branchRows[0]?.id ?? '') : chosenBranch;

  const sections = useMdmSections(enrol ? branchId || null : null, session?.id ?? null);
  const sectionRows = sections.data?.rows ?? [];

  const dateUsable = admissionDate === '' || isIsoDate(admissionDate);
  const enrolReady = !enrol || (sectionId !== '' && Boolean(session));
  const canSubmit =
    identityUsable(person) && admissionNumber.trim() !== '' && dateUsable && enrolReady;

  const submit = (): void => {
    if (!canSubmit) return;
    setEditing(false);
    void admission.admitStudent({
      person: provisionRequestOf(person, ADMISSION_GROUP_KEYS.student),
      student: {
        admission_number: admissionNumber.trim(),
        status,
        ...(studentCode.trim() !== '' ? { student_code: studentCode.trim() } : {}),
        ...(isIsoDate(admissionDate) ? { admission_date: admissionDate } : {}),
        ...(houseId !== '' ? { house_id: houseId } : {}),
      },
      ...(enrol && session && sectionId !== ''
        ? {
            enrolment: {
              academic_session_id: session.id,
              section_id: sectionId,
              enrollment_date: isIsoDate(admissionDate) ? admissionDate : today,
              ...(roll.trim() !== '' ? { roll_number: roll.trim() } : {}),
            },
          }
        : {}),
    });
  };

  return (
    <AdmissionShell
      title="Add a student"
      subtitle="A sign-in identity is created first, then the pupil record against it, and a class enrolment last if you ask for one. They are not one transaction, so each is reported on its own."
      state={admission.state}
      username={person.username.trim()}
      editing={editing}
      onEdit={() => setEditing(true)}
      acknowledged={acknowledged}
      onAcknowledge={onAcknowledge}
      canSubmit={canSubmit}
      onSubmit={submit}
      onRetry={() => void admission.retry()}
      onClose={onClose}
    >
      <Stack spacing={2.5}>
        <IdentityFields
          value={person}
          onChange={setPerson}
          disabled={admission.state.busy || Boolean(admission.state.identity)}
        />

        <Divider />

        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Their pupil record
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Admission number"
            size="small"
            value={admissionNumber}
            onChange={(event) => setAdmissionNumber(event.target.value)}
            disabled={admission.state.busy}
            required
            fullWidth
            helperText="Required, and it must be one no other pupil holds."
          />
          <TextField
            label="Pupil code"
            size="small"
            value={studentCode}
            onChange={(event) => setStudentCode(event.target.value)}
            disabled={admission.state.busy}
            fullWidth
            helperText="Optional."
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Admitted on"
            size="small"
            type="date"
            value={admissionDate}
            onChange={(event) => setChosenDate(event.target.value)}
            disabled={admission.state.busy}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            error={!dateUsable}
            helperText={dateUsable ? 'Optional.' : 'This has to be a calendar date.'}
          />
          {houseRows.length > 0 ? (
            <TextField
              select
              label="House"
              size="small"
              value={houseId}
              onChange={(event) => setHouseId(event.target.value)}
              disabled={admission.state.busy}
              fullWidth
              helperText="Optional."
            >
              <MenuItem value="">Not set</MenuItem>
              {houseRows.map((house) => (
                <MenuItem key={house.id} value={house.id}>
                  {house.name ?? house.code ?? house.id}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
        </Stack>

        <TextField
          select
          label="Status"
          size="small"
          value={status}
          onChange={(event) => setStatus(event.target.value as StudentStatus)}
          disabled={admission.state.busy}
        >
          {STUDENT_STATUSES.map((option) => (
            <MenuItem key={option} value={option}>
              {STUDENT_STATUS_LABELS[option] ?? option}
            </MenuItem>
          ))}
        </TextField>

        <Divider />

        <FormControlLabel
          control={
            <Checkbox
              checked={enrol}
              onChange={(event) => setEnrol(event.target.checked)}
              disabled={admission.state.busy || !mayEnrol || !session}
            />
          }
          label="Put them in a class straight away"
        />

        {!mayEnrol ? (
          <Alert severity="info" variant="outlined">
            This account holds no grant to write enrolments, so the pupil can be created
            here but has to be put in a class by somebody who does.
          </Alert>
        ) : null}

        {mayEnrol && sessions.isError ? (
          <Alert severity="info" variant="outlined">
            The years on the school record could not be read, so nobody can be put in a
            class from here just now. Creating the pupil is unaffected.
          </Alert>
        ) : null}

        {mayEnrol && !session && !sessions.isPending && !sessions.isError ? (
          <Alert severity="info" variant="outlined">
            The school has no academic year on record, so there is nothing to enrol
            anyone into yet.
          </Alert>
        ) : null}

        {enrol ? (
          <Stack spacing={2}>
            {branchRows.length > 1 ? (
              <TextField
                select
                label="Branch"
                size="small"
                value={branchId}
                onChange={(event) => {
                  setChosenBranch(event.target.value);
                  setSectionId('');
                }}
                disabled={admission.state.busy}
              >
                {branchRows.map((branch) => (
                  <MenuItem key={branch.id} value={branch.id}>
                    {branch.name ?? branch.code ?? branch.id}
                  </MenuItem>
                ))}
              </TextField>
            ) : null}

            <TextField
              select
              label="Class"
              size="small"
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
              disabled={admission.state.busy || sectionRows.length === 0}
              required
              helperText={
                sections.isPending && branchId !== ''
                  ? 'Reading the classes for this branch.'
                  : sections.isError
                    ? 'The classes of this branch could not be read, so a class cannot be chosen here.'
                    : sectionRows.length === 0
                    ? 'This branch has no classes for the current year.'
                    : `They will be enrolled for ${session?.name ?? session?.code ?? 'the current year'}.`
              }
            >
              {sectionRows.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {sectionLabel(row)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Roll number"
              size="small"
              value={roll}
              onChange={(event) => setRoll(event.target.value)}
              disabled={admission.state.busy}
              helperText="Optional."
            />
          </Stack>
        ) : null}
      </Stack>
    </AdmissionShell>
  );
}
