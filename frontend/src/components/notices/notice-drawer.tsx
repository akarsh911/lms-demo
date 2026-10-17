'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Archive, Copy, Pencil, Pin, PinOff, Send, Users, X } from 'lucide-react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmergeChip } from '@/components/ui/chip';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useArchiveNotice, useCommentOnNotice, usePinNotice } from '@/hooks/mutation/use-notices';
import { useNotice } from '@/hooks/query/use-notices';
import { formatMoment, formatRelativeTime } from '@/lib/dates';
import type { Notice, NoticeDetail } from '@/types/notices';

import { CATEGORY, STATE } from './notice-meta';

// "1,900 students, 950 parents and 102 staff", leaving out whoever it does not reach.
const reachLine = (n: Notice): string => {
  const parts = [
    n.reach.students > 0 ? `${n.reach.students.toLocaleString('en-IN')} students` : null,
    n.reach.parents > 0 ? `${n.reach.parents.toLocaleString('en-IN')} parents` : null,
    n.reach.staff > 0 ? `${n.reach.staff.toLocaleString('en-IN')} staff` : null,
  ].filter((x): x is string => x !== null);
  return parts.length === 0 ? 'Nobody yet' : parts.length === 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
};

const percent = (value: number, total: number): number => (total === 0 ? 0 : Math.round((value / total) * 100));

function Reading({ notice }: { notice: NoticeDetail }): React.ReactElement {
  const [all, setAll] = React.useState(false);
  // The sections that have read least come first: those are the ones to chase.
  const sections = [...notice.by_section].sort((a, b) => a.seen / a.people - b.seen / b.people);
  const shown = all ? sections : sections.slice(0, 6);
  if (notice.state === 'draft' || notice.state === 'scheduled') {
    return (
      <Typography variant="body2" color="text.secondary">
        Reading figures start once it goes out to {notice.reach.people.toLocaleString('en-IN')} people.
      </Typography>
    );
  }
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1 }}>
        <Typography variant="figure">{percent(notice.seen, notice.recipients)}%</Typography>
        <Typography variant="body2" color="text.secondary">
          seen · {notice.seen.toLocaleString('en-IN')} of {notice.recipients.toLocaleString('en-IN')} people
        </Typography>
      </Stack>
      {notice.acknowledge ? (
        <Typography variant="body2" color="text.secondary">
          {notice.acknowledged.toLocaleString('en-IN')} acknowledged · {(notice.recipients - notice.acknowledged).toLocaleString('en-IN')} still to
        </Typography>
      ) : null}
      {sections.length > 1 ? (
        <Stack spacing={1}>
          <Typography variant="eyebrow" color="text.secondary">
            By group, least read first
          </Typography>
          {shown.map((s) => (
            <Stack key={s.section_id} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ width: 40, fontWeight: 600 }}>
                {s.label}
              </Typography>
              <LinearProgress variant="determinate" value={percent(s.seen, s.people)} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
              <Typography variant="caption" color="text.secondary" sx={{ width: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {s.seen} / {s.people}
              </Typography>
            </Stack>
          ))}
          {sections.length > 6 ? (
            <Button size="small" onClick={() => setAll(!all)} sx={{ alignSelf: 'flex-start' }}>
              {all ? 'Show fewer' : `Show all ${sections.length} groups`}
            </Button>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}

function Thread({ notice }: { notice: NoticeDetail }): React.ReactElement {
  const [draft, setDraft] = React.useState('');
  const comment = useCommentOnNotice(notice.id);
  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle1">Replies {notice.thread.length > 0 ? `· ${notice.thread.length}` : ''}</Typography>
      {notice.thread.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No replies yet.
        </Typography>
      ) : (
        notice.thread.map((c) => (
          <Box key={c.id}>
            <Typography variant="subtitle2" component="span">
              {c.author}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="span">
              {' '}
              · {formatRelativeTime(c.at)}
            </Typography>
            <Typography variant="body2">{c.body}</Typography>
          </Box>
        ))
      )}
      {notice.state === 'published' ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <TextField size="small" fullWidth placeholder="Reply to everyone who received it" value={draft} onChange={(e) => setDraft(e.target.value)} error={Boolean(comment.error)} helperText={comment.error?.message} />
          <IconButton aria-label="Send reply" disabled={!draft.trim() || comment.isPending} onClick={() => comment.mutate(draft, { onSuccess: () => setDraft('') })}>
            <Send size={18} />
          </IconButton>
        </Stack>
      ) : null}
    </Stack>
  );
}

