'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Segmented } from '@/components/ui/segmented';
import { useAudienceStaff, useAudienceStudents, useNoticeAudience } from '@/hooks/query/use-notices';
import { isStaffTarget, type AudienceType, type Delivery, type NoticeTarget } from '@/types/notices';

const PICKED = { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } } as const;

const STUDENT_WAYS = [
  { value: 'all', label: 'All students' },
  { value: 'grade', label: 'Classes' },
  { value: 'section', label: 'Sections' },
  { value: 'student', label: 'Named students' },
] as const;
type StudentWay = (typeof STUDENT_WAYS)[number]['value'];

export const DELIVERY_LABEL: Readonly<Record<Delivery, string>> = { students: 'Students only', students_parents: 'Students and parents', parents: 'Parents only' };

function Group({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Stack spacing={0.75}>
      <Typography variant="eyebrow" color="text.secondary">
        {title}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {children}
      </Stack>
    </Stack>
  );
}

// Building the pool an announcement goes to: any mix of students, classes, sections, staff groups and named people.
export function AudiencePicker({
  value,
  onChange,
  delivery,
  onDelivery,
}: {
  value: readonly NoticeTarget[];
  onChange: (next: (prev: NoticeTarget[]) => NoticeTarget[]) => void;
  delivery: Delivery;
  onDelivery: (next: Delivery) => void;
}): React.ReactElement {
  const audience = useNoticeAudience(true);
  const [side, setSide] = React.useState<'students' | 'staff'>('students');
  const [way, setWay] = React.useState<StudentWay>('grade');
  const [studentQuery, setStudentQuery] = React.useState('');
  const [staffQuery, setStaffQuery] = React.useState('');
  const students = useAudienceStudents(studentQuery);
  const staff = useAudienceStaff(staffQuery);

  if (audience.isPending) return <Skeleton variant="rounded" height={160} />;
  if (audience.isError) return <Typography color="error">{audience.error.message}</Typography>;
  const { classes, subjects, whole_school } = audience.data;

  const has = (type: AudienceType, id: string): boolean => value.some((t) => t.type === type && t.id === id);
  const toggle = (type: AudienceType, id: string, label: string): void =>
    onChange((prev) => (prev.some((t) => t.type === type && t.id === id) ? prev.filter((t) => !(t.type === type && t.id === id)) : [...prev, { type, id, label }]));
  const pick = (type: AudienceType, id: string, label: string, count?: number): React.ReactElement => (
    <Chip key={`${type}${id}`} size="small" variant="outlined" label={count === undefined ? label : `${label} · ${count}`} sx={has(type, id) ? PICKED : undefined} onClick={() => toggle(type, id, label)} aria-pressed={has(type, id)} />
  );
  const studentSide = value.some((t) => !isStaffTarget(t.type));
  const sections = classes.flatMap((c) => c.sections.map((s) => ({ id: s.id, label: `${c.name.replace('Class ', '')}${s.name}` })));

  return (
    <Stack spacing={2}>
      <Box sx={(theme) => ({ border: `1px dashed ${theme.brand.line2}`, borderRadius: `${theme.band.radius.sm}px`, p: 1.5, minHeight: 52 })}>
        {value.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nobody yet. Add students, staff, or both, from below.
          </Typography>
        ) : (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            {value.map((t) => (
              <Chip key={`${t.type}${t.id}`} label={t.label} color={isStaffTarget(t.type) ? 'secondary' : 'primary'} variant="outlined" onDelete={() => toggle(t.type, t.id, t.label)} />
            ))}
          </Stack>
        )}
      </Box>

      <Segmented
        ariaLabel="Add from"
        value={side}
        onChange={setSide}
        options={[
          { value: 'students', label: 'Students & families' },
          { value: 'staff', label: 'Staff' },
        ]}
      />

      {side === 'students' ? (
        <Stack spacing={1.5}>
          <Segmented ariaLabel="Add students by" value={way} onChange={setWay} options={STUDENT_WAYS.filter((w) => w.value !== 'all' || whole_school)} />
          {way === 'all' ? <Stack direction="row">{pick('school', 'school', 'All students', classes.reduce((t, c) => t + c.students, 0))}</Stack> : null}
          {way === 'grade' ? <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>{classes.map((c) => pick('grade', c.id, c.name, c.students))}</Stack> : null}
          {way === 'section' ? (
            <Stack spacing={1} sx={{ maxHeight: 240, overflowY: 'auto', pr: 1 }}>
              {classes.map((c) => (
                <Stack key={c.id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ width: 72, flexShrink: 0 }}>
                    {c.name}
                  </Typography>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {c.sections.map((s) => (
                      <Chip
                        key={s.id}
                        size="small"
                        variant="outlined"
                        label={s.name}
                        sx={has('section', s.id) ? PICKED : undefined}
                        onClick={() => toggle('section', s.id, `${c.name.replace('Class ', '')}${s.name}`)}
                        aria-label={`${c.name} section ${s.name}`}
                        aria-pressed={has('section', s.id)}
                      />
                    ))}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          ) : null}
          {way === 'student' ? (
            <Autocomplete
              options={students.data ?? []}
              value={null}
              blurOnSelect
              loading={students.isFetching}
              filterOptions={(x) => x.filter((s) => !has('student', s.id))}
              inputValue={studentQuery}
              onInputChange={(_, next, reason) => setStudentQuery(reason === 'reset' ? '' : next)}
              onChange={(_, s) => s && toggle('student', s.id, s.name)}
              getOptionLabel={(s) => s.name}
              noOptionsText={studentQuery.trim().length < 2 ? 'Type two letters of a name' : 'Nobody by that name'}
              renderOption={({ key, ...props }, s) => (
                <li key={key} {...props}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', width: 1 }}>
                    <Typography variant="body2">{s.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {s.section}
                    </Typography>
                  </Stack>
                </li>
              )}
              renderInput={(params) => <TextField {...params} size="small" label="Add a student" placeholder="Search by name" />}
            />
          ) : null}
        </Stack>
      ) : (
        <Stack spacing={1.75}>
          {whole_school ? (
            <Group title="Everyone on the staff">
              {pick('staff_all', 'all', 'All staff', audience.data.staff)}
              {pick('teachers_all', 'all', 'All teachers', audience.data.teachers)}
              {pick('class_teachers', 'all', 'All class teachers')}
            </Group>
          ) : null}
          <Group title="Teachers of a class">{classes.map((c) => pick('teachers_grade', c.id, `${c.name} teachers`))}</Group>
          {whole_school ? <Group title="Class teachers of a class">{classes.map((c) => pick('class_teachers', c.id, `${c.name} class teachers`))}</Group> : null}
          {subjects.length > 0 ? <Group title="Teachers of a subject">{subjects.map((s) => pick('teachers_subject', s.id, `${s.name} teachers`, s.teachers))}</Group> : null}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <Autocomplete
              options={sections}
              value={null}
              blurOnSelect
              onChange={(_, s) => s && toggle('teachers_section', s.id, `${s.label} teachers`)}
              getOptionLabel={(s) => s.label}
              renderInput={(params) => <TextField {...params} size="small" label="Teachers of a section" placeholder="8B" />}
            />
            <Autocomplete
              options={staff.data ?? []}
              value={null}
              blurOnSelect
              loading={staff.isFetching}
              filterOptions={(x) => x.filter((s) => !has('staff', s.id))}
              inputValue={staffQuery}
              onInputChange={(_, next, reason) => setStaffQuery(reason === 'reset' ? '' : next)}
              onChange={(_, s) => s && toggle('staff', s.id, s.name)}
              getOptionLabel={(s) => s.name}
              noOptionsText={staffQuery.trim().length < 2 ? 'Name, subject or duty' : 'Nobody matches'}
              renderOption={({ key, ...props }, s) => (
                <li key={key} {...props}>
                  <Stack>
                    <Typography variant="body2">{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.detail}
                    </Typography>
                  </Stack>
                </li>
              )}
              renderInput={(params) => <TextField {...params} size="small" label="Add a staff member" placeholder="Search" />}
            />
          </Box>
        </Stack>
      )}

      {studentSide ? (
        <Stack spacing={0.75}>
          <Typography variant="subtitle2">For students, send to</Typography>
          <Segmented ariaLabel="Who in each family receives it" value={delivery} onChange={onDelivery} options={(['students', 'students_parents', 'parents'] as const).map((d) => ({ value: d, label: DELIVERY_LABEL[d] }))} />
        </Stack>
      ) : null}
    </Stack>
  );
}
