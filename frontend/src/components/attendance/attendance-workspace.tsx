'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { useUrlState } from '@/components/school/url-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { Segmented } from '@/components/ui/segmented';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useRegisters } from '@/hooks/query/use-attendance-day';
import { useIdentity } from '@/hooks/query/use-identity';
import { useReach } from '@/hooks/query/use-reach';
import { isIsoDate, todayInSchool } from '@/lib/classroom/week';
import { leadsSection } from '@/lib/reach/reach';
import type { RegisterProgress } from '@/types/attendance';

import { AttendanceRegister } from './attendance-register';

const SHOW = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Not done' },
] as const;
type Show = (typeof SHOW)[number]['value'];

function RegisterRow({ r, selected, onPick }: { r: RegisterProgress; selected: boolean; onPick: () => void }): React.ReactElement {
  const done = r.total > 0 && r.marked >= r.total;
  const share = r.total === 0 ? 0 : r.marked / r.total;
  return (
    <ListItemButton selected={selected} onClick={onPick} sx={{ mx: 1, borderRadius: 2, gap: 1.5, py: 1 }}>
      <Typography variant="subtitle2" sx={{ width: 34 }}>
        {r.label}
      </Typography>
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={(theme) => ({ height: 5, borderRadius: 3, bgcolor: theme.brand.sunken, overflow: 'hidden' })}>
          <Box sx={(theme) => ({ width: `${share * 100}%`, height: 1, bgcolor: done ? theme.hues.green : theme.palette.primary.main })} />
        </Box>
        <Typography variant="caption" color="text.secondary" noWrap>
          {r.led ? 'Your class · ' : ''}
          {done ? 'Done' : r.marked === 0 ? 'Not taken' : `${r.marked} of ${r.total}`}
          {r.absent > 0 ? ` · ${r.absent} absent` : ''}
          {r.on_leave > 0 ? ` · ${r.on_leave} on leave` : ''}
        </Typography>
      </Stack>
    </ListItemButton>
  );
}

// Attendance across the school: every section's register for the day, and the chosen one open to mark.
export function AttendanceWorkspace(): React.ReactElement {
  const { get, put } = useUrlState();
  const identity = useIdentity();
  const today = todayInSchool(identity.data?.school?.timezone);
  const asked = get('day');
  const date = isIsoDate(asked) && asked <= today ? asked : today;
  const registers = useRegisters(date);
  const reach = useReach();
  const [show, setShow] = React.useState<Show>('all');

  if (registers.isPending || !reach) return <WidgetLoading rows={8} />;
  if (registers.isError) return <WidgetError error={registers.error} onRetry={() => void registers.refetch()} />;

  const all = registers.data;
  // The office takes every register; a teacher only the ones they are class teacher of.
  const mine = reach.kind === 'school' ? all : all.filter((r) => r.led);
  const pending = mine.filter((r) => r.marked < r.total);
  const chosen = all.find((r) => r.section_id === get('section')) ?? all[0];
  const listed = show === 'pending' ? pending : all;
  const classes = [...new Set(listed.map((r) => r.class_name))];

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          mine.length === 0
            ? { label: 'Registers', value: all.length, note: 'Each marked by its class teacher' }
            : { label: mine.length === all.length ? 'Registers done' : 'Your registers', value: `${mine.length - pending.length} / ${mine.length}`, note: pending.length > 0 ? `${pending.length} still to take` : 'All marked' },
          { label: 'Absent', value: all.reduce((t, r) => t + r.absent, 0), note: 'Across the marked registers' },
          { label: 'On leave', value: all.reduce((t, r) => t + r.on_leave, 0), note: 'Away with notice' },
          { label: 'Students', value: all.reduce((t, r) => t + r.total, 0).toLocaleString('en-IN'), note: `${all.length} sections` },
        ]}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '220px minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Card sx={{ position: { md: 'sticky' }, top: { md: 0 }, maxHeight: { xs: 300, md: 'calc(100vh - 140px)' }, display: 'flex', flexDirection: 'column' }}>
          <CardHeader title="Sections" subheader={date === today ? 'Today' : date} action={<Segmented<Show> ariaLabel="Which sections" value={show} onChange={setShow} options={SHOW} />} sx={{ '& .MuiCardHeader-action': { alignSelf: 'center' } }} />
          <List dense sx={{ overflowY: 'auto', py: 1 }}>
            {classes.map((c) => (
              <li key={c}>
                <ul style={{ padding: 0 }}>
                  <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'background.paper' }}>{c}</ListSubheader>
                  {listed
                    .filter((r) => r.class_name === c)
                    .map((r) => (
                      <RegisterRow key={r.section_id} r={r} selected={r.section_id === chosen?.section_id} onPick={() => put({ section: r.section_id })} />
                    ))}
                </ul>
              </li>
            ))}
            {listed.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 2 }}>
                Every register is done.
              </Typography>
            ) : null}
          </List>
        </Card>
        {chosen ? <AttendanceRegister sectionId={chosen.section_id} label={chosen.label} date={date} today={today} onDate={(next) => put({ day: next === today ? null : next })} editable={leadsSection(reach, chosen.section_id)} /> : null}
      </Box>
    </Stack>
  );
}