// One announcement opened beside the feed: what it says, who it reached, who has read it, and the replies.
export function NoticeDrawer({ id, mayManage, onClose, onEdit, onCopy }: { id: string | null; mayManage: (n: Notice) => boolean; onClose: () => void; onEdit: (n: Notice) => void; onCopy: (n: Notice) => void }): React.ReactElement {
  const notify = useToast();
  const query = useNotice(id);
  const pin = usePinNotice();
  const archive = useArchiveNotice();
  const [archiving, setArchiving] = React.useState(false);
  const notice = query.data;

  return (
    <Drawer anchor="right" open={Boolean(id)} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 560 } } } }}>
      {query.isPending ? (
        <Box sx={{ p: 3 }}>
          <WidgetLoading rows={6} />
        </Box>
      ) : query.isError ? (
        <Box sx={{ p: 3 }}>
          <WidgetError error={query.error} onRetry={() => void query.refetch()} />
        </Box>
      ) : notice ? (
        <Stack sx={{ height: '100%' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 3, pt: 2.5, pb: 1 }}>
            <EmergeChip label={CATEGORY[notice.category].label} tone={CATEGORY[notice.category].tone} />
            <EmergeChip label={STATE[notice.state].label} tone={STATE[notice.state].tone} dot={notice.state === 'published'} />
            {notice.pinned ? <EmergeChip label="Pinned" tone="rose" /> : null}
            <Box sx={{ flex: 1 }} />
            <IconButton aria-label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </Stack>
          <Stack spacing={2.5} sx={{ px: 3, pb: 3, overflowY: 'auto', flex: 1 }}>
            <div>
              <Typography variant="h3" component="h2">
                {notice.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {notice.author} ·{' '}
                {notice.state === 'scheduled' ? `goes out ${formatMoment(notice.published_at)}` : notice.state === 'draft' ? `draft from ${formatMoment(notice.created_at)}` : formatMoment(notice.published_at)}
                {notice.expires_at ? ` · ${notice.state === 'expired' ? 'expired' : 'expires'} ${formatMoment(notice.expires_at)}` : ''}
              </Typography>
            </div>
            {mayManage(notice) ? (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Button size="small" variant="outlined" startIcon={<Pencil size={14} />} onClick={() => onEdit(notice)}>
                  Edit
                </Button>
                {notice.state === 'published' ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={notice.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                    onClick={() => pin.mutate({ id: notice.id, pinned: !notice.pinned }, { onSuccess: () => notify(notice.pinned ? 'Unpinned' : 'Pinned to the top') })}
                  >
                    {notice.pinned ? 'Unpin' : 'Pin'}
                  </Button>
              ) : null}
              <Button size="small" variant="outlined" startIcon={<Copy size={14} />} onClick={() => onCopy(notice)}>
                Duplicate
              </Button>
              <Button size="small" variant="outlined" color="error" startIcon={<Archive size={14} />} onClick={() => setArchiving(true)}>
                {notice.state === 'draft' ? 'Delete Draft' : 'Archive'}
              </Button>
            </Stack>
            ) : null}
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {notice.body}
            </Typography>
            {!mayManage(notice) ? null : (
                <>
                <Divider />
                <Stack spacing={1}>
                  <Typography variant="subtitle1">Audience</Typography>
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {notice.audience.map((a) => (
                      <EmergeChip key={`${a.type}${a.id}`} label={a.label} tone="grey" />
                    ))}
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <Users size={16} aria-hidden />
                    <Typography variant="body2" sx={{ color: 'inherit' }}>
                      {reachLine(notice)}
                    </Typography>
                  </Stack>
                </Stack>
                <Divider />
                <Stack spacing={1}>
                  <Typography variant="subtitle1">Reading</Typography>
                  <Reading notice={notice} />
                </Stack>
              </>
            )}
            <Divider />
            <Thread notice={notice} />
          </Stack>
          {archiving ? (
            <ConfirmDialog
              title={notice.state === 'draft' ? 'Delete this draft?' : 'Archive this announcement?'}
              body={notice.state === 'draft' ? 'It was never sent, so nobody will notice.' : 'It leaves every feed now. It is kept, with its reading figures and replies.'}
              confirmLabel={notice.state === 'draft' ? 'Delete' : 'Archive'}
              tone="danger"
              pending={archive.isPending}
              error={archive.error}
              onConfirm={() =>
                archive.mutate(notice.id, {
                  onSuccess: () => {
                    notify(notice.state === 'draft' ? 'Draft deleted' : 'Archived');
                    setArchiving(false);
                    onClose();
                  },
                })
              }
              onClose={() => setArchiving(false)}
            />
          ) : null}
        </Stack>
      ) : null}
    </Drawer>
  );
}
