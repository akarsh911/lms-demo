'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useIdentity } from '@/hooks/query/use-identity';
import { useMdmBranches } from '@/hooks/query/use-mdm';
import { isIsoDate, todayInSchool } from '@/lib/classroom/week';
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
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  RECORD_STATUSES,
  RECORD_STATUS_LABELS,
} from './options';
import type { useAdmission } from '@/hooks/mutation/use-admission';
import type { Qualification } from '@/types/people-detail';
import type { EmploymentType, StaffStatus, TeacherStatus } from '@/types/people-write';

export function TeacherForm({
  admission,
  acknowledged,
  onAcknowledge,
  onClose,
}: {
  admission: ReturnType<typeof useAdmission>;
  acknowledged: boolean;
  onAcknowledge: (next: boolean) => void;
  onClose: () => void;
}): React.ReactElement {
  const identity = useIdentity();
  const branches = useMdmBranches();
  const branchRows = branches.data?.rows ?? [];
  const today = todayInSchool(identity.data?.school?.timezone);

  const [person, setPerson] = React.useState<IdentityDraft>(EMPTY_IDENTITY);
  const [employeeCode, setEmployeeCode] = React.useState('');
  const [designation, setDesignation] = React.useState('');
  const [employmentType, setEmploymentType] = React.useState<EmploymentType>('full_time');
  const [chosenDate, setChosenDate] = React.useState<string | null>(null);
  const [chosenBranch, setChosenBranch] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState('active');
  const [teacherCode, setTeacherCode] = React.useState('');
  const [specialization, setSpecialization] = React.useState('');
  const [degree, setDegree] = React.useState('');
  const [institution, setInstitution] = React.useState('');
  const [year, setYear] = React.useState('');
  const [editing, setEditing] = React.useState(false);

  const joiningDate = chosenDate ?? today;
  const branchId =
    chosenBranch === null ? (branchRows.length === 1 ? branchRows[0]!.id : '') : chosenBranch;

  const dateUsable = joiningDate === '' || isIsoDate(joiningDate);
  const yearUsable = year === '' || /^\d{4}$/.test(year);
  const canSubmit =
    identityUsable(person) && employeeCode.trim() !== '' && dateUsable && yearUsable;

  const qualifications = (): Qualification[] | undefined => {
    if (degree.trim() === '' && institution.trim() === '') return undefined;
    const entry: Qualification = {};
    if (degree.trim() !== '') entry.degree = degree.trim();
    if (institution.trim() !== '') entry.institution = institution.trim();
    if (yearUsable && year !== '') entry.year = Number(year);
    return [entry];
  };

  const submit = (): void => {
    if (!canSubmit) return;
    setEditing(false);
    void admission.admitTeacher({
      person: provisionRequestOf(person, ADMISSION_GROUP_KEYS.teacher),
      staff: {
        employee_code: employeeCode.trim(),
        employment_type: employmentType,
        status: status as StaffStatus,
        ...(designation.trim() !== '' ? { designation: designation.trim() } : {}),
        ...(isIsoDate(joiningDate) ? { joining_date: joiningDate } : {}),
        ...(branchId !== '' ? { branch_id: branchId } : {}),
      },
      teacher: {
        status: status as TeacherStatus,
        ...(teacherCode.trim() !== '' ? { teacher_code: teacherCode.trim() } : {}),
        ...(specialization.trim() !== ''
          ? { specialization: specialization.trim() }
          : {}),
        ...(qualifications() ? { qualification_json: qualifications() } : {}),
      },
    });
  };

  return (
    <AdmissionShell
      title="Add a teacher"
      subtitle="Three records are created in order: a sign-in identity, a staff record, then the teaching record that hangs off it. They are not one transaction, so each is reported on its own."
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
          Their staff record
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Employee code"
            size="small"
            value={employeeCode}
            onChange={(event) => setEmployeeCode(event.target.value)}
            disabled={admission.state.busy}
            required
            fullWidth
            helperText="Required, and it must be one no other member of staff holds."
          />
          <TextField
            label="Designation"
            size="small"
            value={designation}
            onChange={(event) => setDesignation(event.target.value)}
            disabled={admission.state.busy}
            fullWidth
            helperText="Optional. What the school calls the post."
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            label="Employment"
            size="small"
            value={employmentType}
            onChange={(event) => setEmploymentType(event.target.value as EmploymentType)}
            disabled={admission.state.busy}
            fullWidth
          >
            {EMPLOYMENT_TYPES.map((option) => (
              <MenuItem key={option} value={option}>
                {EMPLOYMENT_TYPE_LABELS[option] ?? option}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Joined on"
            size="small"
            type="date"
            value={joiningDate}
            onChange={(event) => setChosenDate(event.target.value)}
            disabled={admission.state.busy}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            error={!dateUsable}
            helperText={dateUsable ? 'Optional.' : 'This has to be a calendar date.'}
          />
        </Stack>

        {branchRows.length > 1 ? (
          <TextField
            select
            label="Branch"
            size="small"
            value={branchId}
            onChange={(event) => setChosenBranch(event.target.value)}
            disabled={admission.state.busy}
            helperText="Which branch they are posted to."
          >
            <MenuItem value="">Not set</MenuItem>
            {branchRows.map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                {branch.name ?? branch.code ?? branch.id}
              </MenuItem>
            ))}
          </TextField>
        ) : null}

        <Divider />

        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          What they teach
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Teacher code"
            size="small"
            value={teacherCode}
            onChange={(event) => setTeacherCode(event.target.value)}
            disabled={admission.state.busy}
            fullWidth
            helperText="Optional."
          />
          <TextField
            label="Specialisation"
            size="small"
            value={specialization}
            onChange={(event) => setSpecialization(event.target.value)}
            disabled={admission.state.busy}
            fullWidth
            helperText="Optional. The subject they are mainly for."
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Highest qualification"
            size="small"
            value={degree}
            onChange={(event) => setDegree(event.target.value)}
            disabled={admission.state.busy}
            fullWidth
            helperText="Optional. More can be added on their own record afterwards."
          />
          <TextField
            label="Institution"
            size="small"
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            disabled={admission.state.busy}
            fullWidth
            helperText="Optional."
          />
          <TextField
            label="Year"
            size="small"
            value={year}
            onChange={(event) => setYear(event.target.value)}
            disabled={admission.state.busy}
            fullWidth
            inputMode="numeric"
            error={!yearUsable}
            helperText={yearUsable ? 'Optional.' : 'Four digits.'}
          />
        </Stack>

        <TextField
          select
          label="Status"
          size="small"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          disabled={admission.state.busy}
          helperText="Applied to the staff record and the teaching record alike."
        >
          {RECORD_STATUSES.map((option) => (
            <MenuItem key={option} value={option}>
              {RECORD_STATUS_LABELS[option] ?? option}
            </MenuItem>
          ))}
        </TextField>

        <Alert severity="info" variant="outlined">
          A teacher cannot be given classes or subjects from here. Once they exist, that
          is done on the class roll and on the subject offering.
        </Alert>
      </Stack>
    </AdmissionShell>
  );
}
