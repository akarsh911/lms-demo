'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Hand, Trash2 } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { ChoiceQuiz, EmergeChip, RichText } from '@/components/ui';
import {
  DROPS,
  isLitmusTest,
  litmusColour,
  POUR,
  REAGENTS,
  solutionVol,
  tubeVol,
} from '@labs/lib/acid-base/chemistry';
import { acidBaseEngine } from '@labs/lib/acid-base/engine';
import {
  CONCLUSIONS,
  FIZZ_WORDS,
  GAS_WORDS,
  LITMUS_WORDS,
  STEP,
} from '@labs/lib/acid-base/marking';
import type { AcidBaseAction } from '@labs/lib/acid-base/reducer';
import { carbonateAcidTube, zincAcidTube } from '@labs/lib/acid-base/score';
import type { AcidBaseState, Held } from '@labs/lib/acid-base/state';
import { acidBaseTeach, type TeachSection } from '@labs/lib/acid-base/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { TeachSections } from '../teach-sections';
import { ObservationTable } from '../observation-table';

import { AcidBaseBench } from './bench';
import { TubeCloseup } from './closeup';
import { RecordRow } from './record-row';
import { createAcidBaseTours, resolveTubeToken } from './tours';
import { useAcidBaseTrainer } from './trainer';

type View = BenchViewProps<AcidBaseState, AcidBaseAction>;

/**
 * The acids and bases bench: everything about this practical that is drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the strip, the assistant, the notebook, the viva and the marks. What
 * is left here is this practical's own: the rack and the shelf, what is in your
 * hand, the one question the current step asks, and the two notebook panels.
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
}: BenchStageProps<AcidBaseState, AcidBaseAction>): React.ReactElement {
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <AcidBaseBench
        layout={state.layout}
        tubes={state.tubes}
        held={state.held}
        selected={state.step === STEP.record ? state.row : state.sel}
        lime={state.lime}
        highlights={highlights}
        onPick={(held) => dispatch({ type: 'pickUp', held, now: now() })}
        onTapTube={(tube) => dispatch({ type: 'tapTube', tube, now: now() })}
        onSvg={onStageElement}
      />
    </Box>
  );
}

/** What is in your hand, and the one thing you can do to a tube without it. */
function heldLine(held: Held | null): string {
  if (!held) return 'Hands free — tap a bottle, a jar, the splinter or the lime water to pick it up';
  switch (held.kind) {
    case 'reagent':
      return `Holding **${REAGENTS[held.id].label}** — tap a tube to add ${POUR} mL`;
    case 'litmus':
      return `Holding **${held.id} litmus solution** — tap a tube to add ${DROPS} drops`;
    case 'jar':
      return `Holding the **${held.id === 'Zn' ? 'zinc granules' : 'solid Na₂CO₃'}** jar — tap a tube to add a spatula`;
    case 'splinter':
      return 'Holding a **burning splinter** — tap a tube to bring it to the mouth';
    case 'lime':
      return 'Holding the **lime water** tube — tap a tube to pass its gas through it';
  }
}

function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const shown = state.step === STEP.record ? state.row : state.sel;
  const dirty = tubeVol(state.tubes[shown]!) > 0;
  const locked = state.graded !== null || state.done;

  return (
    <Box
      data-tour="held"
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
      <Box component="span" role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <Hand size={14} aria-hidden="true" />
        <RichText text={heldLine(state.held)} />
      </Box>
      <Box sx={{ flex: 1 }} />
      {dirty && !locked ? (
        <Button
          size="small"
          variant="outlined"
          startIcon={<Trash2 size={14} />}
          onClick={() => dispatch({ type: 'rinse', tube: shown, now: now() })}
          sx={BENCH_BUTTON}
        >
          Empty and rinse {state.layout[shown]!.id}
        </Button>
      ) : null}
      <Button
        size="small"
        variant="outlined"
        disabled={!state.held}
        onClick={() => dispatch({ type: 'pickUp', held: null, now: now() })}
        sx={BENCH_BUTTON}
      >
        Put down
      </Button>
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

// ---------------------------------------------------------------------------
// The magnified tube, docked beside the judgement it is needed for
// ---------------------------------------------------------------------------

function Aside({ state, maxWidth }: View & { maxWidth: number }): React.ReactElement {
  const recording = state.step === STEP.record;
  const k = recording ? state.row : state.sel;
  return (
    <TubeCloseup
      spec={state.layout[k]!}
      tube={state.tubes[k]!}
      lime={state.lime}
      maxWidth={Math.max(260, maxWidth)}
      heading={recording ? 'The tube you are writing about' : 'Close-up'}
    />
  );
}

// ---------------------------------------------------------------------------
// The current step
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography component="h3" sx={{ fontWeight: 800, fontSize: theme.band.type.h4, color: theme.brand.ink, lineHeight: 1.25 }}>
      {children}
    </Typography>
  );
}

