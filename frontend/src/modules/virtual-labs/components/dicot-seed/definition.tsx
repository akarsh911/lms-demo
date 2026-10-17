'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Clock, HandMetal } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, RichText, Segmented } from '@/components/ui';
import { dicotSeedEngine } from '@labs/lib/dicot-seed/engine';
import {
  CONCL,
  LABELS,
  PART_NAME,
  POOL_DOES,
  POOL_IS,
  STEP,
  TABLE_ROWS,
  type LabelId,
} from '@labs/lib/dicot-seed/marking';
import type { DicotSeedAction } from '@labs/lib/dicot-seed/reducer';
import {
  PEEL_SOFT,
  SPECIES,
  SPLIT_SOFT,
  exposed,
  germState,
  softness,
  swellFrac,
  swollenPercent,
  type PartId,
  type Seed,
} from '@labs/lib/dicot-seed/seed-model';
import { placedCount, tableFilled, type DicotSeedState } from '@labs/lib/dicot-seed/state';
import { dicotSeedTeach } from '@labs/lib/dicot-seed/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { ObservationTable } from '../observation-table';
import { TeachSections } from '../teach-sections';

import { DicotBench } from './bench';
import { PickField } from './pick-field';
import { SeedLens, type LensPin } from './seed-lens';
import { ImbibitionFigure, SeedCoatFigure, SplitSeedFigure } from './teach-figures';
import { createDicotSeedTours } from './tours';
import { useDicotSeedTrainer } from './trainer';

type View = BenchViewProps<DicotSeedState, DicotSeedAction>;

/**
 * The dicot seed bench: everything about this practical that is drawn.
 *
 * The engine decides what happens; the shared workspace draws the frame, the
 * step strip, the assistant, the notebook, the viva and the marks. What is
 * genuinely this practical's own is here: the bench and its seeds, what is in
 * the student's hand, the one thing the current step asks for, the magnified
 * lens docked beside it, and the two notebook panels.
 */

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<DicotSeedState, DicotSeedAction>): React.ReactElement {
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <DicotBench
        dishes={state.dishes}
        specimen={state.specimen}
        germ={state.germ}
        clock={state.clock}
        held={state.held}
        foundMicropyle={state.found.micropyle}
        pulse={highlights}
        onSvg={onStageElement}
        onTakeSeed={(sp) => dispatch({ type: 'takeSeed', sp, now: now() })}
        onTapBeaker={() => dispatch({ type: 'tapBeaker', now: now() })}
        onTapGerm={() => dispatch({ type: 'tapGerm', now: now() })}
        onTapTile={() => dispatch({ type: 'tapTile', now: now() })}
        onHold={(held) => dispatch({ type: 'hold', held })}
        onTapFigure={(p) => dispatch({ type: 'tapFigure', view: 'live', x: p.x, y: p.y, now: now() })}
      />
    </Box>
  );
}

const BENCH_BUTTON = {
  flex: 'none',
  color: apparatus.benchInk,
  borderColor: 'rgba(255,255,255,.16)',
  '&:hover': { backgroundColor: 'rgba(255,255,255,.07)', borderColor: 'rgba(255,255,255,.28)' },
  '&.Mui-disabled': { color: apparatus.benchInkMuted, borderColor: 'rgba(255,255,255,.08)' },
} as const;

function handsLine(state: DicotSeedState): string {
  const h = state.held;
  if (!h) return 'Hands free — tap a dish for a seed, or a tool to pick it up';
  if (h.kind === 'seed') return `Holding a dry ${SPECIES[h.sp].short} seed — tap the beaker to soak it`;
  if (h.kind === 'wet') return 'Holding the soaked seed — tap the white tile to put it down, or the cotton to sow it';
  if (h.kind === 'tool') return `Holding the ${h.id} — tap the seed on the tile`;
  return `Placing the label “${h.id}” — tap the part it belongs to in the lens`;
}

