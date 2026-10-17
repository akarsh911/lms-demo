'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowRight, CalendarX2, CircleAlert, ListOrdered, Save, X } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useSaveTermPlan } from '@/hooks/mutation/use-lesson-planner';
import { useTermContext, useTermPlan } from '@/hooks/query/use-lesson-planner';
import { formatDay } from '@/lib/dates';
import { applyChange, buildTermPlan, type TermPlanView } from '@/lib/lesson-planner/term';
import { timelineWeeks } from '@/lib/lesson-planner/timeline';
import type { PlannerOffering, TermContext, TermPlanSettings } from '@/types/lesson-planner';

import { OfferingSelect } from './offering-select';
import { CARD_PAD, INNER_GAP, SECTION_GAP } from './spacing';
import { TermChapters } from './term-chapters';
import { TermClosures } from './term-closures';
import { TermExams } from './term-exams';
import { RibbonLegend, TermRibbon, type PlanRequest } from './term-ribbon';
import { useTermDraft } from './use-term-draft';

const BEHIND_FROM = 2;
const NEXT_LESSON_PERIODS = 3;

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

function nextLesson(view: TermPlanView): PlanRequest | null {
  const next = view.forward.periods.find((p) => p.use.kind === 'chapter');
  if (!next || next.use.kind !== 'chapter') return null;
  const chapterId = next.use.chapterId;
  const remaining = view.chapters.find((c) => c.id === chapterId)?.remaining ?? 1;
  return { chapterId, periods: Math.min(remaining, NEXT_LESSON_PERIODS), firstDate: next.date };
}