function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography component="p" sx={{ m: 0, mt: 0.5, color: theme.brand.sub, fontSize: theme.band.type.base - 1, textWrap: 'pretty' }}>
      {children}
    </Typography>
  );
}

function Chips({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>{children}</Box>;
}

const tone = (done: boolean): 'green' | 'grey' => (done ? 'green' : 'grey');

function Task({ state, dispatch, now }: View): React.ReactElement {
  const filled = state.tubes.filter(
    (t, i) => t.liq[state.layout[i]!.reagent] >= POUR && t.poured.every((a) => a === state.layout[i]!.reagent),
  ).length;

  switch (state.step) {
    case STEP.pour:
      return (
        <>
          <SectionTitle>Fill the eight tubes</SectionTitle>
          <Hint>
            Each tube is labelled underneath with the solution that belongs in it. Pick up a bottle and tap a tube to
            add {POUR} mL. Both solutions are colourless and look identical — that is exactly why the rest of the
            practical exists.
          </Hint>
          <Chips>
            <EmergeChip tone={tone(filled === 8)} label={`${filled}/8 tubes filled`} />
            {state.contam ? <EmergeChip tone="red" label={`${state.contam} tube spoiled — empty and refill it`} /> : null}
          </Chips>
        </>
      );

    case STEP.litmus: {
      const n = [0, 1, 2, 3].filter((i) => state.tubes[i]!.drops[state.layout[i]!.test as 'blue' | 'red'] > 0).length;
      return (
        <>
          <SectionTitle>The litmus tests</SectionTitle>
          <Hint>
            Add <b>blue litmus</b> to the two tubes labelled for it, and <b>red litmus</b> to the other two. Four tests,
            and only two of them change colour. The colour is worked out from the pH of what is really in the tube, so a
            tube you have spoiled will tell you so.
          </Hint>
          <Chips>
            <EmergeChip tone={tone(n === 4)} label={`${n}/4 litmus tests`} />
          </Chips>
        </>
      );
    }

    case STEP.zinc: {
      const nz = [4, 5].filter((i) => state.tubes[i]!.put.Zn > 0).length;
      const ng = [4, 5].filter((i) => state.tubes[i]!.tests.splinter || state.tubes[i]!.tests.lime).length;
      const named = state.tubes[zincAcidTube(state)]!.ident.H2;
      return (
        <>
          <SectionTitle>Zinc with both</SectionTitle>
          <Hint>
            A spatula of <b>zinc granules</b> into both zinc tubes, then hold the <b>burning splinter</b> at the mouth of
            a fizzing one. Zinc is amphoteric: it attacks acids <i>and</i> alkalis, so expect the same gas from both —
            one of them much more slowly.
          </Hint>
          <Chips>
            <EmergeChip tone={tone(nz === 2)} label={`${nz}/2 tubes with zinc`} />
            <EmergeChip tone={tone(ng > 0)} label={`${ng}/2 gas tests`} />
            {named ? <EmergeChip tone="green" dot label="H₂ identified" /> : null}
          </Chips>
        </>
      );
    }

    case STEP.carbonate: {
      const nc = [6, 7].filter((i) => state.tubes[i]!.put.Na2CO3 > 0).length;
      const ng = [6, 7].filter((i) => state.tubes[i]!.tests.splinter || state.tubes[i]!.tests.lime).length;
      const named = state.tubes[carbonateAcidTube(state)]!.ident.CO2;
      return (
        <>
          <SectionTitle>Solid sodium carbonate</SectionTitle>
          <Hint>
            A spatula of <b>solid Na₂CO₃</b> into both carbonate tubes. Then pick up the <b>lime water</b> tube and tap
            the fizzing one to pass its gas through it. A burning splinter will only tell you the gas does not burn;
            lime water is what names it.
          </Hint>
          <Chips>
            <EmergeChip tone={tone(nc === 2)} label={`${nc}/2 tubes with Na₂CO₃`} />
            <EmergeChip tone={tone(ng > 0)} label={`${ng}/2 gas tests`} />
            {named ? <EmergeChip tone="green" dot label="CO₂ identified" /> : null}
          </Chips>
        </>
      );
    }

    case STEP.record:
      return <RecordRow state={state} dispatch={dispatch} now={now} />;

    default: {
      // Conclusions, revealed one at a time: each is a question about the eight
      // tests just done, and the explanation stays on screen for the next one.
      const answered = state.concl.filter(Boolean).length;
      const shown = CONCLUSIONS.slice(0, Math.min(answered + 1, CONCLUSIONS.length));
      return (
        <>
          <SectionTitle>Conclusions</SectionTitle>
          <Hint>Three conclusions from the eight tests you have just done.</Hint>
          <Box sx={{ mt: 1.5 }}>
            <ChoiceQuiz
              idPrefix="acid-base-conclusion"
              questions={shown.map((c) => ({ q: c.q, options: c.o, answer: c.a, why: c.why }))}
              picks={shown.map((_, i) => state.concl[i]?.pick ?? null)}
              onPick={(question, option) => dispatch({ type: 'answerConclusion', question, option, now: now() })}
              explain={(i) => (
                <TextbookPassage scope={acidBaseEngine.meta.textbook} query={CONCLUSIONS[i]!.textbookQuery} topK={2} />
              )}
            />
          </Box>
        </>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

/** What the tube itself is showing: the colour, and which gas tests were run. */
function Seen({ state, i }: { state: AcidBaseState; i: number }): React.ReactElement {
  const theme = useTheme();
  const spec = state.layout[i]!;
  const tube = state.tubes[i]!;
  if (isLitmusTest(spec)) {
    const colour = litmusColour(tube);
    return colour ? (
      <Box
        component="span"
        aria-label="the colour in the tube"
        sx={{
          display: 'inline-block',
          verticalAlign: 'middle',
          width: 18,
          height: 18,
          borderRadius: `${Math.max(4, theme.band.radius.sm - 4)}px`,
          border: `1px solid ${theme.brand.line2}`,
          backgroundColor: colour,
        }}
      />
    ) : (
      <Box component="span" sx={{ color: theme.brand.tert }}>
        no litmus
      </Box>
    );
  }
  const done = [tube.tests.splinter ? 'splinter' : null, tube.tests.lime ? 'lime water' : null].filter(Boolean);
  return (
    <Box component="span" sx={{ color: theme.brand.tert }}>
      {done.length ? done.join(', ') : 'gas not tested'}
    </Box>
  );
}

function ObservationsPanel({ state }: { state: AcidBaseState }): React.ReactElement {
  const theme = useTheme();
  const graded = state.graded;

  return (
    <ObservationTable
      caption={
        graded
          ? 'Marked against what each tube really showed'
          : state.step === STEP.record
            ? 'Filling in, tube by tube'
            : 'You fill this in at the Observation table step'
      }
      columns={[
        { label: 'Tube' },
        { label: 'Seen', align: 'left' },
        { label: 'What you wrote', align: 'left' },
        { label: 'Marks' },
      ]}
      rows={state.layout.map((spec, i) => {
        const r = state.rec[i]!;
        const g = graded?.[i] ?? null;
        const written = isLitmusTest(spec)
          ? r.lit
            ? LITMUS_WORDS[r.lit]
            : '—'
          : `${r.eff ? FIZZ_WORDS[r.eff] : '—'}; ${r.gas ? GAS_WORDS[r.gas] : '—'}`;
        return [
          <Box key="t" sx={{ whiteSpace: 'nowrap' }}>
            <b>{spec.id}</b>
            <Box sx={{ fontSize: theme.band.type.min, color: theme.brand.tert }}>
              {REAGENTS[spec.reagent].label.replace('dil. ', '')} + {spec.what}
            </Box>
          </Box>,
          <Seen key="s" state={state} i={i} />,
          <Box key="w">
            {written}
            {g ? (
              <Box sx={{ fontSize: theme.band.type.min, color: theme.brand.tert }}>tube showed: {g.truth}</Box>
            ) : null}
          </Box>,
          g ? (
            <EmergeChip key="m" tone={g.pts === 4 ? 'green' : g.pts > 0 ? 'amber' : 'red'} label={`${g.pts}/4`} />
          ) : (
            <Box key="m" sx={{ color: theme.brand.tert }}>
              —
            </Box>
          ),
        ];
      })}
    />
  );
}

// ---------------------------------------------------------------------------
// "What's happening"
// ---------------------------------------------------------------------------

function Teach({ revealed }: BenchTeachProps<AcidBaseState, AcidBaseAction>): React.ReactElement {
  return <TeachSections sections={acidBaseTeach(revealed)} />;
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = acidBaseEngine;
  const rule = { m: 0, mt: 0.5, fontSize: 'inherit' } as const;

  return (
    <Box sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
      <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
        <b>Aim.</b> {meta.aim}
      </Typography>
      <Typography component="p" sx={{ ...rule, mt: 1 }}>
        <b>Theory.</b> {meta.theory}
      </Typography>

      <Box
        sx={{
          mt: 1.5,
          p: 1.25,
          borderRadius: `${theme.band.radius.sm}px`,
          backgroundColor: theme.brand.subtle,
          border: `1px solid ${theme.brand.line}`,
        }}
      >
        <Typography
          sx={{
            fontSize: theme.band.type.min,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontWeight: 700,
            color: theme.brand.tert,
          }}
        >
          Litmus and gas tests
        </Typography>
        <Typography component="p" sx={rule}>
          Blue litmus turns <b>red</b> in acid (below about pH 6); red litmus turns <b>blue</b> in alkali (above about pH
          8). In between it sits purple.
        </Typography>
        <Box
          component="ul"
          sx={{ m: 0, mt: 0.75, pl: 2.25, fontFamily: 'Georgia, serif', color: theme.brand.ink, lineHeight: 1.7 }}
        >
          <li>Zn + 2HCl → ZnCl₂ + H₂↑</li>
          <li>Zn + 2NaOH → Na₂ZnO₂ + H₂↑ (slower)</li>
          <li>Na₂CO₃ + 2HCl → 2NaCl + H₂O + CO₂↑</li>
          <li>Na₂CO₃ + NaOH → no reaction</li>
        </Box>
        <Typography component="p" sx={{ ...rule, mt: 1 }}>
          <b>H₂</b> burns with a sharp <b>pop</b> at a burning splinter. <b>CO₂</b> turns lime water <b>milky</b> and
          puts the flame out. Effervescence on its own names no gas — test it.
        </Typography>
      </Box>

      <TextbookPassage scope={meta.textbook} query={meta.theoryQuery} topK={3} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

export const acidBaseBench: BenchDefinition<AcidBaseState, AcidBaseAction> = {
  engine: acidBaseEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // Before the tubes hold anything there is nothing to magnify, and the viva
    // and the marking card take the whole console.
    showAside: (state) => state.step <= STEP.record && state.tubes.some((t) => solutionVol(t) > 0),
    // The mechanism under all eight tubes, and never what one of them did. The
    // litmus dye, the zinc and the carbonate behave the same way before a tube
    // is filled as after, so there is nothing for a `showTeach` to wait for.
    Teach,
    tabs: [
      { id: 'table', label: 'Observation table', Panel: ObservationsPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) => (state.step <= STEP.litmus ? 'theory' : 'table'),
    tours: (ctx) => createAcidBaseTours(ctx),
    // "Show me this step", on the student's own rack. Passed by reference: it
    // reads the `teach` flag as a hook, which is what keeps the step that opens
    // the teaching panel out of the set when an administrator has removed it.
    useTrainer: useAcidBaseTrainer,
    highlightsFor: (step, state) => [
      ...((step?.highlight ?? []) as readonly string[]).map((token) => resolveTubeToken(token, state.layout)),
      ...(state.step === STEP.record ? [`tube:${state.row}`] : []),
    ],
  },
};