/** What is in the student's hand, and the lab clock the soaking runs on. */
function Controls({ state, dispatch }: View): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      data-tour="seed-hands"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        backgroundColor: apparatus.benchEdge,
        color: apparatus.benchInk,
        fontSize: theme.band.type.base - 1,
      }}
    >
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <HandMetal size={14} aria-hidden="true" />
        <Box component="span" role="status" sx={{ fontWeight: state.held ? 700 : 400 }}>
          {handsLine(state)}
        </Box>
      </Box>
      <Box sx={{ flex: 1 }} />
      <Box
        component="span"
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontVariantNumeric: 'tabular-nums' }}
      >
        <Clock size={14} aria-hidden="true" />
        Lab clock {Math.round(state.clock * 10) / 10} h
      </Box>
      <Button
        size="small"
        variant="outlined"
        disabled={!state.held}
        onClick={() => dispatch({ type: 'hold', held: null })}
        sx={BENCH_BUTTON}
      >
        Put down
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The lens, docked beside the task
// ---------------------------------------------------------------------------

/** Which drawing the lens is showing, and of which seed. */
function lensSubject(state: DicotSeedState): { seed: Seed; view: 'ext' | 'cut' | 'live' } | null {
  if (state.step >= STEP.label && state.dissected) return { seed: state.dissected, view: state.lens };
  const sd = state.specimen;
  return sd && sd.onTile ? { seed: sd, view: 'live' } : null;
}

function lensCaption(state: DicotSeedState): React.ReactNode {
  if (state.step === STEP.outside) {
    return (
      <RichText
        text={
          'Under the lens. Along the **flattened edge** there is a whitish oval scar, and a short way along it a ' +
          'pinprick. Tap each one to identify it.'
        }
      />
    );
  }
  if (state.step === STEP.coat || state.step === STEP.split) {
    return (
      <RichText
        text={
          'The specimen, magnified. Everything you do to it with a tool happens on the bench; this is where you look ' +
          'at the result.'
        }
      />
    );
  }
  if (state.step === STEP.label) {
    return state.labelGrade ? (
      <RichText text="Marked. A **red pin** says what was really underneath it — that is the part you were pointing at." />
    ) : (
      <RichText
        text={
          'Pick a label, then tap the part it names. A pin is marked against **what is actually underneath it**, so ' +
          'near enough is not enough.'
        }
      />
    );
  }
  if (state.step === STEP.table) {
    const row = TABLE_ROWS[state.selRow];
    return row ? `The ring is on the ${PART_NAME[row.id]} — the row you are filling in.` : null;
  }
  return null;
}

function Aside({ state, dispatch, now, maxWidth }: View & { maxWidth: number }): React.ReactElement | null {
  const subject = lensSubject(state);
  if (!subject) return null;

  const grade = state.labelGrade;
  const pins: LensPin[] = LABELS.flatMap((id) => {
    const pin = state.labels[id];
    if (!pin || pin.fig !== subject.view) return [];
    const g = grade?.[id];
    return [{ id, at: { x: pin.x, y: pin.y }, ok: g ? g.ok : null, got: g ? g.got : null }];
  });

  const highlight: PartId | null =
    state.step === STEP.table ? (TABLE_ROWS[state.selRow]?.id ?? null) : null;

  return (
    <Box>
      {state.step >= STEP.label && state.dissected ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.75 }}>
          <Segmented
            ariaLabel="Which drawing the lens shows"
            value={state.lens}
            onChange={(view) => dispatch({ type: 'setLens', view })}
            options={[
              { value: 'ext' as const, label: 'As you found it' },
              { value: 'cut' as const, label: 'Split open' },
            ]}
          />
        </Box>
      ) : null}
      <SeedLens
        seed={subject.seed}
        view={subject.view}
        showMicropyle={state.found.micropyle}
        pins={pins}
        highlight={highlight}
        caption={lensCaption(state)}
        maxWidth={maxWidth}
        tourTag="seed-lens"
        onTap={(p) => dispatch({ type: 'tapFigure', view: subject.view, x: p.x, y: p.y, now: now() })}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The current step, and its one input
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography
      component="h3"
      sx={{ fontWeight: 800, fontSize: theme.band.type.h4, color: theme.brand.ink, lineHeight: 1.25 }}
    >
      {children}
    </Typography>
  );
}

