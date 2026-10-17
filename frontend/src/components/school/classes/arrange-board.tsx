'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import NextLink from 'next/link';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, defaultDropAnimationSideEffects, pointerWithin, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type Modifier } from '@dnd-kit/core';
import { Sparkles, Undo2 } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmergeChip } from '@/components/ui/chip';
import { SearchField } from '@/components/ui/search-field';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useApplyMoves } from '@/hooks/mutation/use-structure';
import { useRecommendation } from '@/hooks/query/use-structure';
import { LIFECYCLE_LABEL, LIFECYCLE_TONE, yearLifecycle } from '@/lib/school/years';
import { paths } from '@/paths';
import type { YearEnrollment } from '@/types/foundation';

import { ArrangeChanges, type StagedMove } from './arrange-changes';
import { ArrangeLane, DragStack, type LaneStudent } from './arrange-lane';
import { ArrangeReview, type StagedGroup } from './arrange-review';
import { NextYearPanel } from './next-year-panel';
import { classHref, shortSection, type StructureBase } from './structure-mode';
import { useStructureContext } from './use-structure-context';
import { useStructureRights } from './use-structure-rights';

const TRAY = '__tray';
const NOTHING: ReadonlySet<string> = new Set();
const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), Math.max(lo, hi));

// The card under the pointer stays inside the part of the board that is on screen.
const keepInside =
  (node: HTMLDivElement | null): Modifier =>
  ({ transform, activeNodeRect, overlayNodeRect }) => {
    if (!node || !activeNodeRect) return transform;
    const b = node.getBoundingClientRect();
    const v = node.closest('main')?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const w = overlayNodeRect?.width ?? activeNodeRect.width;
    const h = overlayNodeRect?.height ?? activeNodeRect.height;
    const left = Math.max(b.left, v.left);
    const right = Math.min(b.right, v.right);
    const top = Math.max(b.top, v.top, document.querySelector('[data-arrange-toolbar]')?.getBoundingClientRect().bottom ?? 0);
    const bottom = Math.min(b.bottom, v.bottom);
    return { ...transform, x: clamp(transform.x, left - activeNodeRect.left, right - w - activeNodeRect.left), y: clamp(transform.y, top - activeNodeRect.top, bottom - h - activeNodeRect.top) };
  };

const byRoll = (a: LaneStudent, b: LaneStudent): number => Number(a.from === null) - Number(b.from === null) || Number(a.row.roll_number ?? 999) - Number(b.row.roll_number ?? 999) || a.row.name.localeCompare(b.row.name);

