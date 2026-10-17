'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Minus, Pencil, Rocket } from 'lucide-react';

import { ClassesStructure } from '@/components/school/classes/classes-structure';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useActivateYear, useBringForward } from '@/hooks/mutation/use-foundation';
import { formatDay } from '@/lib/dates';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { CalendarPart, YearSetupArea } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

import { ModuleNote } from './module-note';
import { AREA_STATE, AreaStateChip, AreaStateIcon } from './setup-area-state';
import { YearShape } from './year-shape';
import { YearDialog } from './year-dialog';

function StepHeader({ area, action }: { area: YearSetupArea; action?: React.ReactNode }): React.ReactElement {
  return (
    <CardHeader
      title={
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <span>{area.title}</span>
          <AreaStateChip state={area.state} />
        </Stack>
      }
      subheader={area.summary}
      action={action}
    />
  );
}

// Step 1: the year's own record, then its calendar, using the same editors the year keeps once it is running.
export function BasicSetupStep({ area, year }: { area: YearSetupArea; year: AcademicSession }): React.ReactElement {
  const [editing, setEditing] = React.useState(false);
  const [part, setPart] = React.useState<CalendarPart>('working-days');

  return (
    <Stack spacing={2}>
      <Card>
        <StepHeader
          area={area}
          action={
            <Button variant="outlined" size="small" startIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
              Edit Basic Details
            </Button>
          }
        />
        <CardContent>
          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 3, m: 0 }}>
            <Field label="Academic year">{year.name ?? year.code}</Field>
            <Field label="Starts">{formatDay(year.start_date)}</Field>
            <Field label="Ends">{formatDay(year.end_date)}</Field>
          </Box>
        </CardContent>
      </Card>
      {/* Nothing here is staged across parts, so switching between them needs no guard. */}
      <YearShape year={year} part={part} onPart={setPart} onUnsavedChange={() => undefined} />
      {editing ? <YearDialog year={year} onClose={() => setEditing(false)} /> : null}
    </Stack>
  );
}

const BROUGHT = ['Class and section labels', 'The working week', 'Bell schedules and their slots'];
const NEVER = ['Students and their enrolments', 'Teaching assignments', 'Room assignments', 'The timetable', 'Attendance and marks'];