function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography
      component="p"
      sx={{ m: 0, mt: 0.5, color: theme.brand.sub, fontSize: theme.band.type.base - 1, textWrap: 'pretty' }}
    >
      {children}
    </Typography>
  );
}

function Fields({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>{children}</Box>
  );
}

function SoakTask({ state, dispatch }: View): React.ReactElement {
  const sd = state.specimen;
  const f = sd ? swellFrac(sd.h) : 0;
  const sf = sd ? softness(sd.h) : 0;

  return (
    <>
      <SectionTitle>Soak a seed</SectionTitle>
      <Hint>
        <RichText
          text={
            'Three dicot seeds are on the bench — they differ only in size and shape, so take whichever you like. A dry ' +
            'seed is as hard as a pebble and **shatters** instead of opening. Water gets in through the micropyle, ' +
            'softens the coat and swells the cotyledons: leave it **overnight**.'
          }
        />
      </Hint>
      <Fields>
        {sd ? (
          <>
            <EmergeChip label={SPECIES[sd.sp].short} />
            <EmergeChip
              tone={f >= 0.88 ? 'green' : f >= 0.6 ? 'amber' : 'red'}
              label={`soaked ${Math.round(sd.h * 10) / 10} h`}
            />
            <EmergeChip tone={sf >= SPLIT_SOFT ? 'green' : 'red'} label={sf >= SPLIT_SOFT ? 'coat soft' : 'coat hard'} />
          </>
        ) : (
          <EmergeChip tone="red" label="no seed yet" />
        )}
      </Fields>
      <Fields>
        <Button variant="outlined" color="inherit" disabled={state.pending > 0} onClick={() => dispatch({ type: 'wait', hours: 2 })}>
          Wait 2 h
        </Button>
        <Button variant="contained" disabled={state.pending > 0} onClick={() => dispatch({ type: 'wait', hours: 12 })}>
          Wait 12 h
        </Button>
        {sd?.inWater ? (
          <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'tapBeaker', now: Date.now() })}>
            Lift it out
          </Button>
        ) : null}
      </Fields>
    </>
  );
}

function OutsideTask({ state, dispatch, now }: View): React.ReactElement {
  return (
    <>
      <SectionTitle>Examine the outside</SectionTitle>
      <Hint>
        <RichText
          text={
            'Two things are on the coat and **nowhere else**: the **hilum**, the scar where the seed was joined to the ' +
            'pod, and the **micropyle**, the pore beside it. Find them now — they come off with the testa.'
          }
        />
      </Hint>
      <Fields>
        <EmergeChip tone={state.found.hilum ? 'green' : 'grey'} label={`${state.found.hilum ? '✓ ' : ''}hilum`} />
        <EmergeChip
          tone={state.found.micropyle ? 'green' : 'grey'}
          label={`${state.found.micropyle ? '✓ ' : ''}micropyle`}
        />
        <EmergeChip
          tone={state.misses > 2 ? 'amber' : 'grey'}
          label={`${state.misses} stray tap${state.misses === 1 ? '' : 's'}`}
        />
        {state.found.micropyle ? (
          <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'press', now: now() })}>
            Press the seed
          </Button>
        ) : null}
      </Fields>
    </>
  );
}

function CoatTask({ state, dispatch, now }: View): React.ReactElement {
  const sd = state.specimen;
  const ready = softness(sd ? sd.h : 0) >= PEEL_SOFT;
  return (
    <>
      <SectionTitle>Remove the seed coat</SectionTitle>
      <Hint>
        <RichText
          text={
            'On a properly soaked seed the testa slips off whole; on one that has not drunk enough it tears into flakes ' +
            'and stays put. The hilum and the micropyle go with it — which is why you looked at them first.'
          }
        />
      </Hint>
      <Fields>
        <Button variant="contained" onClick={() => dispatch({ type: 'useTool', id: 'forceps', now: now() })}>
          Peel with the forceps
        </Button>
        <EmergeChip tone={ready ? 'green' : 'red'} label={ready ? 'coat ready to peel' : 'coat too hard'} />
        {state.tornCount ? (
          <EmergeChip tone="red" label={`${state.tornCount} coat${state.tornCount === 1 ? '' : 's'} torn`} />
        ) : null}
        {sd && sd.coat && !sd.ruined ? (
          <Button variant="text" color="inherit" onClick={() => dispatch({ type: 'press', now: now() })}>
            Press the seed
          </Button>
        ) : null}
      </Fields>
    </>
  );
}