// Placing a class's students into its sections. Every drag is staged; nothing is saved until the changes are reviewed.
export function ArrangeBoard({ yearId, gradeId, base, personaSlug }: { yearId?: string; gradeId: string; base: StructureBase; personaSlug: string }): React.ReactElement {
  const notify = useToast();
  const { get } = useUrlState();
  const ctx = useStructureContext(yearId, gradeId);
  const apply = useApplyMoves(ctx.year?.id ?? '');
  const [staged, setStaged] = React.useState<ReadonlyMap<string, string | null>>(new Map());
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = React.useState('');
  const [suggest, setSuggest] = React.useState(false);
  const [reviewing, setReviewing] = React.useState(false);
  const [discarding, setDiscarding] = React.useState(false);
  const [dragging, setDragging] = React.useState<{ lead: string; ids: ReadonlySet<string> } | null>(null);
  const [landed, setLanded] = React.useState<ReadonlySet<string>>(NOTHING);
  const [board, setBoard] = React.useState<HTMLDivElement | null>(null);
  const modifiers = React.useMemo(() => [keepInside(board)], [board]);
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }));
  const recommendation = useRecommendation(ctx.year?.id ?? '', gradeId, suggest && Boolean(ctx.year));
  const may = useStructureRights(ctx.mode);

  // Leaving with unsaved moves asks first; the browser owns the wording.
  React.useEffect(() => {
    if (staged.size === 0) return undefined;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [staged.size]);

  if (ctx.isPending || !may.ready) return <WidgetLoading rows={8} />;
  if (ctx.error) return <WidgetError error={ctx.error} onRetry={ctx.refetch} />;
  if (!ctx.year || !ctx.row) return <Alert severity="info" variant="outlined">This class is not part of that academic year.</Alert>;
  const { year, row, mode, pupils } = ctx;
  const life = yearLifecycle(year);
  const back = paths.personaSection(personaSlug, `${classHref(base, gradeId)}?tab=sections`);

  if (mode === 'readOnly') {
    return (
      <Alert severity="info" variant="outlined" action={<Button component={NextLink} href={back} size="small">Back to {row.name}</Button>}>
        {year.name} is closed, so its classes cannot be rearranged.
      </Alert>
    );
  }
  if (!may.structure) {
    return (
      <Alert severity="info" variant="outlined" action={<Button component={NextLink} href={back} size="small">Back to {row.name}</Button>}>
        Placing students in sections is done by the school office.
      </Alert>
    );
  }

  const name = (sectionId: string | null): string => {
    const s = row.sections.find((x) => x.id === sectionId);
    return s ? shortSection(row.name, s.name) : 'Unassigned';
  };
  const students: LaneStudent[] = pupils.map((p) => {
    const at = staged.has(p.id) ? (staged.get(p.id) ?? null) : p.section_id;
    return { row: p, at, from: staged.has(p.id) ? name(p.section_id) : null };
  });
  const lane = (id: string | null): LaneStudent[] => students.filter((s) => s.at === id).sort(byRoll);
  const q = search.trim().toLowerCase();
  const match = (p: YearEnrollment): boolean => !q || p.name.toLowerCase().includes(q) || p.admission_number.toLowerCase().includes(q);

  const stage = (ids: readonly string[], to: string | null): void => {
    setStaged((prev) => {
      const next = new Map(prev);
      for (const id of ids) {
        const original = pupils.find((p) => p.id === id)?.section_id ?? null;
        if (original === to) next.delete(id);
        else next.set(id, to);
      }
      return next;
    });
    setSelected(new Set());
  };
  const toggle = (id: string): void =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const groups: StagedGroup[] = [];
  for (const [id, to] of staged) {
    const p = pupils.find((x) => x.id === id);
    if (!p) continue;
    const key = `${p.section_id ?? TRAY}>${to ?? TRAY}`;
    const group = groups.find((g) => g.key === key) ?? groups[groups.push({ key, from: name(p.section_id), to: name(to), names: [] }) - 1];
    group?.names.push(p.name);
  }
  const focus = get('focus');
  const moves: StagedMove[] = [...staged].flatMap(([id, to]) => {
    const p = pupils.find((x) => x.id === id);
    return p ? [{ id, name: p.name, from: name(p.section_id), to: name(to) }] : [];
  });
  const flash = (ids: readonly string[]): void => {
    setLanded(new Set(ids));
    window.setTimeout(() => setLanded(NOTHING), 900);
  };
  const flow = (laneId: string | null): { arriving: number; leaving: number } => ({
    arriving: [...staged].filter(([, to]) => to === laneId).length,
    leaving: [...staged.keys()].filter((id) => (pupils.find((p) => p.id === id)?.section_id ?? null) === laneId).length,
  });
  const dropTo = (dropId: string): string | null => (dropId === TRAY ? null : dropId);
  const onDragStart = ({ active }: DragStartEvent): void => {
    const lead = String(active.id);
    setDragging({ lead, ids: selected.has(lead) ? new Set(selected) : new Set([lead]) });
  };
  const onDragEnd = ({ over }: DragEndEvent): void => {
    const ids = dragging ? [...dragging.ids] : [];
    setDragging(null);
    if (!over || ids.length === 0) return;
    const to = dropTo(String(over.id));
    const moving = ids.filter((id) => (students.find((s) => s.row.id === id)?.at ?? null) !== to);
    if (moving.length === 0) return;
    stage(moving, to);
    flash(moving);
  };
  const find = (id: string): void => {
    document.querySelector(`[data-student="${id}"]`)?.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    flash([id]);
  };
  const lead = dragging ? students.find((s) => s.row.id === dragging.lead) : undefined;
  const carried = dragging?.ids ?? NOTHING;

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h2" component="h1">
              Arrange {row.name}
            </Typography>
            <EmergeChip label={`${year.name ?? year.code} · ${LIFECYCLE_LABEL[life]}`} tone={LIFECYCLE_TONE[life]} dot={life === 'active'} />
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            Drag students between sections. Click to select several, then drag any one of them.
          </Typography>
        </div>
        <Button variant="outlined" startIcon={<Sparkles size={16} />} onClick={() => setSuggest(true)} disabled={suggest && recommendation.isPending}>
          Suggest a Placement
        </Button>
      </Stack>

      {life === 'draft' ? <NextYearPanel yearId={year.id} gradeId={gradeId} className={row.name} /> : null}

      {suggest && recommendation.data ? (
        <Alert
          severity={recommendation.data.moves.length === 0 ? 'success' : 'info'}
          variant="outlined"
          icon={<Sparkles size={18} />}
          onClose={() => setSuggest(false)}
          action={
            recommendation.data.moves.length > 0 ? (
              <Button
                size="small"
                variant="contained"
                onClick={() => {
                  setStaged((prev) => new Map([...prev, ...recommendation.data.moves.map((m) => [m.enrollment_id, m.to_section_id] as const)]));
                  setSuggest(false);
                }}
              >
                Put It on the Board
              </Button>
            ) : null
          }
        >
          <AlertTitle>Suggested placement</AlertTitle>
          {recommendation.data.summary}
          {recommendation.data.moves.length > 0 ? ` ${recommendation.data.moves.map((m) => `${m.name} to ${m.to_section ?? 'unassigned'}`).join(' · ')}.` : ''}
        </Alert>
      ) : null}

      <Card data-arrange-toolbar="" sx={{ position: { md: 'sticky' }, top: 0, zIndex: 2 }}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1.25 }}>
          <SearchField label="Find a student" value={search} onChange={setSearch} width={240} />
          {selected.size > 0 ? (
            <>
              <Typography variant="body2" color="text.secondary">
                {selected.size} selected
              </Typography>
              <TextField select size="small" label="Move selected to" value="" onChange={(event) => stage([...selected], event.target.value === TRAY ? null : event.target.value)} sx={{ minWidth: 180 }}>
                {row.sections.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {shortSection(row.name, s.name)}
                  </MenuItem>
                ))}
                <MenuItem value={TRAY}>Unassigned</MenuItem>
              </TextField>
              <Button size="small" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </>
          ) : null}
          <Box sx={{ flex: 1 }} />
          <Typography variant="subtitle2" color={staged.size > 0 ? 'text.primary' : 'text.secondary'}>
            {staged.size === 0 ? 'No changes' : `${staged.size} unsaved ${staged.size === 1 ? 'change' : 'changes'}`}
          </Typography>
          <Button startIcon={<Undo2 size={14} />} disabled={staged.size === 0} onClick={() => setDiscarding(true)}>
            Discard
          </Button>
          <Button variant="contained" disabled={staged.size === 0} onClick={() => setReviewing(true)}>
            Review and Save
          </Button>
        </Stack>
      </Card>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        autoScroll={{ threshold: { x: 0, y: 0.14 }, acceleration: 14, canScroll: (el) => !(el instanceof HTMLElement && el.dataset.laneScroll !== undefined) }}
        accessibility={{
          screenReaderInstructions: { draggable: 'Drag a student onto another section with a mouse or a finger. Without one, select students and use Move selected to.' },
          announcements: {
            onDragStart: () => `Picked up ${carried.size > 1 ? `${carried.size} students` : (lead?.row.name ?? 'a student')}.`,
            onDragOver: ({ over }) => (over ? `Over ${name(dropTo(String(over.id)))}.` : 'Not over a section.'),
            onDragEnd: ({ over }) => (over ? `Dropped in ${name(dropTo(String(over.id)))}.` : 'Dropped outside the board; nothing moved.'),
            onDragCancel: () => 'Drag cancelled; nothing moved.',
          },
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <Box ref={setBoard} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 3fr) minmax(0, 9fr)' }, alignItems: 'start', cursor: dragging ? 'grabbing' : undefined }}>
          <Stack spacing={2} sx={{ position: { lg: 'sticky' }, top: { lg: 76 } }}>
            <ArrangeLane dropId={TRAY} tray title="Unassigned" capacity={null} students={lane(null)} selected={selected} dragging={carried} landed={landed} {...flow(null)} match={match} onToggle={toggle} />
            <ArrangeChanges moves={moves} onUndo={(id) => stage([id], pupils.find((p) => p.id === id)?.section_id ?? null)} onFind={find} />
          </Stack>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, alignItems: 'start' }}>
            {row.sections.map((s) => (
              <ArrangeLane
                key={s.id}
                dropId={s.id}
                title={shortSection(row.name, s.name)}
                capacity={s.capacity}
                students={lane(s.id)}
                selected={selected}
                dragging={carried}
                landed={landed}
                {...flow(s.id)}
                match={match}
                focus={focus === s.id}
                onToggle={toggle}
              />
            ))}
          </Box>
        </Box>
        <DragOverlay
          modifiers={modifiers}
          zIndex={1300}
          dropAnimation={still ? null : { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}
        >
          {lead ? <DragStack student={lead} count={carried.size} /> : null}
        </DragOverlay>
      </DndContext>

      {reviewing ? (
        <ArrangeReview
          groups={groups}
          running={mode === 'active'}
          pending={apply.isPending}
          error={apply.error}
          onClose={() => setReviewing(false)}
          onSave={(reason) =>
            apply.mutate(
              { moves: [...staged].map(([enrollment_id, to_section_id]) => ({ enrollment_id, to_section_id })), reason: reason || `Rearranged ${row.name}` },
              {
                onSuccess: (moved) => {
                  notify(`${moved} ${moved === 1 ? 'student' : 'students'} placed in ${row.name}`);
                  setStaged(new Map());
                  setReviewing(false);
                },
              },
            )
          }
        />
      ) : null}
      {discarding ? (
        <ConfirmDialog
          title="Discard the unsaved changes?"
          body={`${staged.size} ${staged.size === 1 ? 'move goes' : 'moves go'} back to how the class stands.`}
          confirmLabel="Discard"
          tone="danger"
          pending={false}
          onConfirm={() => {
            setStaged(new Map());
            setDiscarding(false);
          }}
          onClose={() => setDiscarding(false)}
        />
      ) : null}
    </Stack>
  );
}