// Step 2: start the new year from the shape of another. Labels and calendar only; a pupil's history is never duplicated.
export function BringForwardStep({ area, year, years }: { area: YearSetupArea; year: AcademicSession; years: readonly AcademicSession[] }): React.ReactElement {
  const others = years.filter((other) => other.id !== year.id);
  const [fromId, setFromId] = React.useState(year.previous_session_id ?? others[0]?.id ?? '');
  const mutation = useBringForward();
  const notify = useToast();
  const from = others.find((other) => other.id === fromId);

  const column = (title: string, lines: readonly string[], brought: boolean): React.ReactElement => (
    <div>
      <Typography variant="eyebrow" component="p" color="text.secondary" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <List disablePadding dense>
        {lines.map((line) => (
          <ListItem key={line} disableGutters>
            <ListItemIcon sx={{ minWidth: 30, color: brought ? 'success.main' : 'text.disabled' }}>{brought ? <Check size={16} aria-hidden /> : <Minus size={16} aria-hidden />}</ListItemIcon>
            <ListItemText primary={line} />
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Card>
      <StepHeader area={area} />
      <CardContent>
        <Stack spacing={2.5}>
          {mutation.isError ? (
            <Alert severity="error" variant="outlined" role="alert">
              {mutation.error.message}
            </Alert>
          ) : null}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
            {column('Brought forward', BROUGHT, true)}
            {column('Never copied', NEVER, false)}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '72ch' }}>
            Anything this year already has is left as it is, so bringing forward a second time only fills what is missing.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
            <TextField select size="small" label="Start structure from" value={fromId} onChange={(event) => setFromId(event.target.value)} disabled={mutation.isPending} sx={{ minWidth: 240 }}>
              {others.map((other) => (
                <MenuItem key={other.id} value={other.id}>
                  {other.name ?? other.code}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              disabled={!from}
              loading={mutation.isPending}
              onClick={() => mutation.mutate({ fromId, toId: year.id }, { onSuccess: () => notify(`Structure brought forward from ${from?.name}`) })}
            >
              Bring forward
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

// Every other step until its module exists: where the area stands, what is in the way, and the page that exists today.
// Classes & Sections is built here, on this year, with the same cards the year and the sidebar show.
export function ClassesStep({ area, year, personaSlug }: { area: YearSetupArea; year: AcademicSession; personaSlug: string }): React.ReactElement {
  return (
    <Stack spacing={2}>
      <Card>
        <StepHeader area={area} />
        {area.facts.length > 0 ? (
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              {area.facts.join(' · ')}
            </Typography>
          </CardContent>
        ) : null}
      </Card>
      <ClassesStructure yearId={year.id} base={{ path: `school/years/${year.id}/classes` }} personaSlug={personaSlug} />
    </Stack>
  );
}

export function ReadinessStep({ area, personaSlug }: { area: YearSetupArea; personaSlug: string }): React.ReactElement {
  const record = area.route ? ROUTE_INDEX.get(area.route) : undefined;

  return (
    <Card>
      <StepHeader area={area} />
      <CardContent>
        <Stack spacing={2}>
          {area.state === 'blocked' && area.blocked_by ? (
            <Alert severity="info" variant="outlined">
              Blocked. Complete {area.blocked_by} first.
            </Alert>
          ) : null}
          {area.facts.length > 0 ? (
            <List disablePadding dense>
              {area.facts.map((fact) => (
                <ListItem key={fact} disableGutters>
                  <ListItemIcon sx={{ minWidth: 30, color: AREA_STATE[area.state].colour }}>
                    <AreaStateIcon state={area.state} size={16} />
                  </ListItemIcon>
                  <ListItemText primary={fact} />
                </ListItem>
              ))}
            </List>
          ) : null}
          {area.module ? (
            <ModuleNote
              module={area.module}
              does={`The detailed ${area.title.toLowerCase()} workspace`}
              // The page that exists today works on the year in force, which is the one being prepared from.
              href={record ? paths.personaSection(personaSlug, record.path) : null}
              linkLabel={`Open ${record?.node.title ?? ''}`}
            />
          ) : record ? (
            <div>
              <Button component={NextLink} href={paths.personaSection(personaSlug, record.path)} variant="outlined" size="small">
                Open {record.node.title}
              </Button>
            </div>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

// Step 12: everything on one page, and the one action that ends setup.
export function ReviewStep({
  area,
  areas,
  year,
  personaSlug,
  onOpen,
}: {
  area: YearSetupArea;
  areas: readonly YearSetupArea[];
  year: AcademicSession;
  personaSlug: string;
  onOpen: (key: YearSetupArea['key']) => void;
}): React.ReactElement {
  const router = useRouter();
  const mutation = useActivateYear();
  const notify = useToast();
  const [confirming, setConfirming] = React.useState(false);
  const rest = areas.filter((other) => other.key !== 'review');

  return (
    <Card>
      <StepHeader
        area={area}
        action={
          <Button variant="contained" startIcon={<Rocket size={16} />} disabled={Boolean(area.blocked_by)} onClick={() => setConfirming(true)}>
            Activate Year
          </Button>
        }
      />
      <CardContent>
        <Stack spacing={2}>
          {area.blocked_by ? (
            <Alert severity="info" variant="outlined">
              The year cannot be activated yet. Finish these first: {area.blocked_by}.
            </Alert>
          ) : (
            <Alert severity="success" variant="outlined">
              The year can be activated. Anything still open below can be finished while it runs.
            </Alert>
          )}
          <List disablePadding>
            {rest.map((other, index) => (
              <ListItem
                key={other.key}
                disableGutters
                divider={index < rest.length - 1}
                sx={{ gap: 1.5 }}
                secondaryAction={
                  <Button size="small" onClick={() => onOpen(other.key)}>
                    Open
                  </Button>
                }
              >
                <ListItemIcon sx={{ minWidth: 0, color: AREA_STATE[other.state].colour }}>
                  <AreaStateIcon state={other.state} />
                </ListItemIcon>
                <ListItemText primary={other.title} secondary={other.summary} slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'body2' } }} />
              </ListItem>
            ))}
          </List>
        </Stack>
      </CardContent>

      {confirming ? (
        <ConfirmDialog
          title={`Activate ${year.name}?`}
          body="This becomes the year the school is running in. The year running now is closed and kept as a read-only record."
          confirmLabel="Activate Year"
          tone="primary"
          pending={mutation.isPending}
          error={mutation.error}
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            mutation.mutate(year.id, {
              onSuccess: () => {
                notify(`${year.name} is now the active year`);
                router.push(paths.personaSection(personaSlug, `school/years/${year.id}`));
              },
            })
          }
        />
      ) : null}
    </Card>
  );
}