function SplitTask({ state, dispatch, now }: View): React.ReactElement {
  const sd = state.specimen;
  return (
    <>
      <SectionTitle>Split it open</SectionTitle>
      <Hint>
        <RichText
          text={
            'A dicot seed comes apart along a **natural plane** between its two cotyledons: you part it with the needle, ' +
            'you do not cut it. The blade goes straight across the cotyledons — and through the embryo axis with them.'
          }
        />
      </Hint>
      <Fields>
        <Button variant="contained" onClick={() => dispatch({ type: 'useTool', id: 'needle', now: now() })}>
          Part it with the needle
        </Button>
        <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'useTool', id: 'blade', now: now() })}>
          Use the blade
        </Button>
        {state.ruinedCount ? (
          <EmergeChip tone="red" label={`${state.ruinedCount} seed${state.ruinedCount === 1 ? '' : 's'} ruined`} />
        ) : null}
        {sd?.ruined ? (
          <Button variant="outlined" color="inherit" onClick={() => dispatch({ type: 'takeSeed', sp: sd.sp, now: now() })}>
            Take a fresh {SPECIES[sd.sp].short} seed
          </Button>
        ) : null}
      </Fields>
    </>
  );
}

function LabelTask({ state, dispatch, now }: View): React.ReactElement {
  const held = state.held;
  const n = placedCount(state);
  const graded = state.labelGrade;

  return (
    <>
      <SectionTitle>Label the parts</SectionTitle>
      <Hint>
        <RichText
          text={
            'Pick a label, then tap the part it names **in the lens above**. Three of them are on the coat, so switch ' +
            'the lens to _As you found it_ for those.'
          }
        />
      </Hint>
      <Fields>
        {LABELS.map((id) => {
          const g = graded?.[id];
          const picked = held?.kind === 'label' && held.id === id;
          return (
            <Button
              key={id}
              size="small"
              variant={picked ? 'contained' : 'outlined'}
              color="inherit"
              disabled={Boolean(graded)}
              onClick={() => dispatch({ type: 'hold', held: { kind: 'label', id } })}
              sx={
                g
                  ? {
                      borderColor: (t) => (g.ok ? t.hues.green : t.hues.red),
                      backgroundColor: (t) => (g.ok ? t.tints.green : t.tints.red),
                    }
                  : state.labels[id]
                    ? { borderStyle: 'dashed' }
                    : undefined
              }
            >
              {state.labels[id] && !graded ? '↺ ' : ''}
              {id}
            </Button>
          );
        })}
      </Fields>
      <Fields>
        <EmergeChip tone={n === LABELS.length ? 'green' : 'grey'} label={`${n}/6 placed`} />
        {graded ? null : (
          <>
            <Button variant="text" color="inherit" disabled={!n} onClick={() => dispatch({ type: 'clearLabels' })}>
              Clear
            </Button>
            <Button
              variant="contained"
              disabled={n < LABELS.length}
              onClick={() => dispatch({ type: 'submitLabels', now: now() })}
            >
              Submit labelling
            </Button>
          </>
        )}
      </Fields>
    </>
  );
}

