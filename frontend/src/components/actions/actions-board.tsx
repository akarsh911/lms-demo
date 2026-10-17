'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CheckCircle2, Inbox } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { TabLabel } from '@/components/ui/tab-label';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useActionSummary, useActions } from '@/hooks/query/use-actions';
import { useReach } from '@/hooks/query/use-reach';
import { ACTION_CATEGORIES, type ActionCategory, type ActionItem, type ActionPriority, type ActionStatus } from '@/types/actions';

import { ActionDrawer } from './action-drawer';
import { CATEGORY, PRIORITY } from './action-meta';
import { ActionRow } from './action-row';

const STATUSES = ['open', 'snoozed', 'done'] as const satisfies readonly ActionStatus[];
const STATUS_LABEL: Readonly<Record<ActionStatus, string>> = { open: 'To do', snoozed: 'Snoozed', done: 'Done' };
const PRIORITIES: readonly ActionPriority[] = ['urgent', 'high', 'normal'];
const isCategory = (value: string | null): value is ActionCategory => ACTION_CATEGORIES.some((c) => c === value);

// The principal's inbox: everything the school has raised that needs a decision, urgent first, by area.
export function ActionsBoard({ personaSlug }: { personaSlug: string }): React.ReactElement {
  // The office sees every area, empty ones included; a teacher or a pupil only the areas that hold something.
  const schoolWide = useReach()?.kind === 'school';
  const { get, put } = useUrlState();
  const list = useActions();
  const summary = useActionSummary();
  const [search, setSearch] = React.useState('');
  const [unowned, setUnowned] = React.useState(false);
  const status: ActionStatus = STATUSES.find((s) => s === get('show')) ?? 'open';
  const asked = get('area');
  const area = isCategory(asked) ? asked : null;
  const now = list.dataUpdatedAt;

  if (list.isPending) return <WidgetLoading rows={8} />;
  if (list.isError) return <WidgetError error={list.error} onRetry={() => void list.refetch()} />;

  const q = search.trim().toLowerCase();
  const inStatus = list.data.filter((a) => a.status === status);
  const count = (c: ActionCategory | null): number => inStatus.filter((a) => !c || a.category === c).length;
  const rows = inStatus.filter((a) => (!area || a.category === area) && (!unowned || !a.owner) && (!q || `${a.title} ${a.detail} ${a.about}`.toLowerCase().includes(q)));
  const groups = PRIORITIES.map((p) => ({ priority: p, items: rows.filter((a) => a.priority === p) })).filter((g) => g.items.length > 0);
  const open = (item: ActionItem): void => put({ open: item.id });

  return (
    <Stack spacing={2}>
      {summary.data ? (
        <FactStrip
          facts={[
            { label: 'Urgent', value: summary.data.urgent, note: 'Need you today' },
            { label: 'Due today or overdue', value: summary.data.due_today, note: 'Past or at their deadline' },
            { label: 'Open', value: summary.data.open, note: `Across ${ACTION_CATEGORIES.filter((c) => summary.data.by_category[c] > 0).length} areas` },
            { label: 'Done this week', value: summary.data.done_week, note: summary.data.done_week > 0 ? 'Resolved with a note' : 'Nothing closed yet' },
          ]}
        />
      ) : null}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Card sx={{ position: { lg: 'sticky' }, top: { lg: 0 }, display: { xs: 'none', lg: 'block' } }}>
          <List dense subheader={<ListSubheader sx={{ bgcolor: 'transparent' }}>Areas</ListSubheader>} sx={{ p: 1 }}>
            <ListItemButton selected={!area} onClick={() => put({ area: null })} sx={{ borderRadius: 2 }}>
              <ListItemIcon sx={{ minWidth: 34 }}>
                <Inbox size={18} />
              </ListItemIcon>
              <ListItemText primary="Everything" />
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {count(null)}
              </Typography>
            </ListItemButton>
            {ACTION_CATEGORIES.filter((c) => schoolWide || count(c) > 0).map((c) => (
              <ListItemButton key={c} selected={area === c} onClick={() => put({ area: c })} sx={{ borderRadius: 2 }} disabled={count(c) === 0}>
                <ListItemIcon sx={{ minWidth: 34, color: 'text.secondary' }}>{CATEGORY[c].icon}</ListItemIcon>
                <ListItemText primary={CATEGORY[c].label} />
                <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: inStatus.some((a) => a.category === c && a.priority === 'urgent') ? 700 : 400, color: inStatus.some((a) => a.category === c && a.priority === 'urgent') ? 'error.main' : 'text.secondary' }}>
                  {count(c)}
                </Typography>
              </ListItemButton>
            ))}
          </List>
        </Card>

        <Card>
          <CardToolbar
            start={<Segmented<ActionStatus> ariaLabel="Which items" value={status} onChange={(next) => put({ show: next === 'open' ? null : next })} options={STATUSES.map((s) => ({ value: s, label: <TabLabel label={STATUS_LABEL[s]} count={s === 'open' ? 0 : list.data.filter((a) => a.status === s).length} /> }))} />}
            summary={`${rows.length} shown`}
          >
            <SearchField label="Search" value={search} onChange={setSearch} width={220} />
            {schoolWide ? <Chip label="Nobody holds it" variant="outlined" sx={unowned ? { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main' } : undefined} onClick={() => setUnowned(!unowned)} aria-pressed={unowned} /> : null}
          </CardToolbar>
          <Stack direction="row" sx={{ display: { xs: 'flex', lg: 'none' }, flexWrap: 'wrap', gap: 0.75, px: 2, pt: 1.5 }}>
            <Chip size="small" label={`Everything · ${count(null)}`} variant={area ? 'outlined' : 'filled'} onClick={() => put({ area: null })} />
            {ACTION_CATEGORIES.filter((c) => count(c) > 0).map((c) => (
              <Chip key={c} size="small" label={`${CATEGORY[c].label} · ${count(c)}`} variant={area === c ? 'filled' : 'outlined'} onClick={() => put({ area: c })} />
            ))}
          </Stack>
          {groups.length === 0 ? (
            <EmptyState
              art={<CheckCircle2 size={40} aria-hidden />}
              title={status === 'open' ? 'Nothing waiting here' : status === 'snoozed' ? 'Nothing snoozed' : 'Nothing done yet'}
              body={status === 'open' ? 'When something needs you, it appears here with the urgent first.' : 'Items you snooze or resolve collect here.'}
              action={
                area || q || unowned ? (
                  <Button variant="outlined" onClick={() => (setSearch(''), setUnowned(false), put({ area: null }))}>
                    Show everything
                  </Button>
                ) : null
              }
            />
          ) : (
            groups.map((g) => (
              <List key={g.priority} disablePadding subheader={<ListSubheader sx={{ display: 'flex', gap: 1, alignItems: 'center', bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', lineHeight: '40px' }}>
                <Typography variant="eyebrow" sx={{ color: g.priority === 'urgent' ? 'error.main' : g.priority === 'high' ? 'warning.dark' : 'text.secondary' }}>
                  {PRIORITY[g.priority].label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {g.items.length}
                </Typography>
              </ListSubheader>}>
                {g.items.map((item) => (
                  <ActionRow key={item.id} item={item} now={now} personaSlug={personaSlug} onOpen={() => open(item)} />
                ))}
              </List>
            ))
          )}
        </Card>
      </Box>
      <ActionDrawer id={get('open')} now={now} personaSlug={personaSlug} onClose={() => put({ open: null })} />
    </Stack>
  );
}
