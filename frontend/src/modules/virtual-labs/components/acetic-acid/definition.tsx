'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Check, Hand, Trash2 } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { ChoiceQuiz, EmergeChip, RichText } from '@/components/ui';
import { liquidsFor, MLGAS, POUR, volume, type Liquids } from '@labs/lib/acetic-acid/chemistry';
import { aceticAcidEngine } from '@labs/lib/acetic-acid/engine';
import { STEP } from '@labs/lib/acetic-acid/marking';
import { CONCLUSIONS, labelOf, ROWS, testList } from '@labs/lib/acetic-acid/observations';
import { RACK, tubeReady, tubeSpoiled, TUBE, wantedIds } from '@labs/lib/acetic-acid/rack';
import type { AceticAcidAction } from '@labs/lib/acetic-acid/reducer';
import { spoiledTubes } from '@labs/lib/acetic-acid/score';
import type { AceticAcidState, HeldItem } from '@labs/lib/acetic-acid/state';
import { aceticAcidTeach, type TeachSection } from '@labs/lib/acetic-acid/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { TeachSections } from '../teach-sections';
import { ObservationTable } from '../observation-table';

import { AceticBench } from './bench';
import { TubeCloseUp } from './close-up';
import { IonisationFigure, MixingFigure } from './teach-figures';
import { createAceticAcidTours } from './tours';
import { useAceticTrainer } from './trainer';

type View = BenchViewProps<AceticAcidState, AceticAcidAction>;

/**
 * The acetic-acid bench: everything about this practical that is drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the strip, the assistant, the notebook, the viva and the marks. What
 * is left here is this practical's own: the apparatus, the bench bar under it,
 * the one thing the current step asks for, the magnified tube beside that, and
 * the two notebook panels.
 */
const liquidsOf = (s: AceticAcidState): Liquids => liquidsFor(s.acidConc);

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<AceticAcidState, AceticAcidAction>): React.ReactElement {
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <AceticBench
        tubes={state.tubes}
        liquids={liquidsOf(state)}
        held={state.held}
        pend={state.pend}
        delivery={state.delivery}
        selected={state.sel}
        pulse={highlights}
        onSvg={onStageElement}
        onPick={(item) => dispatch({ type: 'hold', item })}
        onTube={(tube) =>
          state.held ? dispatch({ type: 'applyTo', tube, now: now() }) : dispatch({ type: 'selectTube', tube })
        }
      />
    </Box>
  );
}

/** What is in your hand, said in words, and the two things you can undo. */
function heldText(held: HeldItem | null, L: Liquids, pend: number | null): string {
  if (!held) return 'Hands free — tap a bottle or a tool to pick it up';
  if (held.kind === 'bottle') return `Holding **${L[held.id].label}** — tap a tube to add ${POUR} mL`;
  if (held.kind === 'pipe' && pend !== null) {
    return `Delivery tube corked into **tube ${pend + 1}** — now tap the tube the gas should bubble through`;
  }
  switch (held.kind) {
    case 'jar':
      return 'Holding the **NaHCO₃ jar** — tap a tube to tip in one spatula';
    case 'blue':
      return 'Holding **blue litmus** — tap a tube to dip a fresh strip';
    case 'red':
      return 'Holding **red litmus** — tap a tube to dip a fresh strip';
    case 'ph':
      return 'Holding **pH paper** — tap a tube to read its pH';
    case 'rod':
      return 'Holding the **glass rod** — tap a tube to shake and stir it';
    case 'waft':
      return 'Ready to **waft** — tap a tube to fan its vapour towards you';
    case 'sniff':
      return 'About to **put your nose to a tube** — this is not how a chemical is smelled';
    case 'pipe':
      return 'Holding the **delivery tube** — tap the tube making the gas, then the tube to bubble it through';
    case 'splint':
      return 'Holding a **burning splinter** — tap a tube to lower it into the mouth';
  }
}

const BENCH_BUTTON = {
  flex: 'none',
  color: apparatus.benchInk,
  borderColor: 'rgba(255,255,255,.16)',
  '&:hover': { backgroundColor: 'rgba(255,255,255,.07)', borderColor: 'rgba(255,255,255,.28)' },
  '&.Mui-disabled': { color: apparatus.benchInkMuted, borderColor: 'rgba(255,255,255,.08)' },
} as const;

