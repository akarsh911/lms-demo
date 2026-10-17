'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { GraduationCap, UserPlus } from 'lucide-react';

import { useAdmission } from '@/hooks/mutation/use-admission';
import { useAdmissionGrants } from './grants';
import { StudentForm } from './student-form';
import { TeacherForm } from './teacher-form';

type AdmissionKind = 'student' | 'teacher';

export function AdmissionsBoard(): React.ReactElement {
  const grants = useAdmissionGrants();
  const admission = useAdmission();
  const [kind, setKind] = React.useState<AdmissionKind | null>(null);
  const [acknowledged, setAcknowledged] = React.useState(false);

  const locked = Boolean(admission.state.identity?.password) && !acknowledged;

  const open = (next: AdmissionKind): void => {
    admission.reset();
    setAcknowledged(false);
    setKind(next);
  };

  const close = (): void => {
    if (locked || admission.state.busy) return;
    setKind(null);
    admission.reset();
    setAcknowledged(false);
  };

  const mayAddStudent = grants.mayProvision && grants.mayCreateStudent;
  const mayAddTeacher =
    grants.mayProvision && grants.mayWriteStaff && grants.mayCreateTeacher;

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Adding somebody here creates a real sign-in for them. The password is shown once
        and never again, so do it when you can pass it on.
      </Typography>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button
          variant="outlined"
          startIcon={<GraduationCap size={16} />}
          onClick={() => open('student')}
          disabled={!mayAddStudent}
        >
          Add a student
        </Button>
        <Button
          variant="outlined"
          startIcon={<UserPlus size={16} />}
          onClick={() => open('teacher')}
          disabled={!mayAddTeacher}
        >
          Add a teacher
        </Button>
      </Stack>

      {grants.settled && !grants.mayProvision ? (
        <Alert severity="info" variant="outlined">
          This account holds no grant to create people, so nobody can be added here.
        </Alert>
      ) : null}

      {grants.settled && grants.mayProvision && !mayAddStudent ? (
        <Alert severity="info" variant="outlined">
          This account may create a person but not a pupil record, so a student cannot be
          added from here.
        </Alert>
      ) : null}

      {grants.settled && grants.mayProvision && !mayAddTeacher ? (
        <Alert severity="info" variant="outlined">
          A teacher needs a staff record and a teaching record as well as a person, and
          this account is missing a grant for one of them.
        </Alert>
      ) : null}

      <Alert severity="info" variant="outlined">
        The sign-in is created as YOU, against the identity service, using your own
        permission there. An account that may not create identities is refused by that
        service rather than by the school record.
      </Alert>

      <Dialog
        open={kind !== null}
        onClose={close}
        fullWidth
        maxWidth="sm"
      >
        {kind === 'student' ? (
          <StudentForm
            admission={admission}
            acknowledged={acknowledged}
            onAcknowledge={setAcknowledged}
            mayEnrol={grants.mayEnrol}
            onClose={close}
          />
        ) : null}
        {kind === 'teacher' ? (
          <TeacherForm
            admission={admission}
            acknowledged={acknowledged}
            onAcknowledge={setAcknowledged}
            onClose={close}
          />
        ) : null}
      </Dialog>
    </Stack>
  );
}
