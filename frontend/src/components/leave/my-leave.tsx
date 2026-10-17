'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CalendarPlus, CalendarRange } from 'lucide-react';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useCancelLeave } from '@/hooks/mutation/use-leave';
import { useIdentity } from '@/hooks/query/use-identity';
import { useMyLeave } from '@/hooks/query/use-my-leave';
import { todayInSchool } from '@/lib/classroom/week';
import type { LeaveStatus, StaffLeave } from '@/types/leave';

import { ApplyLeaveDialog, KIND_LABEL } from './apply-leave-dialog';

const STATUS: Readonly<Record<LeaveStatus, { label: string; tone: ChipTone }>> = {
  pending: { label: 'Waiting for the office', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  declined: { label: 'Declined', tone: 'red' },
  cancelled: { label: 'Withdrawn', tone: 'grey' },
};

const longDate = (iso: string): string => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const span = (l: StaffLeave): string => (l.from === l.to ? `${longDate(l.from)}${l.half_day ? ', half day' : ''}` : `${longDate(l.from)} to ${longDate(l.to)}`);

// A teacher's leave: what is left this year, what is waiting, and what was decided.
export function MyLeave(): React.ReactElement {
  const notify = useToast();
  const identity = useIdentity();
  const today = todayInSchool(identity.data?.school?.timezone);
  const { data, isPending, isError, error, refetch } = useMyLeave();
  const cancel = useCancelLeave();
  const [applying, setApplying] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState<StaffLeave | null>(null);

  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  const waiting = data.requests.filter((r) => r.status === 'pending');

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          ...data.balance.map((b) => ({ label: `${KIND_LABEL[b.kind]} leave`, value: `${b.allowed - b.used} left`, note: `${b.used} of ${b.allowed} days used or asked for` })),
          { label: 'Waiting', value: waiting.length, note: waiting.length > 0 ? 'With the office' : 'Nothing pending' },
        ]}
      />
      <Card>
        <CardHeader
          title="My requests"
          subheader="Newest first"
          action={
            <Button variant="contained" startIcon={<CalendarPlus size={16} />} onClick={() => setApplying(true)}>
              Apply for Leave
            </Button>
          }
          sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
        />
        {data.requests.length === 0 ? (
          <EmptyState art={<CalendarRange size={36} aria-hidden />} title="No leave this year" body="Requests you send appear here with the office's answer." />
        ) : (
          <List disablePadding>
            {data.requests.map((l) => {
              const ahead = l.from > today && (l.status === 'pending' || l.status === 'approved');
              return (
                <ListItem key={l.id} divider sx={{ gap: 2, px: 3, py: 1.75, alignItems: 'flex-start', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                  <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Typography variant="subtitle1">{span(l)}</Typography>
                      <EmergeChip label={KIND_LABEL[l.kind]} tone="grey" />
                    </Stack>
                    <Typography variant="body2">{l.reason}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {l.days} {l.days === 1 ? 'school day' : 'school days'} · {l.lessons} {l.lessons === 1 ? 'lesson' : 'lessons'} to cover
                      {l.note ? ` · Office: ${l.note}` : ''}
                    </Typography>
                  </Stack>
                  <Stack spacing={1} sx={{ alignItems: { sm: 'flex-end' }, flexShrink: 0 }}>
                    <EmergeChip label={STATUS[l.status].label} tone={STATUS[l.status].tone} dot />
                    {ahead ? (
                      <Button size="small" variant="outlined" onClick={() => setWithdrawing(l)}>
                        Withdraw
                      </Button>
                    ) : null}
                  </Stack>
                </ListItem>
              );
            })}
          </List>
        )}
      </Card>
      {applying ? <ApplyLeaveDialog today={today} balance={data.balance} onClose={() => setApplying(false)} /> : null}
      {withdrawing ? (
        <ConfirmDialog
          title="Withdraw this request?"
          body={`${span(withdrawing)} goes back to a normal working ${withdrawing.from === withdrawing.to ? 'day' : 'stretch'}.`}
          confirmLabel="Withdraw"
          tone="danger"
          pending={cancel.isPending}
          error={cancel.error}
          onConfirm={() => cancel.mutate(withdrawing.id, { onSuccess: () => (notify('Request withdrawn'), setWithdrawing(null)) })}
          onClose={() => setWithdrawing(null)}
        />
      ) : null}
    </Stack>
  );
}
