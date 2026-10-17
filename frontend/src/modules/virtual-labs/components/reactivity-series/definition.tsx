'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, RichText } from '@/components/ui';
import {
  METAL,
  METALS,
  SALT,
  SALTS,
  TRUE_ORDER,
  tubeIndex,
  tubeKey,
  type ColourCode,
  type DepositCode,
  type Metal,
} from '@labs/lib/reactivity-series/chemistry';
import { reactivitySeriesEngine } from '@labs/lib/reactivity-series/engine';
import { COLOUR_OPTS, DEPOSIT_OPTS, STAGE, describe } from '@labs/lib/reactivity-series/marking';
import {
  allDescribed,
  displacementCounts,
  minutesSinceLastStrip,
  type RxAction,
} from '@labs/lib/reactivity-series/reducer';
import type { RxState } from '@labs/lib/reactivity-series/state';
import { reactivityTeach, type TeachSection } from '@labs/lib/reactivity-series/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { TeachSections } from '../teach-sections';
import { ObservationTable } from '../observation-table';

import { RxBench } from './bench';
import { TubeCloseUp } from './close-up';
import { createReactivityTours } from './tours';
import { useReactivityTrainer } from './trainer';

type View = BenchViewProps<RxState, RxAction>;

/**
 * The reactivity series bench: everything about this practical that is drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the step strip, the assistant, the notebook, the viva and the marks.
 * What is left is this practical's own — the bench, the close-up of the tube
 * being described, the input for the current step, and three notebook panels.
 */

// ---------------------------------------------------------------------------
// One dispatch for the whole workspace
// ---------------------------------------------------------------------------

interface RxContext {
  dispatch: (action: RxAction) => RxState;
  now: () => number;
}

const Ctx = React.createContext<RxContext | null>(null);

/**
 * The notebook panels are handed only the state, but this bench's observation
 * table is also a WAY IN: tapping a cell brings that tube into the close-up,
 * exactly as tapping the tube itself does. That needs the dispatcher, so it is
 * shared here rather than duplicating the rack's selection in React state.
 */
function RxProvider({ dispatch, now, children }: View & { children: React.ReactNode }): React.ReactElement {
  const value = React.useMemo(() => ({ dispatch, now }), [dispatch, now]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useRx(): RxContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('Reactivity bench components must be inside its provider.');
  return ctx;
}

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

/** The close-up is docked by the workspace in every layout, so the rack has the
 *  whole stage to itself at any width. */
function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<RxState, RxAction>): React.ReactElement {
  return (
    <RxBench
      state={state}
      highlights={highlights}
      onSvg={onStageElement}
      onBottle={(salt) => dispatch({ type: 'tapBottle', salt })}
      onMetal={(metal) => dispatch({ type: 'tapMetal', metal, now: now() })}
      onSand={() => dispatch({ type: 'tapSand' })}
      onTube={(index) => dispatch({ type: 'tapTube', index, now: now() })}
      onPutDown={() => dispatch({ type: 'hold', held: null })}
    />
  );
}

const BENCH_BUTTON = {
  flex: 'none',
  color: apparatus.benchInk,
  borderColor: 'rgba(255,255,255,.16)',
  '&:hover': { backgroundColor: 'rgba(255,255,255,.07)', borderColor: 'rgba(255,255,255,.28)' },
  '&.Mui-disabled': { color: apparatus.benchInkMuted, borderColor: 'rgba(255,255,255,.08)' },
} as const;

/** The bench edge: what is in your hand, and the clock you can run forward. */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const held = state.held;
  const waiting = state.waitTo !== null;
  const hands =
    held === null
      ? 'Hands free — tap a bottle, a metal or the sandpaper to pick it up'
      : held.kind === 'bottle'
        ? `Holding ${SALT[held.salt].label} — tap a tube to add 5 mL`
        : held.kind === 'strip'
          ? `Holding a ${METAL[held.metal].name} strip${state.clean[held.metal] ? '' : ' (not cleaned)'} — tap a tube`
          : 'Holding sandpaper — tap a metal on the tile to clean its strips';

  return (
    <Box
      data-tour="bench-controls"
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
      <Box component="span" role="status" sx={{ fontWeight: 600 }}>
        {hands}
      </Box>
      {held ? (
        <Button size="small" variant="outlined" sx={BENCH_BUTTON} onClick={() => dispatch({ type: 'hold', held: null })}>
          Put down
        </Button>
      ) : null}
      <Box sx={{ flex: 1 }} />
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
        Lab clock {Math.round(state.min)} min
      </Box>
      <Button
        size="small"
        variant="outlined"
        sx={BENCH_BUTTON}
        disabled={waiting}
        onClick={() => dispatch({ type: 'wait', minutes: 1, now: now() })}
      >
        Wait 1 min
      </Button>
      <Button
        size="small"
        variant="outlined"
        sx={BENCH_BUTTON}
        disabled={waiting}
        onClick={() => dispatch({ type: 'wait', minutes: 5, now: now() })}
      >
        Wait 5 min
      </Button>
    </Box>
  );
}

