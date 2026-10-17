'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useSetupAreas } from '@/hooks/query/use-foundation';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { dayRange } from '@/lib/dates';
import { yearLifecycle } from '@/lib/school/years';
import { paths } from '@/paths';
import { SETUP_AREAS, type SetupAreaKey } from '@/types/foundation';

import { AREA_STATE, AreaStateIcon } from './setup-area-state';
import { BasicSetupStep, BringForwardStep, ClassesStep, ReadinessStep, ReviewStep } from './setup-steps';

// Setting a year up takes days and many sittings. Every step is always reachable; a step that depends on another says so.
export function YearSetup({ yearId, personaSlug }: { yearId: string; personaSlug: string }): React.ReactElement {
  const years = useMdmSessions();
  const areas = useSetupAreas(yearId);
  const { get, put } = useUrlState();

  if (years.isPending || areas.isPending) return <WidgetLoading rows={8} />;
  const failed = years.error ?? areas.error;
  if (failed) return <WidgetError error={failed} onRetry={() => void areas.refetch()} />;

  const all = years.data?.rows ?? [];
  const year = all.find((row) => row.id === yearId);
  const yearHref = paths.personaSection(personaSlug, `school/years/${yearId}`);
  if (!year) {
    return (
      <Alert severity="info" variant="outlined">
        That academic year is not here any more. It may have been removed.
      </Alert>
    );
  }

  // Setup is for a year being prepared. Once it runs, the same areas are ordinary tabs of the year.
  if (yearLifecycle(year) !== 'draft') {
    return (
      <Alert
        severity="info"
        variant="outlined"
        action={
          <Button component={NextLink} href={yearHref} size="small" color="inherit">
            Open the year
          </Button>
        }
      >
        {year.name} is no longer being set up. Its students, classes and calendar are managed from the year itself.
      </Alert>
    );
  }

  const rows = areas.data ?? [];
  const key: SetupAreaKey = SETUP_AREAS.find((name) => name === get('step')) ?? rows.find((area) => area.state !== 'ready')?.key ?? 'basic';
  const current = rows.find((area) => area.key === key) ?? rows[0];
  const counted = rows.filter((area) => area.key !== 'review');
  const ready = counted.filter((area) => area.state === 'ready').length;
  const open = (next: SetupAreaKey): void => put({ step: next });

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h2" component="h1">
              Set up {year.name ?? year.code}
            </Typography>
            <EmergeChip label="Draft · Setup in progress" tone="amber" />
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            {dayRange(year.start_date, year.end_date)} · {ready} of {counted.length} areas ready
          </Typography>
        </div>
        <Button component={NextLink} href={yearHref} variant="outlined">
          View Year
        </Button>
      </Stack>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '340px minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Card component="nav" aria-label="Setup steps">
          <List disablePadding sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {rows.map((area, index) => (
              <ListItemButton
                key={area.key}
                selected={area.key === key}
                onClick={() => open(area.key)}
                aria-current={area.key === key ? 'step' : undefined}
                sx={{ borderRadius: 2, alignItems: 'flex-start', gap: 1.25, py: 1 }}
              >
                <ListItemIcon sx={{ minWidth: 0, mt: 0.25, color: area.key === key ? 'inherit' : AREA_STATE[area.state].colour }}>
                  <AreaStateIcon state={area.state} />
                </ListItemIcon>
                <ListItemText
                  primary={`${index + 1}. ${area.title}`}
                  secondary={area.summary}
                  slotProps={{
                    primary: { variant: 'subtitle2' },
                    secondary: { variant: 'body2', sx: { color: area.key === key ? 'inherit' : 'text.secondary', opacity: area.key === key ? 0.72 : 1 } },
                  }}
                  sx={{ my: 0 }}
                />
                {area.issues > 0 ? <Chip size="small" label={area.issues} aria-label={`${area.issues} open`} /> : null}
              </ListItemButton>
            ))}
          </List>
        </Card>

        <div>
          {current?.key === 'basic' ? <BasicSetupStep area={current} year={year} /> : null}
          {current?.key === 'structure' ? <BringForwardStep area={current} year={year} years={all} /> : null}
          {current?.key === 'review' ? <ReviewStep area={current} areas={rows} year={year} personaSlug={personaSlug} onOpen={open} /> : null}
          {current?.key === 'classes' ? <ClassesStep area={current} year={year} personaSlug={personaSlug} /> : null}
          {current && !['basic', 'structure', 'classes', 'review'].includes(current.key) ? <ReadinessStep area={current} personaSlug={personaSlug} /> : null}
        </div>
      </Box>
    </Stack>
  );
}