function TableTask({ state, dispatch, now }: View): React.ReactElement {
  const index = state.selRow;
  const row = TABLE_ROWS[index];
  const entry = row ? (state.rec[row.id] ?? { is: '', does: '' }) : { is: '', does: '' };
  const filled = tableFilled(state);

  const nextBlank = (): void => {
    for (let k = 1; k <= TABLE_ROWS.length; k += 1) {
      const i = (index + k) % TABLE_ROWS.length;
      const r = TABLE_ROWS[i];
      const e = r ? state.rec[r.id] : undefined;
      if (!e || !e.is || !e.does) {
        dispatch({ type: 'selectRow', index: i });
        return;
      }
    }
  };

  if (!row) return <SectionTitle>Observation table</SectionTitle>;

  return (
    <>
      <SectionTitle>
        Part {index + 1} of {TABLE_ROWS.length} · {row.part}
      </SectionTitle>
      <Hint>Say what this part is, and what it does or becomes. The lens above is ringing it on your own seed.</Hint>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1.25 }}>
        <PickField
          id={`ds-is-${row.id}`}
          label="What it is"
          value={entry.is}
          options={POOL_IS}
          onChange={(value) => dispatch({ type: 'setTableCell', row: row.id, field: 'is', value })}
        />
        <PickField
          id={`ds-does-${row.id}`}
          label="What it does / becomes"
          value={entry.does}
          options={POOL_DOES}
          onChange={(value) => dispatch({ type: 'setTableCell', row: row.id, field: 'does', value })}
        />
      </Box>
      <Fields>
        {filled < TABLE_ROWS.length ? (
          <Button variant="outlined" color="inherit" onClick={nextBlank}>
            Next part
          </Button>
        ) : null}
        <Button
          variant="contained"
          disabled={filled < TABLE_ROWS.length}
          onClick={() => dispatch({ type: 'submitTable', now: now() })}
        >
          Submit table
        </Button>
        <EmergeChip tone={filled === TABLE_ROWS.length ? 'green' : 'grey'} label={`${filled}/7 rows filled`} />
      </Fields>
    </>
  );
}

function ConclusionTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const grade = state.conclGrade;
  const ready = CONCL.every((c) => {
    const e = state.concl[c.id];
    return Boolean(e && e.a && e.b);
  });

  return (
    <>
      <SectionTitle>Conclusion</SectionTitle>
      <Hint>Finish the three sentences from what you saw.</Hint>
      <Box sx={{ mt: 1.25, display: 'flex', flexDirection: 'column', gap: 1.25, fontSize: theme.band.type.base - 1 }}>
        {CONCL.map((c) => {
          const e = state.concl[c.id] ?? { a: '', b: '' };
          const g = grade?.[c.id];
          return (
            <Box key={c.id} sx={{ lineHeight: 2.2, color: theme.brand.sub }}>
              {c.pre}{' '}
              <PickField
                inline
                id={`ds-${c.id}-a`}
                label={`${c.pre} …`}
                value={e.a}
                options={c.a.o}
                disabled={Boolean(grade)}
                status={g ? (g.a ? 'ok' : 'error') : null}
                onChange={(value) => dispatch({ type: 'setConcl', id: c.id, side: 'a', value })}
              />{' '}
              {c.mid}{' '}
              <PickField
                inline
                id={`ds-${c.id}-b`}
                label={`… ${c.mid}`}
                value={e.b}
                options={c.b.o}
                disabled={Boolean(grade)}
                status={g ? (g.b ? 'ok' : 'error') : null}
                onChange={(value) => dispatch({ type: 'setConcl', id: c.id, side: 'b', value })}
              />{' '}
              {c.post}
            </Box>
          );
        })}
      </Box>
      <Fields>
        <Button variant="outlined" color="inherit" disabled={state.pending > 0} onClick={() => dispatch({ type: 'wait', hours: 12 })}>
          Wait 12 h
        </Button>
        <Button variant="contained" disabled={!ready || Boolean(grade)} onClick={() => dispatch({ type: 'submitConcl', now: now() })}>
          Submit conclusion
        </Button>
      </Fields>
    </>
  );
}