function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const selected = state.tubes[state.sel]!;
  const locked = state.graded !== null || state.done;

  return (
    <Box
      data-tour="benchbar"
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
      <Box component="span" role="status" sx={{ minWidth: 0 }}>
        <RichText text={heldText(state.held, liquidsOf(state), state.pend)} />
      </Box>
      <Box sx={{ flex: 1 }} />
      {state.delivery || state.pend !== null ? (
        <Button
          size="small"
          variant="outlined"
          onClick={() => dispatch({ type: 'removeDelivery', now: now() })}
          sx={BENCH_BUTTON}
        >
          Remove delivery tube
        </Button>
      ) : null}
      <Button
        size="small"
        variant="outlined"
        startIcon={<Trash2 size={14} />}
        disabled={locked || volume(selected) === 0}
        onClick={() => dispatch({ type: 'emptyTube', tube: state.sel, now: now() })}
        sx={BENCH_BUTTON}
      >
        Empty tube {state.sel + 1}
      </Button>
      <Button
        size="small"
        variant="outlined"
        startIcon={<Hand size={14} />}
        disabled={!state.held}
        onClick={() => dispatch({ type: 'hold', item: null })}
        sx={BENCH_BUTTON}
      >
        Put down
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The magnified tube, docked beside the console
// ---------------------------------------------------------------------------

function Aside({ state, maxWidth }: View & { maxWidth: number }): React.ReactElement {
  const recording = state.step === STEP.record && !state.graded;
  const row = ROWS[state.row];
  const index = recording && row ? row.tube : state.sel;
  return (
    <TubeCloseUp
      tube={state.tubes[index]!}
      liquids={liquidsOf(state)}
      verdicts={!recording}
      maxWidth={maxWidth}
      title={recording ? `Tube ${index + 1} — look before you write` : undefined}
    />
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

function Chips({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>{children}</Box>;
}

/** A step's checklist: done tests in green, the ones still to do in grey. */
function Did({ done, label }: { done: boolean; label: string }): React.ReactElement {
  return <EmergeChip tone={done ? 'green' : 'grey'} dot={!done} icon={done ? <Check size={12} /> : undefined} label={label} />;
}

function Task(view: View): React.ReactElement {
  const { state } = view;
  const T = state.tubes;

  switch (state.step) {
    case STEP.setup: {
      const ready = T.filter((t, i) => tubeReady(i, t)).length;
      const spoiled = spoiledTubes(state);
      return (
        <>
          <SectionTitle>Set up the tubes</SectionTitle>
          <Hint>
            Six tubes, each labelled underneath with what belongs in it. Pick up a bottle and tap its tube to add {POUR} mL.
            Tube 6 holds dilute hydrochloric acid so you have a <b>strong</b> acid to measure against.
          </Hint>
          <Chips>
            <EmergeChip tone={ready === RACK.length ? 'green' : 'grey'} label={`${ready}/${RACK.length} tubes ready`} />
            {spoiled ? <EmergeChip tone="red" label={`${spoiled} spoiled`} /> : null}
          </Chips>
        </>
      );
    }

    case STEP.odour:
      return (
        <>
          <SectionTitle>(a) Odour</SectionTitle>
          <Hint>
            Hold the tube well away from your face and <b>fan the vapour towards your nose</b> with your hand. Waft tube 1,
            then tube 2, and notice that the same substance smells weaker once it is diluted. Putting your nose over the
            tube is on the bench because it happens in real labs — it costs technique marks and it is logged.
          </Hint>
          <Chips>
            <Did done={Boolean(T[TUBE.sample]!.smelled)} label="tube 1" />
            <Did done={Boolean(T[TUBE.diluted]!.smelled)} label="tube 2" />
          </Chips>
        </>
      );

    case STEP.solubility:
      return (
        <>
          <SectionTitle>(b) Solubility in water</SectionTitle>
          <Hint>
            Take the <b>glass rod</b> and shake tube 2, then tube 3. One of them will settle into a single clear layer; the
            other will not. That contrast is the whole observation.
          </Hint>
          <Chips>
            <Did done={T[TUBE.diluted]!.stirs > 0} label="tube 2 shaken" />
            <Did done={T[TUBE.oil]!.stirs > 0} label="tube 3 shaken" />
          </Chips>
        </>
      );

    case STEP.litmus:
      return (
        <>
          <SectionTitle>(c) Effect on litmus</SectionTitle>
          <Hint>
            Dip a fresh <b>blue</b> strip and a fresh <b>red</b> strip into tube 1 and read them against the chart on the
            bench. The <b>pH paper</b> is there too — use it on tube 1 and on tube 6 and compare the numbers.
          </Hint>
          <Chips>
            <Did done={Boolean(T[TUBE.sample]!.strips.blue)} label="blue litmus" />
            <Did done={Boolean(T[TUBE.sample]!.strips.red)} label="red litmus" />
            {T[TUBE.sample]!.phPaper !== null ? (
              <EmergeChip tone="blue" label={`tube 1 pH ${T[TUBE.sample]!.phPaper!.toFixed(1)}`} />
            ) : null}
            {T[TUBE.strong]!.phPaper !== null ? (
              <EmergeChip tone="blue" label={`tube 6 pH ${T[TUBE.strong]!.phPaper!.toFixed(1)}`} />
            ) : null}
          </Chips>
        </>
      );

    case STEP.carbonate:
      return (
        <>
          <SectionTitle>(d) Sodium hydrogen carbonate</SectionTitle>
          <Hint>
            Fit the <b>delivery tube</b> from tube 4 into the lime water in tube 5 first, then tip one spatula of{' '}
            <b>NaHCO₃</b> into tube 4. Gas is only evidence if you catch it. Once it has been through, take the delivery
            tube off and try a <b>burning splinter</b> in whichever tube has gas standing in it.
          </Hint>
          <Chips>
            <Did done={T[TUBE.carbonate]!.solidAdded > 0} label="NaHCO₃ added" />
            <Did done={T[TUBE.lime]!.gasIn > 0} label="gas passed through" />
            {T[TUBE.carbonate]!.gasMade > 1e-4 ? (
              <EmergeChip tone="blue" label={`${(T[TUBE.carbonate]!.gasMade * MLGAS).toFixed(0)} mL of gas`} />
            ) : null}
          </Chips>
        </>
      );

    case STEP.record:
      return <RecordTask {...view} />;

    default:
      return <ConclusionTask {...view} />;
  }
}

/**
 * The observation table, one row at a time.
 *
 * Eight selects at once is a form; one row with its tube magnified beside it is
 * an observation. Rows can be revisited until the table is handed in, which is
 * still all-or-nothing, as upstream.
 */
function RecordTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const index = Math.min(state.row, ROWS.length - 1);
  const row = ROWS[index]!;
  const value = state.rec[row.id] ?? '';
  const filled = ROWS.filter((r) => state.rec[r.id]).length;

  return (
    <>
      <SectionTitle>{row.short}</SectionTitle>
      <Hint>
        Row {index + 1} of {ROWS.length} · {row.q}. Record what <b>your</b> tube showed — the one drawn beside this — not
        what the textbook says it should have.
      </Hint>
      <RadioGroup
        value={value}
        onChange={(_, next) => dispatch({ type: 'recordRow', row: index, value: next, now: now() })}
        sx={{ mt: 1, gap: 0.25 }}
      >
        {row.o.map(([v, label]) => (
          <FormControlLabel
            key={v}
            value={v}
            control={<Radio size="small" />}
            label={label}
            sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: theme.band.type.base - 1 } }}
          />
        ))}
      </RadioGroup>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1 }}>
        <Button
          size="small"
          color="inherit"
          disabled={index === 0}
          onClick={() => dispatch({ type: 'goToRow', row: index - 1 })}
        >
          Back
        </Button>
        <Button
          size="small"
          color="inherit"
          disabled={index === ROWS.length - 1}
          onClick={() => dispatch({ type: 'goToRow', row: index + 1 })}
        >
          Next row
        </Button>
        <Box sx={{ flex: 1 }} />
        <EmergeChip
          tone={filled === ROWS.length ? 'green' : 'grey'}
          label={`${filled}/${ROWS.length} written up`}
        />
        <Button
          variant="contained"
          size="small"
          disabled={filled < ROWS.length}
          onClick={() => dispatch({ type: 'submitObservations', now: now() })}
        >
          Hand in the table
        </Button>
      </Box>
    </>
  );
}

