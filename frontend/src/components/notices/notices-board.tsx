'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Clock, Megaphone, Pin, Plus, Users } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { PageActions } from '@/components/ui/page-actions';
import { SearchField } from '@/components/ui/search-field';
import { TabLabel } from '@/components/ui/tab-label';
import { Segmented } from '@/components/ui/segmented';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useNoticeSummary, useNotices } from '@/hooks/query/use-notices';
import { formatMoment, formatRelativeTime } from '@/lib/dates';
import { NOTICE_CATEGORIES, isStaffTarget, type Notice, type NoticeScope, type NoticeState } from '@/types/notices';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { capabilityFor } from '@/lib/core/fields';

import { NoticeComposer } from './notice-composer';
import { NoticeDrawer } from './notice-drawer';
import { CATEGORY } from './notice-meta';

const SHOWS = ['published', 'scheduled', 'draft', 'expired'] as const satisfies readonly NoticeState[];
type Show = (typeof SHOWS)[number];
const SHOW_LABEL: Readonly<Record<Show, string>> = { published: 'Live', scheduled: 'Scheduled', draft: 'Drafts', expired: 'Expired' };
const HEADING: Readonly<Record<Show, { title: string; note: string }>> = {
  published: { title: 'Live now', note: 'In feeds today; pinned ones first' },
  scheduled: { title: 'Waiting to go out', note: 'Sent automatically at the time set' },
  draft: { title: 'Drafts', note: 'Saved and not sent' },
  expired: { title: 'Expired', note: 'Past their last day and out of feeds' },
};
const REACH = ['any', 'school', 'grade', 'section', 'student', 'staff', 'parents'] as const;
const REACH_LABEL: Readonly<Record<(typeof REACH)[number], string>> = { any: 'Any audience', school: 'All students', grade: 'Whole classes', section: 'Sections', student: 'Named students', staff: 'Staff', parents: 'Parents' };

const percent = (value: number, total: number): number => (total === 0 ? 0 : Math.round((value / total) * 100));

// A reader sees the notice itself; who it went to and how it is being read are for the people who send them.
function NoticeRow({ notice, onOpen, reader }: { notice: Notice; onOpen: () => void; reader: boolean }): React.ReactElement {
  const meta = CATEGORY[notice.category];
  const shown = notice.audience.slice(0, 3);
  return (
    <ListItemButton onClick={onOpen} sx={{ alignItems: 'flex-start', gap: 2, px: 3, py: 2 }} divider>
      <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', flexShrink: 0, width: 40, height: 40, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints[meta.tone], color: theme.onTint[meta.tone] })}>
        {meta.icon}
      </Box>
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          {notice.pinned && notice.state === 'published' ? <Pin size={14} aria-label="Pinned" /> : null}
          <Typography variant="subtitle1" component="span">
            {notice.title}
          </Typography>
          {notice.category === 'urgent' ? <EmergeChip label="Urgent" tone="red" /> : null}
          {notice.state === 'scheduled' ? <EmergeChip label={`Goes out ${formatMoment(notice.published_at)}`} tone="blue" /> : null}
          {notice.state === 'draft' ? <EmergeChip label="Draft" tone="amber" /> : null}
        </Stack>
        <Typography variant="body2" color="text.secondary" noWrap>
          {notice.body}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, pt: 0.5 }}>
          {reader ? null : (
            <>
              {shown.map((a) => (
                <EmergeChip key={`${a.type}${a.id}`} label={a.label} tone="grey" />
              ))}
              {notice.audience.length > shown.length ? <EmergeChip label={`+${notice.audience.length - shown.length}`} tone="grey" /> : null}
              {notice.delivery === 'students_parents' && notice.audience.some((a) => !isStaffTarget(a.type)) ? <EmergeChip label="With parents" tone="teal" /> : null}
            </>
          )}
          <Typography variant="caption" color="text.secondary">
            {notice.author}
            {notice.state === 'published' || notice.state === 'expired' ? ` · ${formatRelativeTime(notice.published_at ?? notice.created_at)}` : ''}
            {notice.comments > 0 ? ` · ${notice.comments} ${notice.comments === 1 ? 'reply' : 'replies'}` : ''}
          </Typography>
        </Stack>
      </Stack>
      {reader ? null : (
        <Stack spacing={0.75} sx={{ width: { xs: 96, sm: 168 }, flexShrink: 0, pt: 0.5 }}>
          {notice.state === 'published' || notice.state === 'expired' ? (
            <>
              <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">
                  Seen
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {percent(notice.seen, notice.recipients)}%
                </Typography>
              </Stack>
              <LinearProgress variant="determinate" value={percent(notice.seen, notice.recipients)} sx={{ height: 5, borderRadius: 3 }} />
              <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {notice.seen.toLocaleString('en-IN')} of {notice.recipients.toLocaleString('en-IN')}
                {notice.acknowledge ? ` · ${notice.acknowledged.toLocaleString('en-IN')} ack.` : ''}
              </Typography>
            </>
          ) : (
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary' }}>
              {notice.state === 'scheduled' ? <Clock size={14} aria-hidden /> : <Users size={14} aria-hidden />}
              <Typography variant="caption" sx={{ color: 'inherit' }}>
                Will reach {notice.reach.people.toLocaleString('en-IN')}
              </Typography>
            </Stack>
          )}
        </Stack>
      )}
    </ListItemButton>
  );
}