function Behind({ view, onPlan }: { view: TermPlanView; onPlan: (request: PlanRequest) => void }): React.ReactElement | null {
  if (view.behind < BEHIND_FROM) return null;
  const next = nextLesson(view);
  return (
    <Card>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 2, px: 3, py: 1.5 }}>
        <Box sx={{ color: 'warning.main', display: 'flex' }}>
          <CircleAlert size={22} aria-hidden />
        </Box>
        <Typography variant="body1" sx={{ flex: '1 1 240px' }} noWrap>
          Behind by {view.behind} periods · {view.plannedToDate} planned, {view.taughtToDate} taught
        </Typography>
        {next ? (
          <Button variant="outlined" size="small" endIcon={<ArrowRight size={14} />} onClick={() => onPlan(next)}>
            Plan next lesson
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}

function Board({ context, saved, picker, onPlan }: { context: TermContext; saved: TermPlanSettings; picker: React.ReactNode; onPlan: (request: PlanRequest) => void }): React.ReactElement {
  const notify = useToast();
  const draft = useTermDraft(saved);
  const save = useSaveTermPlan();
  const [chaptersOpen, setChaptersOpen] = React.useState(false);
  const [closuresAnchor, setClosuresAnchor] = React.useState<HTMLElement | null>(null);
  const { settings, update } = draft;
  const view = React.useMemo(() => buildTermPlan(context, settings), [context, settings]);
  const weeks = React.useMemo(() => timelineWeeks(view, context.week, context.today), [view, context.week, context.today]);

  const moveChapter = (id: string, toIndex: number): void =>
    update((current) => {
      const order = view.chapters.map((c) => c.id).filter((c) => c !== id);
      order.splice(toIndex, 0, id);
      return { ...current, order };
    });

  const needed = view.chapters.reduce((sum, c) => sum + c.remaining, 0);
  const left = view.forward.periods.filter((p) => p.use.kind !== 'revision').length;

  return (
    <Stack spacing={SECTION_GAP}>
      <Behind view={view} onPlan={onPlan} />

      {save.isError ? (
        <Alert severity="error" variant="outlined" role="alert">
          {save.error.message}
        </Alert>
      ) : null}

      <Box sx={{ display: 'grid', gap: SECTION_GAP, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' }, alignItems: 'start' }}>
        <Card component="section" aria-label="Term timeline">
          <CardHeader
            title="Term plan"
            subheader={
              <Stack component="span" direction="row" sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
                <span>
                  {view.term.name}, {formatDay(view.term.start)} to {formatDay(view.term.end)}
                </span>
                <RibbonLegend />
              </Stack>
            }
            action={
              <>
                <Tooltip title="Chapters" arrow>
                  <IconButton size="small" aria-label="Chapters" onClick={() => setChaptersOpen(true)}>
                    <ListOrdered size={18} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Closed days" arrow>
                  <IconButton size="small" aria-label="Closed days" aria-haspopup="dialog" onClick={(event) => setClosuresAnchor(event.currentTarget)}>
                    <Badge badgeContent={settings.closures.length} color="primary">
                      <CalendarX2 size={18} />
                    </Badge>
                  </IconButton>
                </Tooltip>
                {draft.dirty ? (
                  <Button variant="outlined" size="small" onClick={draft.reset} disabled={save.isPending}>
                    Discard
                  </Button>
                ) : null}
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<Save size={14} />}
                  disabled={!draft.dirty}
                  loading={save.isPending}
                  onClick={() =>
                    save.mutate(settings, {
                      onSuccess: () => {
                        draft.reset();
                        notify('Term plan saved');
                      },
                    })
                  }
                >
                  Save
                </Button>
              </>
            }
          />
          <CardContent>
            <Stack spacing={CARD_PAD}>
              <CardToolbar start={picker} summary={`${needed} to teach, ${left} periods left`}>
                <TextField select size="small" label="Term" value={view.term.id} onChange={(e) => update((c) => ({ ...c, term_id: e.target.value, start_date: context.terms.find((t) => t.id === e.target.value)?.start ?? c.start_date }))} sx={{ width: 110 }}>
                  {context.terms.map((term) => (
                    <MenuItem key={term.id} value={term.id}>
                      {term.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField select size="small" label="Resume at" value={settings.first_chapter_id ?? ''} onChange={(e) => update((c) => ({ ...c, first_chapter_id: e.target.value, order: [] }))} sx={{ width: { xs: '100%', sm: 200 } }}>
                  {context.chapters.map((chapter) => (
                    <MenuItem key={chapter.id} value={chapter.id}>
                      {chapter.sequence}. {chapter.title}
                    </MenuItem>
                  ))}
                </TextField>
              </CardToolbar>
              <TermRibbon weeks={weeks} view={view} onPlan={onPlan} />
            </Stack>
          </CardContent>
        </Card>

        <TermExams
          view={view}
          actions={{
            onMove: (examId, start) => update((c) => ({ ...c, exam_starts: start ? { ...c.exam_starts, [examId]: start } : without(c.exam_starts, examId) })),
            onRevision: (examId, periods) => update((c) => ({ ...c, revision: { ...c.revision, [examId]: periods } })),
            onExtra: (examId, periods) => update((c) => ({ ...c, extra_periods: { ...c.extra_periods, [examId]: periods } })),
            onUndefer: (examId, chapterId) => update((c) => ({ ...c, deferred: { ...c.deferred, [examId]: (c.deferred[examId] ?? []).filter((id) => id !== chapterId) } })),
            onFix: (fix) => update((c) => applyChange(c, fix.change)),
          }}
        />
      </Box>

      <Drawer anchor="right" open={chaptersOpen} onClose={() => setChaptersOpen(false)} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 420 }, p: CARD_PAD } } }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', pb: INNER_GAP }}>
          <Typography variant="h4" component="h2">
            Chapters
          </Typography>
          <IconButton aria-label="Close" onClick={() => setChaptersOpen(false)}>
            <X size={18} />
          </IconButton>
        </Stack>
        <TermChapters view={view} actions={{ onMove: moveChapter, onWeight: (id, weight) => update((c) => ({ ...c, weights: { ...c.weights, [id]: weight } })) }} />
      </Drawer>

      <Popover open={closuresAnchor !== null} anchorEl={closuresAnchor} onClose={() => setClosuresAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <TermClosures
          term={view.term}
          closures={settings.closures}
          onAdd={(closure) => update((c) => ({ ...c, closures: [...c.closures, closure] }))}
          onRemove={(date) => update((c) => ({ ...c, closures: c.closures.filter((x) => x.date !== date) }))}
        />
      </Popover>
    </Stack>
  );
}

export function TermPlan({
  offerings,
  offeringId,
  onOffering,
  onPlan,
}: {
  offerings: readonly PlannerOffering[];
  offeringId: string | null;
  onOffering: (offeringId: string) => void;
  onPlan: (offering: PlannerOffering, request: PlanRequest) => void;
}): React.ReactElement {
  const offering = offerings.find((o) => o.offering_id === offeringId) ?? null;
  const context = useTermContext(offering?.offering_id ?? null);
  const saved = useTermPlan(offering?.offering_id ?? null);
  const picker = <OfferingSelect offerings={offerings} selected={offering} onSelect={onOffering} />;

  if (offering && offering.curriculum_id && context.data && saved.data) {
    return <Board key={`${offering.offering_id}-${saved.data.saved_at ?? 'new'}`} context={context.data} saved={saved.data} picker={picker} onPlan={(request) => onPlan(offering, request)} />;
  }

  return (
    <Card>
      <CardHeader title="Term plan" subheader="Chapters paced around holidays and examinations" />
      <CardContent>
        <Stack spacing={CARD_PAD}>
          <CardToolbar start={picker} />
          {!offering ? <EmptyState title="Pick a class" /> : null}
          {offering && !offering.curriculum_id ? <EmptyState title="No curriculum for this subject" /> : null}
          {offering?.curriculum_id && (context.isPending || saved.isPending) ? <WidgetLoading rows={6} /> : null}
          {context.isError ? <WidgetError error={context.error} onRetry={() => void context.refetch()} /> : null}
          {saved.isError ? <WidgetError error={saved.error} onRetry={() => void saved.refetch()} /> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
