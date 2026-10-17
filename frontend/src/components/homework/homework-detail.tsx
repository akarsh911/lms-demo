'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { BellRing, CalendarClock, Lock, LockOpen, Pencil, Send, Trash2 } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { FormDialog } from '@/components/ui/form-dialog';
import { RowMenu } from '@/components/ui/row-menu';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useCloseHomework, useDeleteHomework, useExtendHomework, useRemindMissing, useReturnAll } from '@/hooks/mutation/use-homework';
import { useHomework } from '@/hooks/query/use-homework';
import { formatMoment } from '@/lib/dates';
import { paths } from '@/paths';
import type { HomeworkDetail as Detail } from '@/types/homework';

import { HomeworkBrief } from './homework-brief';
import { HomeworkComposer } from './homework-composer';
import { STATE, TYPE } from './homework-meta';
import { HomeworkResults } from './homework-results';
import { WorkGrid } from './work-grid';

const TABS = ['work', 'brief', 'results'] as const;
type DetailTab = (typeof TABS)[number];
const LABEL: Readonly<Record<DetailTab, string>> = { work: 'Submissions', brief: 'Brief', results: 'Results' };

const local = (iso: string): string => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function ExtendDialog({ homework, onClose }: { homework: Detail; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const extend = useExtendHomework(homework.id);
  const [due, setDue] = React.useState(() => local(new Date(Math.max(Date.parse(homework.due_at), Date.now()) + 2 * 86_400_000).toISOString()));
  return (
    <FormDialog
      open
      title="Extend the due date"
      description={`Now due ${formatMoment(homework.due_at)}. Work already handed in keeps its time.`}
      submitLabel="Extend"
      pending={extend.isPending}
      error={extend.error}
      canSubmit={Boolean(due)}
      onClose={onClose}
      onSubmit={() => extend.mutate(new Date(due).toISOString(), { onSuccess: (h) => (notify(`Now due ${formatMoment(h.due_at)}`), onClose()) })}
    >
      <TextField type="datetime-local" label="New due time" value={due} onChange={(e) => setDue(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} autoFocus />
    </FormDialog>
  );
}

// One assignment: who has handed in, marking, what was set, and how it went.
export function HomeworkDetailView({ id, personaSlug }: { id: string; personaSlug: string }): React.ReactElement {
  const router = useRouter();
  const notify = useToast();
  const { get, put } = useUrlState();
  const query = useHomework(id);
  const close = useCloseHomework(id);
  const remind = useRemindMissing(id);
  const returnAll = useReturnAll(id);
  const remove = useDeleteHomework();
  const [dialog, setDialog] = React.useState<'edit' | 'extend' | 'delete' | null>(null);
  const tab = TABS.find((t) => t === get('tab')) ?? 'work';

  if (query.isPending) return <WidgetLoading rows={8} />;
  if (query.isError) return <WidgetError error={query.error} onRetry={() => void query.refetch()} />;
  const h = query.data;
  const waiting = h.work.filter((w) => w.status === 'missing' || w.status === 'pending').length;
  const unreturned = h.work.filter((w) => w.status === 'graded').length;
  const live = h.state !== 'draft' && h.state !== 'scheduled';

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h2" component="h1">
              {h.title}
            </Typography>
            <EmergeChip label={STATE[h.state].label} tone={STATE[h.state].tone} dot={h.state === 'open'} />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mt: 0.75 }}>
            <EmergeChip label={TYPE[h.type].label} tone={TYPE[h.type].tone} />
            <Typography variant="body1" color="text.secondary">
              {h.subject} · {h.students_only === null ? h.section : `${h.students_only} chosen students in ${h.section}`} · {h.teacher} · due {formatMoment(h.due_at)}
            </Typography>
          </Stack>
        </div>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          {live && waiting > 0 && h.state !== 'closed' ? (
            <Button variant="outlined" startIcon={<BellRing size={16} />} loading={remind.isPending} onClick={() => remind.mutate(undefined, { onSuccess: (n) => notify(`Reminder sent to ${n} students and their parents`) })}>
              Remind {waiting}
            </Button>
          ) : null}
          {unreturned > 0 ? (
            <Button variant="contained" startIcon={<Send size={16} />} loading={returnAll.isPending} onClick={() => returnAll.mutate(undefined, { onSuccess: (n) => notify(`${n} marked pieces returned to students`) })}>
              Return {unreturned} Graded
            </Button>
          ) : null}
          <Button variant="outlined" startIcon={<Pencil size={16} />} onClick={() => setDialog('edit')}>
            Edit
          </Button>
          <RowMenu
            trigger="button"
            label="More actions"
            actions={[
              { label: 'Extend the due date', icon: <CalendarClock size={16} />, onSelect: () => setDialog('extend'), disabled: h.state === 'draft' },
              h.state === 'closed'
                ? { label: 'Reopen for work', icon: <LockOpen size={16} />, onSelect: () => close.mutate(false, { onSuccess: () => notify('Reopened') }) }
                : { label: 'Close: stop taking work', icon: <Lock size={16} />, onSelect: () => close.mutate(true, { onSuccess: () => notify('Closed; no more work is taken') }), disabled: !live },
              { label: 'Delete draft', icon: <Trash2 size={16} />, onSelect: () => setDialog('delete'), disabled: h.state !== 'draft', destructive: true, hint: h.state !== 'draft' ? 'Only a draft can be deleted' : undefined },
            ]}
          />
        </Stack>
      </Stack>

      {live ? (
        <FactStrip
          facts={[
            { label: 'Handed in', value: `${h.submitted} / ${h.assigned}`, note: h.late > 0 ? `${h.late} late` : 'None late' },
            { label: 'To grade', value: h.submitted - h.graded, note: unreturned > 0 ? `${unreturned} graded, not yet returned` : h.graded === 0 ? 'Nothing marked yet' : 'All marked work returned' },
            { label: 'Not handed in', value: waiting, note: h.reminders_sent > 0 ? `Reminded ${h.reminders_sent} ${h.reminders_sent === 1 ? 'time' : 'times'}` : h.state === 'open' ? 'Still time to hand in' : 'Past the due time' },
            { label: 'Average', value: h.average === null ? '—' : `${h.average}%`, note: `Of ${h.max_marks} marks` },
          ]}
        />
      ) : (
        <FactStrip
          facts={[
            { label: 'For', value: h.assigned, note: h.students_only === null ? `All of ${h.section}` : 'Chosen students' },
            { label: h.state === 'draft' ? 'Not set yet' : 'Opens', value: h.state === 'draft' ? 'Draft' : formatMoment(h.available_from), note: h.state === 'draft' ? 'Students cannot see it' : 'Students see it then' },
            { label: 'Due', value: formatMoment(h.due_at), note: h.late_allowed ? 'Late work accepted' : 'No late work' },
          ]}
        />
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, next: DetailTab) => put({ tab: next === 'work' ? null : next })} aria-label="Parts of this assignment">
          {TABS.map((t) => (
            <Tab key={t} value={t} label={LABEL[t]} />
          ))}
        </Tabs>
      </Box>
      {tab === 'work' ? <WorkGrid homework={h} editable={h.state !== 'draft'} /> : null}
      {tab === 'brief' ? <HomeworkBrief homework={h} /> : null}
      {tab === 'results' ? <HomeworkResults homework={h} /> : null}

      {dialog === 'edit' ? <HomeworkComposer homework={h} onClose={() => setDialog(null)} /> : null}
      {dialog === 'extend' ? <ExtendDialog homework={h} onClose={() => setDialog(null)} /> : null}
      {dialog === 'delete' ? (
        <ConfirmDialog
          title="Delete this draft?"
          body="It was never set, so no student has seen it."
          confirmLabel="Delete"
          tone="danger"
          pending={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(h.id, { onSuccess: () => (notify('Draft deleted'), router.replace(paths.personaSection(personaSlug, 'assignments?view=draft'))) })}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </Stack>
  );
}
