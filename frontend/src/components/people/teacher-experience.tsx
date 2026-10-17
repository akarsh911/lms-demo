'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Metric } from '@/components/ui/metric';
import { Row } from '@/components/ui/row';
import { readVisibility } from '@/lib/core/fields';
import { joinFacts } from '@/lib/people/text';
import { tenureBetween } from '@/lib/people/tenure';
import { formatDateOnly } from '@/lib/people/window';
import type { Capability } from '@/types/core';
import type { Qualification } from '@/types/people-detail';
import type { StaffRow, TeacherRow } from '@/types/roster';

import { CopyableId } from './copy-id';
import { PanelList } from './panel';

const WITHHELD = 'Not shown to you';

interface Fact {
  label: string;
  value: string;
  withheld: boolean;
}

function factOf(
  capability: Capability | undefined,
  field: string,
  label: string,
  value: string | undefined,
): Fact | null {
  switch (readVisibility(capability, field, value)) {
    case 'shown':
      return { label, value: value!, withheld: false };
    case 'withheld':
      return { label, value: WITHHELD, withheld: true };
    case 'empty':
      return null;
  }
}

export function TeacherExperience({
  teacher,
  staff,
  teacherFields,
  staffFields,
}: {
  teacher: TeacherRow | undefined;
  staff: StaffRow | undefined;
  teacherFields: Capability | undefined;
  staffFields: Capability | undefined;
}): React.ReactElement {
  const tenure = tenureBetween(staff?.joining_date, staff?.leaving_date);
  const qualifications: readonly Qualification[] = teacher?.qualification_json ?? [];
  const qualificationsVisibility = readVisibility(
    teacherFields,
    'qualification_json',
    qualifications.length > 0 ? 'present' : undefined,
  );

  const facts = [
    factOf(staffFields, 'designation', 'role', staff?.designation),
    factOf(staffFields, 'employment_type', 'contract', staff?.employment_type),
    factOf(teacherFields, 'specialization', 'specialism', teacher?.specialization),
    tenure
      ? { label: tenure.ongoing ? 'tenure' : 'served', value: tenure.label, withheld: false }
      : factOf(staffFields, 'joining_date', 'tenure', undefined),
  ].filter((fact): fact is Fact => fact !== null);

  const departmentId =
    readVisibility(staffFields, 'department_id', staff?.department_id) === 'shown'
      ? staff?.department_id
      : undefined;

  const nothingReadable =
    facts.length === 0 &&
    !staff?.joining_date &&
    !departmentId &&
    qualificationsVisibility !== 'shown';

  return (
    <Stack spacing={2}>
      {staff?.leaving_date ? (
        <Alert severity="info" variant="outlined">
          This teacher left the school on {formatDateOnly(staff.leaving_date)}. What
          follows is their record as it stands, not a current assignment.
        </Alert>
      ) : null}

      {facts.length > 0 ? (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {facts.map((fact) => (
            <Metric
              key={fact.label}
              label={fact.label}
              value={fact.value}
              tone={fact.withheld ? 'bad' : undefined}
            />
          ))}
        </Stack>
      ) : null}

      {staff?.joining_date ? (
        <Typography variant="body2" color="text.secondary">
          Joined {formatDateOnly(staff.joining_date)}
          {staff.leaving_date ? `, left ${formatDateOnly(staff.leaving_date)}` : ''}.
        </Typography>
      ) : null}

      {departmentId ? (
        <div>
          <CopyableId label="Department id" value={departmentId} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            This school&apos;s API serves no department names, so the identifier is all
            there is to show.
          </Typography>
        </div>
      ) : null}

      <div>
        <Typography variant="h4" component="h3" sx={{ mb: 1 }}>
          Qualifications
        </Typography>
        {qualificationsVisibility === 'withheld' ? (
          <Typography variant="body2" color="text.secondary">
            Qualifications are not a column you may read on this record.
          </Typography>
        ) : qualifications.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No qualifications are recorded for this teacher.
          </Typography>
        ) : (
          <PanelList>
            {qualifications.map((qualification, index) => (
              <Box component="li" key={`${qualification.degree ?? 'q'}-${index}`}>
                <Row
                  title={qualification.degree ?? qualification.field ?? 'Qualification'}
                  subtitle={joinFacts([
                    qualification.institution,
                    qualification.degree ? qualification.field : null,
                    qualification.year ? String(qualification.year) : null,
                    qualification.grade_or_cgpa,
                  ])}
                />
              </Box>
            ))}
          </PanelList>
        )}
      </div>

      {nothingReadable ? (
        <Typography variant="body2" color="text.secondary">
          Nothing about this teacher&apos;s experience is readable by you.
        </Typography>
      ) : null}
    </Stack>
  );
}
