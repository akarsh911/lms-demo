'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Printer } from 'lucide-react';
import NextLink from 'next/link';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressBar } from '@/components/ui/progress';
import { Segmented } from '@/components/ui/segmented';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useLessonPlans } from '@/hooks/query/use-lesson-planner';
import { formatShortDate } from '@/lib/dates';
import { paths } from '@/paths';
import type { LessonPlan } from '@/types/lesson-planner';

import { PLAN_STATUS_META } from './block-kinds';
import { taughtCount } from './plan-edits';
import { CARD_PAD } from './spacing';

type Filter = 'all' | 'upcoming' | 'taught';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'To teach' },
  { value: 'taught', label: 'Taught' },
] as const;

const matches = (plan: LessonPlan, filter: Filter): boolean =>
  filter === 'all' || (filter === 'taught' ? plan.status === 'taught' : plan.status !== 'taught');

function nextLine(plan: LessonPlan, today: string): string {
  const open = plan.periods.filter((period) => period.taught === null && period.slot);
  const next = open.find((period) => (period.slot?.date ?? '') >= today);
  if (next?.slot) return `Next ${formatShortDate(next.slot.date)}`;
  const missed = open[0];
  if (missed?.slot) return `Not marked since ${formatShortDate(missed.slot.date)}`;
  const last = [...plan.periods].reverse().find((period) => period.slot);
  if (plan.status === 'taught' && last?.slot) return `Done ${formatShortDate(last.slot.date)}`;
  return 'Unscheduled';
}

function PlanRow({ plan, personaSlug, today, divider, onOpen }: { plan: LessonPlan; personaSlug: string; today: string; divider: boolean; onOpen: () => void }): React.ReactElement {
  const taught = taughtCount(plan.periods);
  const status = PLAN_STATUS_META[plan.status];
  return (
    <ListItem
      disablePadding
      divider={divider}
      secondaryAction={
        <Tooltip title="Print" arrow>
          <IconButton edge="end" component={NextLink} href={paths.lessonPlanPrint(personaSlug, plan.id)} aria-label={`Print ${plan.title}`}>
            <Printer size={18} />
          </IconButton>
        </Tooltip>
      }
    >
      <ListItemButton onClick={onOpen} aria-label={`Open ${plan.title}`} sx={{ borderRadius: 2, gap: 2, pr: 7 }}>
        <ListItemText
          primary={plan.title}
          secondary={`${plan.subject_name}, ${plan.section_label} · ${nextLine(plan, today)}`}
          slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'body2', noWrap: true } }}
          sx={{ my: 0, minWidth: 0 }}
        />
        <Stack spacing={0.5} sx={{ width: 120, flex: 'none', display: { xs: 'none', sm: 'flex' } }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {taught}/{plan.periods.length} taught
          </Typography>
          <ProgressBar value={(taught / Math.max(plan.periods.length, 1)) * 100} tone={plan.status === 'taught' ? 'green' : 'blue'} />
        </Stack>
        <EmergeChip tone={status.tone} dot label={status.label} />
      </ListItemButton>
    </ListItem>
  );
}

export function PlanList({
  personaSlug,
  today,
  offeringIds,
  onOpen,
}: {
  personaSlug: string;
  today: string;
  offeringIds: ReadonlySet<string> | null;
  onOpen: (id: string) => void;
}): React.ReactElement {
  const plans = useLessonPlans();
  const [filter, setFilter] = React.useState<Filter>('all');
  const all = (plans.data ?? []).filter((plan) => offeringIds === null || offeringIds.has(plan.offering_id));
  const shown = all.filter((plan) => matches(plan, filter));
  const taught = all.filter((plan) => plan.status === 'taught').length;

  return (
    <Card>
      <CardHeader
        title="Lesson plans"
        subheader={plans.data ? `${all.length} ${all.length === 1 ? 'plan' : 'plans'} · ${taught} taught` : 'Saved plans'}
      />
      <CardContent>
        <Stack spacing={CARD_PAD}>
          {plans.isPending ? <WidgetLoading rows={4} /> : null}
          {plans.isError ? <WidgetError error={plans.error} onRetry={() => void plans.refetch()} /> : null}
          {plans.data && all.length === 0 ? <EmptyState title="No plans yet" body="Plans you save from New lesson appear here." /> : null}
          {all.length > 0 ? (
            <>
              <CardToolbar start={<Segmented options={FILTERS} value={filter} onChange={setFilter} ariaLabel="Which lesson plans to show" />} summary={`${shown.length} of ${all.length}`} />
              {shown.length === 0 ? (
                <EmptyState title="Nothing here" />
              ) : (
                <List disablePadding>
                  {shown.map((plan, index) => (
                    <PlanRow key={plan.id} plan={plan} personaSlug={personaSlug} today={today} divider={index < shown.length - 1} onOpen={() => onOpen(plan.id)} />
                  ))}
                </List>
              )}
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