/** The close-up, docked beside the box its observation is typed into. */
function Aside({ state, dispatch, now, maxWidth }: View & { maxWidth: number }): React.ReactElement | null {
  return (
    <Box data-tour="close-up">
      <TubeCloseUp
        state={state}
        maxWidth={maxWidth}
        onEmpty={() => dispatch({ type: 'empty', index: state.sel, now: now() })}
      />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The current step
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

function Task({ state, dispatch, now }: View): React.ReactElement {
  const tube = state.tubes[state.sel]!;

  switch (state.step) {
    case STAGE.fill: {
      const filled = SALTS.map(
        (salt) => METALS.filter((m) => {
          const t = state.tubes[tubeIndex(m, salt)]!;
          return t.added.length > 0 && t.added.every((s) => s === salt);
        }).length,
      );
      return (
        <>
          <SectionTitle>Pour the solutions</SectionTitle>
          <Hint>
            Each <b>column</b> of four tubes gets one solution, named above it. Pick up a dropper bottle, then tap each
            of its four tubes to add 5 mL.
          </Hint>
          <Fields>
            {SALTS.map((salt, g) => (
              <EmergeChip
                key={salt}
                tone={filled[g] === 4 ? 'green' : 'grey'}
                label={`${SALT[salt].label} ${filled[g]}/4`}
              />
            ))}
          </Fields>
        </>
      );
    }

    case STAGE.metals: {
      const inTubes = state.tubes.filter((t) => t.strip?.metal === t.metal).length;
      return (
        <>
          <SectionTitle>Add the metal strips</SectionTitle>
          <Hint>
            Metal left in air grows a thin oxide coat. <b>Rub each metal’s strips with sandpaper first</b> — pick up the
            sandpaper, then tap a metal on the tile. Then drop one strip into every tube in that metal’s row.
          </Hint>
          <Fields>
            <EmergeChip tone={inTubes === 16 ? 'green' : 'grey'} label={`${inTubes}/16 strips in`} />
            {METALS.map((m) => (
              <EmergeChip
                key={m}
                tone={state.clean[m] ? 'green' : 'amber'}
                label={`${m} ${state.clean[m] ? 'cleaned' : 'not cleaned'}`}
              />
            ))}
          </Fields>
        </>
      );
    }

    case STAGE.watch: {
      const since = minutesSinceLastStrip(state);
      const changed = state.tubes.filter((t) => t.fresh).length;
      return (
        <>
          <SectionTitle>Wait and watch</SectionTitle>
          <Hint>
            Displacement is not instant. Run the clock on, then tap a tube for the close-up: look at the <b>colour of
            the solution</b> and the <b>surface of the strip</b>. Decide for yourself when you have waited long enough.
          </Hint>
          <Fields>
            <EmergeChip tone="grey" label={`${since} min since the last strip went in`} />
            {changed ? <EmergeChip tone="amber" dot label={`${changed} changed since you looked`} /> : null}
          </Fields>
          <Fields>
            <Button
              variant="outlined"
              color="inherit"
              disabled={state.waitTo !== null}
              onClick={() => dispatch({ type: 'wait', minutes: 5, now: now() })}
            >
              Wait 5 min
            </Button>
            <Button variant="contained" onClick={() => dispatch({ type: 'readyToRecord', now: now() })}>
              Record observations
            </Button>
          </Fields>
        </>
      );
    }

    case STAGE.record: {
      const key = tubeKey(tube.metal, tube.salt);
      const cell = state.rec[key];
      const done = state.tubes.filter((t) => {
        const r = state.rec[tubeKey(t.metal, t.salt)];
        return Boolean(r?.c && r?.d);
      }).length;
      return (
        <>
          <SectionTitle>
            {tube.metal} in {SALT[tube.salt].label}
          </SectionTitle>
          <Hint>
            Describe what this tube <b>shows</b>, not what you expect. The clock keeps running if you wait — every tube
            is marked against what it shows when you submit.
          </Hint>
          <Fields>
            <TextField
              select
              size="small"
              label="Colour of the solution"
              sx={{ flex: '1 1 160px', minWidth: 150 }}
              value={cell?.c ?? ''}
              onChange={(e) =>
                dispatch({ type: 'recordCell', index: state.sel, c: e.target.value as ColourCode, now: now() })
              }
            >
              {COLOUR_OPTS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Deposit on the strip"
              sx={{ flex: '1 1 140px', minWidth: 130 }}
              value={cell?.d ?? ''}
              onChange={(e) =>
                dispatch({ type: 'recordCell', index: state.sel, d: e.target.value as DepositCode, now: now() })
              }
            >
              {DEPOSIT_OPTS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </TextField>
          </Fields>
          <Fields>
            <EmergeChip tone={done === 16 ? 'green' : 'grey'} label={`${done}/16 described`} />
            <Box sx={{ flex: 1 }} />
            <Button
              variant="outlined"
              color="inherit"
              disabled={state.waitTo !== null}
              onClick={() => dispatch({ type: 'wait', minutes: 5, now: now() })}
            >
              Wait 5 min
            </Button>
            <Button
              variant="contained"
              disabled={!allDescribed(state)}
              onClick={() => dispatch({ type: 'submitObs', now: now() })}
            >
              Submit observations
            </Button>
          </Fields>
        </>
      );
    }

    default: {
      const left = METALS.filter((m) => !state.order.includes(m));
      const labels = ['most reactive', '2nd', '3rd', 'least reactive'];
      return (
        <>
          <SectionTitle>Conclude</SectionTitle>
          <Hint>
            Using <b>your</b> observation table, arrange the four metals from most reactive to least. A metal that
            displaced more of the others is more reactive.
          </Hint>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.75, mt: 1.5 }}>
            {[0, 1, 2, 3].map((k) => (
              <Slot key={k} metal={state.order[k]} caption={labels[k]!} />
            ))}
          </Box>
          <Fields>
            {METALS.map((m) => (
              <Button
                key={m}
                size="small"
                variant="outlined"
                color="inherit"
                disabled={state.order.includes(m)}
                onClick={() => dispatch({ type: 'pickOrder', metal: m })}
              >
                {m}
              </Button>
            ))}
            <Box sx={{ flex: 1 }} />
            <Button size="small" color="inherit" disabled={!state.order.length} onClick={() => dispatch({ type: 'clearOrder' })}>
              Clear
            </Button>
            <Button
              variant="contained"
              disabled={left.length > 0}
              onClick={() => dispatch({ type: 'submitOrder', now: now() })}
            >
              Submit order
            </Button>
          </Fields>
        </>
      );
    }
  }
}

function Slot({ metal, caption }: { metal: Metal | undefined; caption: string }): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      sx={{
        minHeight: 52,
        border: `1.5px ${metal ? 'solid' : 'dashed'} ${theme.brand.line2}`,
        backgroundColor: metal ? theme.brand.subtle : 'transparent',
        borderRadius: `${theme.band.radius.sm}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: theme.brand.tert,
        fontSize: theme.band.type.min,
      }}
    >
      {metal ? (
        <Box component="b" sx={{ fontSize: theme.band.type.h4, color: theme.brand.ink }}>
          {metal}
        </Box>
      ) : null}
      {caption}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

/**
 * The observation table, laid out exactly as the rack is: a row per metal, a
 * column per solution. Tapping a cell brings that tube into the close-up.
 */
function ObservationsPanel({ state }: { state: RxState }): React.ReactElement {
  const theme = useTheme();
  const { dispatch, now } = useRx();
  const editable = state.step === STAGE.record && !state.graded;

  return (
    <ObservationTable
      caption={
        state.graded
          ? `Marked against what each tube showed at ${state.graded.min} min`
          : editable
            ? 'Tap a cell to bring that tube into the close-up'
            : 'You fill this in at the Record step'
      }
      columns={[{ label: 'Metal' }, ...SALTS.map((s) => ({ label: SALT[s].label, align: 'left' as const }))]}
      rows={METALS.map((m) => [
        <Box key="h" component="b" sx={{ color: theme.brand.ink }}>
          {m}
        </Box>,
        ...SALTS.map((salt) => {
          const index = tubeIndex(m, salt);
          const key = tubeKey(m, salt);
          const graded = state.graded?.cells[key];
          const tone = graded ? (graded.pts === 2 ? theme.hues.green : theme.hues.red) : null;
          return (
            <Box
              key={salt}
              component="button"
              type="button"
              title={graded && graded.pts < 2 ? `The tube showed: ${describe(graded.truth)}` : undefined}
              onClick={() => dispatch({ type: 'tapTube', index, now: now() })}
              sx={{
                width: '100%',
                minHeight: 42,
                px: 0.5,
                py: 0.5,
                cursor: 'pointer',
                textAlign: 'left',
                font: 'inherit',
                fontSize: theme.band.type.min,
                lineHeight: 1.25,
                color: state.rec[key]?.c ? theme.brand.ink : theme.brand.tert,
                backgroundColor: tone ? `${tone}1f` : theme.brand.surface,
                border: `1px solid ${tone ?? (state.sel === index ? theme.brand.orange : theme.brand.line2)}`,
                borderRadius: `${theme.band.radius.sm}px`,
              }}
            >
              {describe(state.rec[key])}
            </Box>
          );
        }),
      ])}
    />
  );
}

/** What the student's own table says about reactivity, and what it should say. */
function TallyPanel({ state }: { state: RxState }): React.ReactElement {
  const theme = useTheme();
  const counts = displacementCounts(state);
  const ranked = [...METALS].sort((a, b) => counts[b] - counts[a]);

  return (
    <Box sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
      <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
        A metal that displaced more of the others is more reactive. This counts, from <b>your</b> table, how many of the
        four solutions each metal visibly reacted in.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1.5 }}>
        {ranked.map((m) => (
          <Box key={m} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box component="b" sx={{ width: 28, color: theme.brand.ink }}>
              {m}
            </Box>
            <Box sx={{ flex: 1, height: 10, borderRadius: 99, backgroundColor: theme.brand.subtle, overflow: 'hidden' }}>
              <Box
                sx={{
                  width: `${(counts[m] / 3) * 100}%`,
                  height: '100%',
                  backgroundColor: theme.brand.orange,
                  transition: 'width 240ms',
                }}
              />
            </Box>
            <Box sx={{ fontVariantNumeric: 'tabular-nums' }}>{counts[m]} of 4</Box>
          </Box>
        ))}
      </Box>
      {state.concl ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1.5 }}>
          <EmergeChip
            tone={state.concl.consistent ? 'green' : 'red'}
            label={state.concl.consistent ? 'Follows from your table' : 'Does not follow from your table'}
          />
          <EmergeChip
            tone={state.concl.truth ? 'green' : 'red'}
            label={state.concl.truth ? 'The true order' : `True order: ${TRUE_ORDER.join(' > ')}`}
          />
        </Box>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// "What's happening"
// ---------------------------------------------------------------------------

function Teach({ revealed }: BenchTeachProps<RxState, RxAction>): React.ReactElement {
  return <TeachSections sections={reactivityTeach(revealed)} />;
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = reactivitySeriesEngine;
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
// The bench
// ---------------------------------------------------------------------------

export const reactivitySeriesBench: BenchDefinition<RxState, RxAction> = {
  engine: reactivitySeriesEngine,
  ui: {
    Provider: RxProvider,
    Stage,
    Controls,
    Task,
    Aside,
    showAside: () => true,
    // The same page for all sixteen tubes, controls included — see the note in
    // `@labs/lib/reactivity-series/teach.ts`. Nothing about it waits on the
    // rack, so there is no `showTeach`.
    Teach,
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'tally', label: 'Reactivity', Panel: TallyPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) =>
      state.step >= STAGE.conclude ? 'tally' : state.step >= STAGE.watch ? 'observations' : 'theory',
    tours: (ctx) => createReactivityTours(ctx),
    // "Show me this step", on the student's own rack. Passed by reference: it
    // reads the `teach` flag as a hook, which is what keeps the step that opens
    // the teaching panel out of the set when it has been removed.
    useTrainer: useReactivityTrainer,
    tourNotice: (state) =>
      state.tubes.some((t) => t.added.some((s) => s !== t.salt))
        ? 'A tube in your practical holds the **wrong solution**. Empty and rinse it before you record anything.'
        : null,
    highlightsFor: (step) => (step?.highlight ?? []) as readonly string[],
  },
};
