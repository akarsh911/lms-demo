'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Send } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useApplyPupilLeave, useCancelPupilLeave, usePupilLeave } from '@/hooks/query/use-school-life';
import { formatDay } from '@/lib/dates';
import type { PupilLeave } from '@/types/pupil-leave';

const STATUS: Readonly<Record<PupilLeave['status'], { label: string; tone: 'amber' | 'green' | 'red' }>> = {
  pending: { label: 'Waiting', tone: 'amber' },
  approved: { label: 'Excused', tone: 'green' },
  declined: { label: 'Not excused', tone: 'red' },
};

function NoteDialog({ from: initialFrom, to: initialTo, classTeacher, onClose }: { from: string; to: string; classTeacher: string | null; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const apply = useApplyPupilLeave();
  const [from, setFrom] = React.useState(initialFrom);
  const [to, setTo] = React.useState(initialTo);
  const [reason, setReason] = React.useState('');
  return (
    <FormDialog
      open
      title="Send a leave note"
      description={`For days you were or will be away. ${classTeacher ?? 'Your class teacher'} reads it and excuses the days.`}
      submitLabel="Send Note"
      pending={apply.isPending}
      error={apply.error}
      canSubmit={Boolean(from && to && to >= from && reason.trim().length >= 4)}
      onClose={onClose}
      onSubmit={() => apply.mutate({ from, to, reason }, { onSuccess: () => (notify('Leave note sent'), onClose()) })}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
        <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} fullWidth />
      </Stack>
      <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Fever; the doctor advised rest" multiline minRows={2} required />
    </FormDialog>
  );
}

// A pupil's leave notes: days still unexplained, notes sent, and what the class teacher decided.
export function PupilLeaveNotes(): React.ReactElement {
  const notify = useToast();
  const { data, isPending, isError, error, refetch } = usePupilLeave();
  const cancel = useCancelPupilLeave();
  const [writing, setWriting] = React.useState<{ from: string; to: string } | null>(null);
  if (isPending) return <WidgetLoading rows={4} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  const today = new Date().toISOString().slice(0, 10);
  const first = data.unexplained[0];
  const last = data.unexplained.at(-1);

  return (
    <Stack spacing={2}>
      {first && last ? (
        <Alert
          severity="warning"
          action={
            <Button color="inherit" size="small" onClick={() => setWriting({ from: first, to: last })}>
              Explain These Days
            </Button>
          }
        >
          {data.unexplained.length === 1 ? `You were absent on ${formatDay(first)} with no reason given.` : `${data.unexplained.length} days absent with no reason given, between ${formatDay(first)} and ${formatDay(last)}.`}
        </Alert>
      ) : null}
      <Card>
        <CardHeader
          title="Leave notes"
          subheader={data.class_teacher ? `Read and decided by ${data.class_teacher}, your class teacher` : 'Read and decided by your class teacher'}
          action={
            <Button variant="contained" startIcon={<Send size={15} />} onClick={() => setWriting({ from: today, to: today })}>
              Send a Note
            </Button>
          }
          sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
        />
        {data.notes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 3, pb: 2.5 }}>
            No leave notes yet.
          </Typography>
        ) : (
          <List disablePadding>
            {data.notes.map((n) => (
              <ListItem key={n.id} divider sx={{ px: 3, py: 1.5, gap: 2 }}>
                <Stack sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2">
                    {formatDay(n.from)}
                    {n.to !== n.from ? ` to ${formatDay(n.to)}` : ''} · {n.days} {n.days === 1 ? 'day' : 'days'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {n.reason}
                  </Typography>
                </Stack>
                <EmergeChip label={STATUS[n.status].label} tone={STATUS[n.status].tone} />
                {n.status === 'pending' ? (
                  <Button size="small" color="error" onClick={() => cancel.mutate(n.id, { onSuccess: () => notify('Note withdrawn') })}>
                    Withdraw
                  </Button>
                ) : null}
              </ListItem>
            ))}
          </List>
        )}
      </Card>
      {writing ? <NoteDialog from={writing.from} to={writing.to} classTeacher={data.class_teacher} onClose={() => setWriting(null)} /> : null}
    </Stack>
  );
}