/** Two things to settle, each marked against the student's own results. */
function ConclusionTask({ state, dispatch, now }: View): React.ReactElement {
  return (
    <>
      <SectionTitle>Conclusion</SectionTitle>
      <Hint>Two things to settle, and both follow from your own tubes rather than from the chapter.</Hint>
      <Box sx={{ mt: 1.5 }}>
        <ChoiceQuiz
          idPrefix="acetic-conclusion"
          questions={CONCLUSIONS.map((c) => ({
            q: c.q,
            options: c.o.map(([, label]) => label),
            answer: c.o.findIndex(([v]) => v === c.truth(state)),
            why: c.why,
          }))}
          picks={CONCLUSIONS.map((c) => {
            const picked = state.concl[c.id];
            return picked ? c.o.findIndex(([v]) => v === picked) : null;
          })}
          onPick={(question, option) =>
            dispatch({
              type: 'answerConclusion',
              index: question,
              option: CONCLUSIONS[question]!.o[option]![0],
              now: now(),
            })
          }
        />
      </Box>
    </>
  );
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function ObservationsPanel({ state }: { state: AceticAcidState }): React.ReactElement {
  const theme = useTheme();
  const graded = state.graded;

  return (
    <ObservationTable
      caption={
        graded
          ? 'Marked against what each tube actually showed'
          : state.step >= STEP.record
            ? 'One row per property — what you saw, not what the book says'
            : 'You fill this in after the four tests'
      }
      columns={[{ label: '#' }, { label: 'Observation', align: 'left' }, { label: 'You recorded', align: 'left' }]}
      rows={ROWS.map((row, i) => {
        const cell = graded?.cells[row.id];
        const picked = state.rec[row.id] ?? null;
        const live = !graded && state.step === STEP.record && state.row === i;
        return [
          <Box key="n" component="span" sx={{ color: live ? theme.brand.orange : 'inherit', fontWeight: live ? 700 : 400 }}>
            {i + 1}
          </Box>,
          <Box key="q" component="span" sx={{ color: theme.brand.sub }}>
            {row.q}
          </Box>,
          <Box key="a" component="span">
            <Box
              component="span"
              sx={{
                color: cell ? (cell.ok ? theme.onTint.green : theme.onTint.red) : theme.brand.text,
                fontWeight: cell?.ok === false ? 700 : 400,
              }}
            >
              {picked ? labelOf(row.o, picked) : '—'}
            </Box>
            {cell && !cell.ok ? (
              <Box component="span" sx={{ display: 'block', color: theme.brand.tert, fontSize: theme.band.type.min }}>
                the tube showed: {labelOf(row.o, cell.truth)}
              </Box>
            ) : null}
          </Box>,
        ];
      })}
      summary={
        graded
          ? ['', 'Observation table', <strong key="p">{graded.pts} / 32</strong>]
          : undefined
      }
    />
  );
}

/** What is in the rack, and which of the eight tests have actually been done. */
function RackPanel({ state }: { state: AceticAcidState }): React.ReactElement {
  const theme = useTheme();
  const L = liquidsOf(state);

  return (
    <>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {state.tubes.map((tube, i) => {
          const ids = wantedIds(i);
          const holds = Object.entries(tube.liq)
            .filter(([, ml]) => ml)
            .map(([id, ml]) => `${ml} mL ${L[id as keyof Liquids].short}`)
            .join(' + ');
          return (
            <Box
              key={i}
              component="li"
              sx={{ display: 'flex', alignItems: 'baseline', gap: 1, fontSize: theme.band.type.base - 1 }}
            >
              <Box component="span" sx={{ fontWeight: 700, minWidth: 18 }}>
                {i + 1}
              </Box>
              <Box component="span" sx={{ flex: 1, color: theme.brand.sub }}>
                {holds || `empty · takes ${ids.map((id) => `${RACK[i]!.want[id]} mL ${L[id].short}`).join(' + ')}`}
              </Box>
              {tubeSpoiled(i, tube) ? (
                <EmergeChip tone="red" label="spoiled" />
              ) : tubeReady(i, tube) ? (
                <EmergeChip tone="green" label="ready" />
              ) : null}
            </Box>
          );
        })}
      </Box>

      <Typography
        sx={{
          mt: 2,
          mb: 0.75,
          fontSize: theme.band.type.min,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: theme.brand.tert,
          fontWeight: 700,
        }}
      >
        Tests carried out
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {testList(state).map(([name, done]) => (
          <Did key={name} done={done} label={name} />
        ))}
      </Box>
    </>
  );
}

// ---------------------------------------------------------------------------
// "What's happening"
// ---------------------------------------------------------------------------

/**
 * The panel is pure data, so the drawings are joined to it here, by the key each
 * section names. Neither figure is handed the bench — `IonisationFigure` takes
 * nothing at all, and `MixingFigure` takes only the same `revealed` the prose
 * runs on, which is what keeps its bulk-scale half (two liquids standing in two
 * layers: rows `solB` and `solC`) out of sight until those rows are marked.
 */
function Teach({ revealed }: BenchTeachProps<AceticAcidState, AceticAcidAction>): React.ReactElement {
  return (
    <TeachSections
      sections={aceticAcidTeach(revealed)}
      figures={{ ionSvg: <IonisationFigure />, mixSvg: <MixingFigure revealed={revealed} /> }}
    />
  );
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = aceticAcidEngine;
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

export const aceticAcidBench: BenchDefinition<AceticAcidState, AceticAcidAction> = {
  engine: aceticAcidEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    showAside: () => true,
    // The chemistry of the acid itself — its equilibrium, its –COOH end, what
    // litmus answers and what lime water answers. None of that waits on a tube
    // being filled, so there is no `showTeach`.
    Teach,
    tabs: [
      { id: 'rack', label: 'Rack', Panel: RackPanel },
      { id: 'table', label: 'Observations', Panel: ObservationsPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) => (state.step >= STEP.record ? 'table' : 'rack'),
    tours: (ctx) => createAceticAcidTours(ctx),
    // "Show me this step", on the student's own rack. Passed by reference: it
    // reads the `teach` flag as a hook, which is what keeps the step that opens
    // the teaching panel out of the set when it has been removed.
    useTrainer: useAceticTrainer,
    highlightsFor: (step) => step?.highlight ?? [],
  },
};
