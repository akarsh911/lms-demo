'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ArrowLeft, CheckCircle2, Pencil, Printer, Save, Trash2, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RowMenu } from '@/components/ui/row-menu';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useDeleteLessonPlan, useUpdateLessonPlan } from '@/hooks/mutation/use-lesson-planner';
import { useLessonPlan } from '@/hooks/query/use-lesson-planner';
import { formatRelativeTime } from '@/lib/dates';
import { paths } from '@/paths';
import type { LessonPeriod, LessonPlan } from '@/types/lesson-planner';

import { PlanEditor } from './plan-editor';
import { PlanHeader } from './plan-header';
import { INNER_GAP, SECTION_GAP } from './spacing';
import { TaughtDialog } from './taught-dialog';
import type { ResourceResolver } from './use-resource-links';

interface Edits {
  title: string;
  periods: LessonPeriod[];
}

function TaughtPanel({ period, onOpen }: { period: LessonPeriod; onOpen: () => void }): React.ReactElement | null {
  const theme = useTheme();
  if (!period.slot) return null;
  if (!period.taught) {
    return (
      <div>
        <Button size="small" variant="outlined" startIcon={<CheckCircle2 size={16} />} onClick={onOpen}>
          Mark taught
        </Button>
      </div>
    );
  }
  return (
    <Stack direction="row" spacing={INNER_GAP} sx={{ p: INNER_GAP, borderRadius: 1, bgcolor: theme.tints.green, alignItems: 'flex-start' }}>
      <CheckCircle2 size={16} color={theme.onTint.green} aria-hidden style={{ flex: 'none', marginTop: 2 }} />
      <Typography variant="body2" sx={{ flex: 1, color: theme.onTint.green }}>
        <Box component="span" sx={{ fontWeight: 700 }}>
          Taught {formatRelativeTime(period.taught.taught_at)}
        </Box>
        {period.taught.reflection ? `: ${period.taught.reflection}` : ''}
      </Typography>
      <Tooltip title="Edit reflection">
        <IconButton size="small" aria-label="Edit reflection" onClick={onOpen} sx={{ color: theme.onTint.green }}>
          <Pencil size={14} />
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

const withTaught = (periods: readonly LessonPeriod[], from: LessonPlan): LessonPeriod[] =>
  periods.map((period) => ({ ...period, taught: from.periods.find((p) => p.id === period.id)?.taught ?? null }));

export function SavedPlan({
  planId,
  personaSlug,
  resolve,
  onBack,
}: {
  planId: string;
  personaSlug: string;
  resolve: ResourceResolver;
  onBack: () => void;
}): React.ReactElement {
  const notify = useToast();
  const router = useRouter();
  const plan = useLessonPlan(planId);
  const update = useUpdateLessonPlan();
  const remove = useDeleteLessonPlan();
  const [edits, setEdits] = React.useState<Edits | null>(null);
  const [marking, setMarking] = React.useState<LessonPeriod | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const back = (
    <Button variant="text" startIcon={<ArrowLeft size={16} />} onClick={onBack}>
      All plans
    </Button>
  );

  if (plan.isPending) return <WidgetLoading rows={6} />;
  if (plan.isError) {
    return (
      <Stack spacing={SECTION_GAP} sx={{ alignItems: 'flex-start' }}>
        <WidgetError error={plan.error} onRetry={() => void plan.refetch()} />
        {back}
      </Stack>
    );
  }

  const saved = plan.data;
  const title = edits?.title ?? saved.title;
  const periods = edits?.periods ?? saved.periods;
  const edit = (change: Partial<Edits>): void => setEdits((current) => ({ title: current?.title ?? saved.title, periods: current?.periods ?? saved.periods, ...change }));

  const save = (): void =>
    update.mutate(
      { id: saved.id, patch: { title, periods } },
      {
        onSuccess: () => {
          setEdits(null);
          notify('Plan saved');
        },
      },
    );

  return (
    <Stack spacing={SECTION_GAP}>
      <PlanHeader
        plan={{ ...saved, periods }}
        title={title}
        onTitle={(next) => edit({ title: next })}
        status={saved.status}
        author={saved.author_name}
        actions={
          <>
            {back}
            <RowMenu
              label={`More actions for ${saved.title}`}
              trigger="button"
              actions={[
                { label: 'Print or save as PDF', icon: <Printer size={16} />, onSelect: () => router.push(paths.lessonPlanPrint(personaSlug, saved.id)) },
                { label: 'Discard changes', icon: <Undo2 size={16} />, onSelect: () => setEdits(null), disabled: !edits || update.isPending, hint: 'Nothing changed yet' },
                { label: 'Delete plan', icon: <Trash2 size={16} />, onSelect: () => setDeleting(true), destructive: true },
              ]}
            />
            <Button variant="contained" startIcon={<Save size={16} />} loading={update.isPending} disabled={!edits || title.trim() === ''} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        {update.isError ? (
          <Alert severity="error" variant="outlined" role="alert">
            {update.error.message}
          </Alert>
        ) : null}
      </PlanHeader>

      <PlanEditor
        basis={saved}
        periods={periods}
        onChange={(change) =>
          setEdits((current) => ({ title: current?.title ?? saved.title, periods: change(current?.periods ?? saved.periods) }))
        }
        resolve={resolve}
        editable
        periodExtras={(period) => <TaughtPanel period={period} onOpen={() => setMarking(period)} />}
      />

      {marking ? (
        <TaughtDialog
          plan={saved}
          period={marking}
          onClose={() => setMarking(null)}
          onDone={(next) => setEdits((current) => (current ? { ...current, periods: withTaught(current.periods, next) } : null))}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title="Delete plan?"
          body={`${saved.title} and its reflections will be removed.`}
          confirmLabel="Delete plan"
          pending={remove.isPending}
          error={remove.error}
          onClose={() => setDeleting(false)}
          onConfirm={() =>
            remove.mutate(saved.id, {
              onSuccess: () => {
                notify('Plan deleted');
                onBack();
              },
            })
          }
        />
      ) : null}
    </Stack>
  );
}