// Every announcement the caller may see: what is live, what is waiting to go out, and what never left.
export function NoticesBoard({ scope }: { scope?: NoticeScope } = {}): React.ReactElement {
  const { get, put } = useUrlState();
  const list = useNotices();
  const capabilities = useCapabilities();
  const summary = useNoticeSummary();
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('any');
  const [reach, setReach] = React.useState<(typeof REACH)[number]>('any');
  const [mine, setMine] = React.useState(false);
  const [composing, setComposing] = React.useState<{ notice: Notice | null; copy: boolean } | null>(null);
  const show: Show = SHOWS.find((s) => s === get('show')) ?? 'published';
  const open = get('open');

  const writes = !scope?.readOnly && capabilityFor(capabilities.data?.capabilities ?? [], 'core.stream_posts.write') !== undefined;
  // Who it reached and how it is being read belong to whoever can change the notice: its author, or the office.
  const manages = (n: Notice): boolean => writes && (n.mine || capabilityFor(capabilities.data?.capabilities ?? [], 'core.stream_posts.write_all') !== undefined);
  const newButton = !writes ? null : (
    <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setComposing({ notice: null, copy: false })}>
      New Announcement
    </Button>
  );
  const button = scope || !writes ? null : (
    <PageActions>
      <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setComposing({ notice: null, copy: false })}>
        New Announcement
      </Button>
    </PageActions>
  );

  if (list.isPending) return <WidgetLoading rows={8} />;
  if (list.isError) return <WidgetError error={list.error} onRetry={() => void list.refetch()} />;

  const q = search.trim().toLowerCase();
  const pool = scope ? list.data.filter((n) => n.audience.some((a) => a.type === scope.rule.type && a.id === scope.rule.id)) : list.data;
  const count = (s: Show): number => pool.filter((n) => n.state === s).length;
  const rows = pool.filter(
    (n) =>
      n.state === show &&
      (category === 'any' || n.category === category) &&
      (reach === 'any' || (reach === 'parents' ? n.reach.parents > 0 : reach === 'staff' ? n.reach.staff > 0 : n.audience.some((a) => (reach === 'school' ? a.type === 'school' || a.type === 'branch' : reach === 'section' ? a.type === 'section' || a.type === 'offering' : a.type === reach)))) &&
      (!mine || n.mine) &&
      (!q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.audience.some((a) => a.label.toLowerCase().includes(q))),
  );
  const filtered = Boolean(q) || category !== 'any' || reach !== 'any' || mine;

  return (
    <Stack spacing={2}>
      {button}
      {writes && summary.data && !scope ? (
        <FactStrip
          facts={[
            { label: 'Live now', value: summary.data.live, note: `${summary.data.pinned} pinned` },
            { label: 'Sent this week', value: summary.data.sent_week, note: 'Published in the last seven days' },
            { label: 'Seen', value: `${Math.round(summary.data.seen_rate * 100)}%`, note: 'Of students reached by live notices' },
            { label: 'To acknowledge', value: summary.data.awaiting_ack.toLocaleString('en-IN'), note: 'Students yet to confirm' },
          ]}
        />
      ) : null}
      <Card>
        <CardHeader title={scope || !writes ? 'Announcements' : HEADING[show].title} subheader={scope ? `To everyone ${scope.rule.type === 'section' ? 'in' : 'taking'} ${scope.label}` : HEADING[show].note} action={scope ? newButton : null} />
        <CardToolbar
          start={
            !writes ? undefined : (
              <Segmented<Show>
                ariaLabel="Which announcements"
                value={show}
                onChange={(next) => put({ show: next === 'published' ? null : next })}
                options={SHOWS.map((s) => ({ value: s, label: <TabLabel label={SHOW_LABEL[s]} count={s === 'published' ? 0 : count(s)} /> }))}
              />
            )
          }
          summary={`${rows.length} shown`}
        >
          <SearchField label="Search title, message or audience" value={search} onChange={setSearch} width={260} />
          <TextField select size="small" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ minWidth: 150 }} aria-label="Category">
            <MenuItem value="any">Any category</MenuItem>
            {NOTICE_CATEGORIES.map((c) => (
              <MenuItem key={c} value={c}>
                {CATEGORY[c].label}
              </MenuItem>
            ))}
          </TextField>
          {scope || !writes ? null : (
            <TextField select size="small" value={reach} onChange={(e) => setReach(REACH.find((r) => r === e.target.value) ?? 'any')} sx={{ minWidth: 160 }} aria-label="Audience">
              {REACH.map((r) => (
                <MenuItem key={r} value={r}>
                  {REACH_LABEL[r]}
                </MenuItem>
              ))}
            </TextField>
            )}
          {writes ? <Chip label="Written by me" variant={mine ? 'filled' : 'outlined'} color={mine ? 'primary' : 'default'} onClick={() => setMine(!mine)} aria-pressed={mine} /> : null}
        </CardToolbar>
        {rows.length === 0 ? (
          <EmptyState
            art={<Megaphone size={40} aria-hidden />}
            title={filtered ? 'Nothing matches these filters' : show === 'draft' ? 'No drafts' : show === 'scheduled' ? 'Nothing is scheduled' : show === 'expired' ? 'Nothing has expired' : 'No live announcements'}
            body={filtered ? 'Clear a filter to see more.' : writes ? 'A new announcement can go out now, wait for a time, or be kept as a draft.' : 'Announcements from the school and your teachers appear here.'}
            action={
              filtered ? (
                <Button
                  variant="outlined"
                  onClick={() => {
                    setSearch('');
                    setCategory('any');
                    setReach('any');
                    setMine(false);
                  }}
                >
                  Clear Filters
                </Button>
              ) : writes ? (
                <Button variant="outlined" startIcon={<Plus size={16} />} onClick={() => setComposing({ notice: null, copy: false })}>
                  New Announcement
                </Button>
              ) : null
            }
          />
        ) : (
          <List disablePadding>
            {rows.map((n) => (
              <NoticeRow key={n.id} notice={n} reader={!manages(n)} onOpen={() => put({ open: n.id })} />
            ))}
          </List>
        )}
      </Card>

      <NoticeDrawer
        id={open}
        mayManage={manages}
        onClose={() => put({ open: null })}
        onEdit={(notice) => setComposing({ notice, copy: false })}
        onCopy={(notice) => {
          put({ open: null });
          setComposing({ notice, copy: true });
        }}
      />
      {composing ? <NoticeComposer notice={composing.notice} copy={composing.copy} scope={scope} onClose={() => setComposing(null)} /> : null}
    </Stack>
  );
}