function Task(view: View): React.ReactElement {
  switch (view.state.step) {
    case STEP.soak:
      return <SoakTask {...view} />;
    case STEP.outside:
      return <OutsideTask {...view} />;
    case STEP.coat:
      return <CoatTask {...view} />;
    case STEP.split:
      return <SplitTask {...view} />;
    case STEP.label:
      return <LabelTask {...view} />;
    case STEP.table:
      return <TableTask {...view} />;
    default:
      return <ConclusionTask {...view} />;
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function SpecimenPanel({ state }: { state: DicotSeedState }): React.ReactElement {
  const theme = useTheme();
  const sd = state.dissected ?? state.specimen;
  const line = { m: 0, mt: 0.5, fontSize: theme.band.type.base - 1, color: theme.brand.sub } as const;

  if (!sd) {
    return (
      <Typography sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
        Nothing on the bench yet. Tap a dish to pick up a dry seed.
      </Typography>
    );
  }

  const shown = exposed(sd);
  const showing = (Object.keys(shown) as PartId[]).filter((k) => shown[k]).map((k) => PART_NAME[k]);
  const sf = softness(sd.h);
  const gs = state.germ ? germState(state.germ) : null;

  return (
    <Box>
      <Typography sx={{ fontWeight: 800, fontSize: theme.band.type.base, color: theme.brand.ink }}>
        {SPECIES[sd.sp].name}
      </Typography>
      <Typography sx={line}>
        Soaked <b>{Math.round(sd.h * 10) / 10} h</b> — swollen to <b>{swollenPercent(sd)}%</b> of its dry size, coat{' '}
        {sf < PEEL_SOFT ? 'still hard' : sf < SPLIT_SOFT ? 'softening' : 'soft'}.
      </Typography>
      <Typography sx={line}>
        {sd.ruined
          ? `Ruined: ${sd.ruined}.`
          : sd.coat
            ? 'Seed coat on.'
            : sd.split === 'natural'
              ? 'Coat off, split along the natural plane.'
              : 'Coat off, the two halves still joined.'}
      </Typography>
      <Typography sx={line}>Showing: {showing.length ? showing.join(', ') : 'nothing identifiable'}.</Typography>
      {gs ? (
        <Typography sx={line}>
          Cotton dish: <b>{Math.round((state.germ?.g ?? 0) * 10) / 10} h</b> since sown —{' '}
          {gs.radicle > 0
            ? `the radicle has come out${gs.plumule > 0 ? ' and the plumule is greening' : ' first'}`
            : 'nothing showing yet'}
          .
        </Typography>
      ) : (
        <Typography sx={line}>
          Nothing is sown on the wet cotton. Sowing a soaked seed and waiting a day shows which part comes out first.
        </Typography>
      )}
      {state.labelGrade ? (
        <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
          {LABELS.map((id) => {
            const g = state.labelGrade?.[id];
            return (
              <EmergeChip
                key={id}
                tone={g?.ok ? 'green' : 'red'}
                label={g?.ok ? id : `${id} → ${g?.got ? PART_NAME[g.got] : 'tile'}`}
              />
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}

function ObservationsPanel({ state }: { state: DicotSeedState }): React.ReactElement {
  const theme = useTheme();
  const graded = state.tableGrade;

  return (
    <>
      <ObservationTable
        caption={
          graded
            ? 'Marked against the seven parts of a dicot seed'
            : state.step === STEP.table
              ? 'What each part is, and what it does or becomes'
              : 'You fill this in after the labelling'
        }
        columns={[
          { label: 'Part' },
          { label: 'What it is', align: 'left' },
          { label: 'Does / becomes', align: 'left' },
          ...(graded ? [{ label: 'Marks' as React.ReactNode }] : []),
        ]}
        rows={TABLE_ROWS.map((r) => {
          const e = state.rec[r.id];
          const g = graded?.[r.id];
          const cell = (field: 'is' | 'does'): React.ReactNode => (
            <>
              {e?.[field] || '—'}
              {g && !g[field] ? (
                <Box component="span" sx={{ display: 'block', color: theme.brand.tert }}>
                  → {r[field]}
                </Box>
              ) : null}
            </>
          );
          return [
            <Box
              key="p"
              component="span"
              sx={{ fontWeight: state.step === STEP.table && TABLE_ROWS[state.selRow]?.id === r.id ? 800 : 500 }}
            >
              {r.part}
            </Box>,
            <React.Fragment key="is">{cell('is')}</React.Fragment>,
            <React.Fragment key="does">{cell('does')}</React.Fragment>,
            ...(graded ? [<EmergeChip key="m" tone={g?.pts === 2 ? 'green' : g?.pts ? 'amber' : 'red'} label={`${g?.pts ?? 0}/2`} />] : []),
          ];
        })}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textWrap: 'pretty' }}>
        Seven parts, two cells each: 14 marks. The embryo axis has no label chip — it is the short stalk joining the
        plumule to the radicle, and you name it here.
      </Typography>
    </>
  );
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = dicotSeedEngine;
  return (
    <Box sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
      <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
        <b>Aim.</b> {meta.aim}
      </Typography>
      <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit' }}>
        <b>Theory.</b> {meta.theory}
      </Typography>
      <TextbookPassage scope={meta.textbook} query={meta.theoryQuery} topK={3} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// "What's happening"
// ---------------------------------------------------------------------------

/**
 * The panel is pure data and is handed nothing but `revealed` — see
 * `@labs/lib/dicot-seed/teach.ts`. The specimen is not in its scope at all, so
 * it cannot say where anything lies on this seed; what `revealed` unlocks is
 * which end of the axis becomes what, and the order and the route of
 * germination.
 *
 * The three drawings are joined to it here, by the keys the sections name, and
 * none of them is handed a seed either. `imbibition` is the soaking curve and
 * belongs to a section that is always present, because it carries no numbers on
 * either scale. The two anatomy drawings name and place the very parts the
 * labelling and the table are marked on, so they hang together off the single
 * revealed section under `anatomy` — there is no section present before then
 * that could reach them.
 */
function Teach({ revealed }: BenchTeachProps<DicotSeedState, DicotSeedAction>): React.ReactElement {
  return (
    <TeachSections
      sections={dicotSeedTeach(revealed)}
      figures={{
        imbibition: <ImbibitionFigure />,
        anatomy: (
          <>
            <SeedCoatFigure />
            <Box sx={{ mt: 1 }}>
              <SplitSeedFigure />
            </Box>
          </>
        ),
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

export const dicotSeedBench: BenchDefinition<DicotSeedState, DicotSeedAction> = {
  engine: dicotSeedEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // The lens earns its space from the moment there is a seed on the tile to
    // the moment the table is done: finding the micropyle, dropping the pins
    // and pointing at the row being written are all the same magnified view.
    showAside: (state) =>
      state.step >= STEP.outside && state.step <= STEP.table && (state.dissected !== null || state.specimen !== null),
    // THE TEACHING LAYER. It explains the mechanism the seed is obeying —
    // imbibition, why a wet coat peels and a dry one tears, what the embryo axis
    // is, what non-endospermic means. It is never handed the specimen, so it
    // cannot say where anything lies on this seed; only `revealed` reaches it,
    // and what it holds back is which end of the axis becomes what, and the
    // order and the route of germination. See `@labs/lib/dicot-seed/teach.ts`.
    // No `showTeach`: why a seed must soak overnight is the first thing the
    // bench asks about, and there is no seed in hand when it asks.
    Teach,
    tabs: [
      { id: 'specimen', label: 'Your seed', Panel: SpecimenPanel },
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) =>
      state.step >= STEP.table ? 'observations' : state.step === STEP.soak ? 'theory' : 'specimen',
    tours: (ctx) => createDicotSeedTours(ctx),
    // "Show me this step", per step of the procedure. On this bench the step is
    // derived from the specimen, so the act that advances it IS the act it is
    // marked for: the trainer soaks, picks the right tool up, and hands over.
    // See `trainer.tsx`.
    useTrainer: useDicotSeedTrainer,
    // A tour step names a dish by its SPECIES; which dish sits where comes from
    // the bench seed, so the step cannot name a position.
    highlightsFor: (step) => step?.highlight ?? [],
  },
};
