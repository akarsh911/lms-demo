'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { AlarmClock, ArrowRight, Check, RotateCcw, Send, X } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useAssignAction, useNoteAction, useQuickAction, useReopenAction, useResolveAction, useSnoozeAction } from '@/hooks/mutation/use-actions';
import { useAction, useActionOwners } from '@/hooks/query/use-actions';
import { formatMoment, formatRelativeTime } from '@/lib/dates';
import { paths } from '@/paths';
import type { ActionDetail } from '@/types/actions';

import { CATEGORY, PRIORITY } from './action-meta';
import { dueLabel, snoozeUntil } from './action-row';

const SHOWN = 12;
const OFFICE: readonly string[] = ['Administrator', 'Registrar', 'Accountant', 'Librarian'];

function Affected({ item }: { item: ActionDetail }): React.ReactElement | null {
  const [all, setAll] = React.useState(false);
  if (item.rows.length === 0) return null;
  const rows = all ? item.rows : item.rows.slice(0, SHOWN);
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1">Who it concerns · {item.rows.length}</Typography>
      <TableContainer sx={{ maxHeight: all ? 420 : 'none' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {item.columns.map((c, i) => (
                <TableCell key={c} align={i === 2 ? 'right' : 'left'}>
                  {c}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Typography variant="subtitle2" component="span">
                    {r.primary}
                  </Typography>
                </TableCell>
                <TableCell sx={{ color: 'text.secondary' }}>{r.secondary}</TableCell>
                <TableCell align="right">{r.tone === 'grey' ? r.value : <EmergeChip label={r.value} tone={r.tone} />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {item.rows.length > SHOWN ? (
        <Button size="small" onClick={() => setAll(!all)} sx={{ alignSelf: 'flex-start' }}>
          {all ? 'Show fewer' : `Show all ${item.rows.length}`}
        </Button>
      ) : null}
    </Stack>
  );
}

function Handling({ item, now }: { item: ActionDetail; now: number }): React.ReactElement {
  const notify = useToast();
  const owners = useActionOwners(true);
  const assign = useAssignAction(item.id);
  const snooze = useSnoozeAction(item.id);
  const resolve = useResolveAction(item.id);
  const reopen = useReopenAction(item.id);
  const [closing, setClosing] = React.useState(false);
  const [outcome, setOutcome] = React.useState('');

  if (item.status !== 'open') {
    return (
      <Button variant="outlined" startIcon={<RotateCcw size={16} />} sx={{ alignSelf: 'flex-start' }} loading={reopen.isPending} onClick={() => reopen.mutate(undefined, { onSuccess: () => notify('Reopened') })}>
        Reopen
      </Button>
    );
  }
  return (
    <Stack spacing={1.5}>
      {(owners.data?.length ?? 0) === 0 ? null : (
      <Autocomplete
        options={owners.data ?? []}
        loading={owners.isPending}
        value={owners.data?.find((o) => o.name === item.owner) ?? null}
        onChange={(_, o) => assign.mutate(o?.id ?? null, { onSuccess: () => notify(o ? `Handed to ${o.name}` : 'Taken back') })}
        getOptionLabel={(o) => o.name}
        groupBy={(o) => (OFFICE.includes(o.duty) ? 'Office' : 'Teachers')}
        renderOption={({ key, ...props }, o) => (
          <li key={key} {...props}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', width: 1 }}>
              <Typography variant="body2">{o.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {o.duty}
              </Typography>
            </Stack>
          </li>
        )}
        renderInput={(params) => <TextField {...params} size="small" label="Who holds it" placeholder="You, until handed on" />}
      />
      )}
      {closing ? (
        <Stack direction="row" spacing={1}>
          <TextField size="small" fullWidth autoFocus label="What was done" value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Spoke to the parents; fee plan agreed" />
          <Button variant="contained" loading={resolve.isPending} onClick={() => resolve.mutate(outcome, { onSuccess: () => (notify('Marked done'), setClosing(false)) })}>
            Done
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button variant="contained" startIcon={<Check size={16} />} onClick={() => setClosing(true)}>
            Mark Done
          </Button>
          <Button variant="outlined" startIcon={<AlarmClock size={16} />} onClick={() => snooze.mutate(snoozeUntil(1, now), { onSuccess: () => notify('Snoozed until tomorrow morning') })}>
            Tomorrow
          </Button>
          <Button variant="outlined" startIcon={<AlarmClock size={16} />} onClick={() => snooze.mutate(snoozeUntil(7, now), { onSuccess: () => notify('Snoozed for a week') })}>
            Next Week
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

function History({ item }: { item: ActionDetail }): React.ReactElement {
  const [text, setText] = React.useState('');
  const note = useNoteAction(item.id);
  return (
    <Stack spacing={1.25}>
      <Typography variant="subtitle1">History</Typography>
      <Typography variant="body2" color="text.secondary">
        Raised {formatMoment(item.raised_at)}
      </Typography>
      {item.notes.map((n) => (
        <Box key={`${n.at}${n.text}`}>
          <Typography variant="subtitle2" component="span">
            {n.author}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="span">
            {' '}
            · {formatRelativeTime(n.at)}
          </Typography>
          <Typography variant="body2">{n.text}</Typography>
        </Box>
      ))}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField size="small" fullWidth placeholder="Add a note" value={text} onChange={(e) => setText(e.target.value)} />
        <IconButton aria-label="Add note" disabled={!text.trim() || note.isPending} onClick={() => note.mutate(text, { onSuccess: () => setText('') })}>
          <Send size={18} />
        </IconButton>
      </Stack>
    </Stack>
  );
}

// One item opened beside the inbox: what it is, who it concerns, who holds it, and what has been done.
export function ActionDrawer({ id, now, personaSlug, onClose }: { id: string | null; now: number; personaSlug: string; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const query = useAction(id);
  const quick = useQuickAction(id ?? '');
  const item = query.data;
  const due = item && item.status === 'open' ? dueLabel(item.due_at, now) : null;

  return (
    <Drawer anchor="right" open={Boolean(id)} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 600 } } } }}>
      {query.isPending ? (
        <Box sx={{ p: 3 }}>
          <WidgetLoading rows={6} />
        </Box>
      ) : query.isError ? (
        <Box sx={{ p: 3 }}>
          <WidgetError error={query.error} onRetry={() => void query.refetch()} />
        </Box>
      ) : item ? (
        <Stack sx={{ height: '100%' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 3, pt: 2.5, pb: 1 }}>
            <EmergeChip label={PRIORITY[item.priority].label} tone={PRIORITY[item.priority].tone} dot={item.priority === 'urgent'} />
            <EmergeChip label={CATEGORY[item.category].label} tone={CATEGORY[item.category].tone} />
            {item.status !== 'open' ? <EmergeChip label={item.status === 'done' ? 'Done' : 'Snoozed'} tone={item.status === 'done' ? 'green' : 'blue'} /> : null}
            {due ? <EmergeChip label={due.text} tone={due.tone} /> : null}
            <Box sx={{ flex: 1 }} />
            <IconButton aria-label="Close" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </Stack>
          <Stack spacing={2.5} sx={{ px: 3, pb: 3, overflowY: 'auto', flex: 1 }}>
            <div>
              <Typography variant="h3" component="h2">
                {item.title}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {item.detail}
              </Typography>
            </div>
            <Typography variant="body1">{item.explanation}</Typography>
            {item.status === 'open' && (item.quick || item.link) ? (
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {item.quick ? (
                  <Button variant="outlined" loading={quick.isPending} onClick={() => quick.mutate(undefined, { onSuccess: () => notify(`${item.quick}: recorded`) })}>
                    {item.quick}
                  </Button>
                ) : null}
                {item.link ? (
                  <Button component={NextLink} href={paths.personaSection(personaSlug, item.link.path)} endIcon={<ArrowRight size={16} />}>
                    {item.link.label}
                  </Button>
                ) : null}
              </Stack>
            ) : null}
            <Divider />
            <Handling item={item} now={now} />
            <Affected item={item} />
            <Divider />
            <History item={item} />
          </Stack>
        </Stack>
      ) : null}
    </Drawer>
  );
}
