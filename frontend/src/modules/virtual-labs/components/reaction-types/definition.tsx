'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Flame, Timer, Trash2, Wind } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, RichText, Segmented } from '@/components/ui';
import {
  RX,
  SP,
  TAGS,
  TAMB,
  THERMO_MAX,
  TYPES,
  VDEF,
  classify,
  fmtMin,
  pHof,
  showsAs,
  tempOf,
  tickIsRight,
  typeLabel,
  vol,
  type RxId,
} from '@labs/lib/reaction-types/chemistry';
import { reactionTypesEngine } from '@labs/lib/reaction-types/engine';
import { STEP } from '@labs/lib/reaction-types/marking';
import type { ReactionAction } from '@labs/lib/reaction-types/reducer';
import type { ReactionTypesState } from '@labs/lib/reaction-types/state';
import { reactionTypesTeach, type TeachSection } from '@labs/lib/reaction-types/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { TeachSections } from '../teach-sections';
import { ObservationTable } from '../observation-table';

import { ReactionBench } from './bench';
import { createReactionTours } from './tours';
import { useReactionTrainer } from './trainer';
import { VesselArt } from './vessel-art';

type View = BenchViewProps<ReactionTypesState, ReactionAction>;

/**
 * The reaction-types bench: everything about this practical that is drawn.
 *
 * The engine beside it decides what happens; the shared workspace draws the
 * frame, the strip, the assistant, the notebook, the viva and the marks. What is
 * left here is this practical's own: the apparatus, the bench bar under it, the
 * step's one input, the magnified vessel docked beside that input, and the three
 * notebook panels.
 *
 * The step's input is deliberately narrow. Recording is done one reaction at a
 * time, and picking which reaction also swaps the vessel in the close-up — so
 * the tick you are about to make is always beside the glass you are judging.
 */

const RX_OF = (id: RxId) => RX.find((r) => r.id === id)!;

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<ReactionTypesState, ReactionAction>): React.ReactElement {
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <ReactionBench
        fill
        state={state}
        pulse={highlights}
        onSvg={onStageElement}
        onReagent={(k) => dispatch({ type: 'tapReagent', k })}
        onTool={(tool) => dispatch({ type: 'tapTool', tool })}
        onVessel={(k) => dispatch({ type: 'tapVessel', k, now: now() })}
        onPutDown={() => dispatch({ type: 'drop' })}
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

/** The bench bar: what is in your hand, the flame, and the lab clock. */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const h = state.held;
  const dose = h?.kind === 'bottle' ? `${state.dose[h.k]}${SP[h.k].g ? ' g' : ' mL'}` : '';
  const holding =
    !h
      ? 'Hands free — tap a bottle or a tool to pick it up'
      : h.kind === 'bottle'
        ? `Holding **${SP[h.k].name}** — tap a vessel to add ${dose}`
        : h.kind === 'nails'
          ? 'Holding **two iron nails** — tap a vessel to drop them in'
          : h.kind === 'litmusR'
            ? 'Holding **red litmus paper** — tap a vessel to dip a strip'
            : h.kind === 'litmusB'
              ? 'Holding **blue litmus paper** — tap a vessel to dip a strip'
              : h.kind === 'thermo'
                ? 'Holding the **thermometer** — tap a vessel to stand it in'
                : h.kind === 'stopper'
                  ? 'Holding the **rubber stopper** — tap a vessel to cork it, or tap it again to uncork'
                  : 'Holding the **burner** — tap a vessel to slide it underneath';
  const running = state.pending > 0;

  return (
    <Box
      data-tour="rx-controls"
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
        <RichText text={holding} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 8 }} />
      {h ? (
        <Button size="small" variant="outlined" onClick={() => dispatch({ type: 'drop' })} sx={BENCH_BUTTON}>
          Put down
        </Button>
      ) : null}
      <Button
        size="small"
        variant="outlined"
        startIcon={<Flame size={14} />}
        onClick={() => dispatch({ type: 'toggleFlame', now: now() })}
        sx={{
          ...BENCH_BUTTON,
          ...(state.flame ? { color: '#ffd9ab', borderColor: '#ff9f45' } : null),
        }}
      >
        {state.flame ? 'Turn the burner off' : 'Light the burner'}
      </Button>
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>
        Lab clock {fmtMin(state.min)}
      </Box>
      {[1, 5].map((n) => (
        <Button
          key={n}
          size="small"
          variant="outlined"
          startIcon={n === 1 ? <Timer size={14} /> : undefined}
          disabled={running}
          onClick={() => dispatch({ type: 'wait', minutes: n })}
          sx={{ ...BENCH_BUTTON, color: '#d9efff', borderColor: '#8fd0ff' }}
        >
          {running ? 'Running…' : `Wait ${n} min`}
        </Button>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The close-up, docked beside the input
// ---------------------------------------------------------------------------

/**
 * Every judgement in this practical is made by eye: a colour, a cloud, a layer
 * settling. At bench scale a tube is 34px wide, which is not enough to tell a
 * pale suspension from a clear solution — so the selected vessel is magnified
 * here, beside the ticks it is being recorded into.
 */
function Aside({ state, dispatch, maxWidth }: View & { maxWidth: number }): React.ReactElement {
  const theme = useTheme();
  const v = state.vessels[state.sel]!;
  const def = VDEF[state.sel]!;
  const T = tempOf(v);
  const feel = T >= 50 ? 'too hot to hold' : T >= 38 ? 'warm to the touch' : 'at room temperature';
  const contents = (Object.keys(v.c) as (keyof typeof v.c)[])
    .filter((k) => (v.c[k] ?? 0) > 1e-3)
    .map((k) => `${SP[k].g ? Math.round((v.c[k] ?? 0) * 100) / 100 : Math.round((v.c[k] ?? 0) * 10) / 10} ${SP[k].g ? 'g' : 'mL'} ${SP[k].label}`)
    .join(', ');
  const litmus = Object.entries(v.litmus)
    .map(([k, r]) => `${k === 'litmusR' ? 'Red' : 'Blue'} litmus came out ${r}`)
    .join('; ');

  return (
    <Box data-tour="rx-closeup" sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', maxWidth, mx: 'auto' }}>
      <Box
        sx={{
          flex: 'none',
          width: 86,
          borderRadius: `${theme.band.radius.md}px`,
          backgroundColor: apparatus.bench,
          p: 0.75,
        }}
      >
        <svg viewBox="0 0 120 250" role="img" aria-label={`Close-up of ${def.name}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
          <VesselArt
            v={v}
            cx={60}
            top={26}
            bottom={236}
            w={46}
            mlPx={8}
            gPx={13}
            uid="rx-closeup"
            minutesPerSecond={state.rate}
            big
            thermo={state.thermoIn === state.sel && !state.thermoBroken}
          />
        </svg>
      </Box>

      <Box sx={{ minWidth: 0, fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
        <Typography sx={{ fontWeight: 800, fontSize: theme.band.type.base, color: theme.brand.ink }}>
          {def.name.charAt(0).toUpperCase() + def.name.slice(1)}
        </Typography>
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2, '& li': { mb: 0.25 } }}>
          <li>
            {v.burst ? 'Nothing left in it' : contents || 'Empty'}
            {v.nails ? ` · ${v.nails} iron nails, in for ${fmtMin(state.min - v.nailsAt)}` : ''}
          </li>
          <li>
            {v.burst ? 'Shattered' : `The glass feels ${feel}`}
            {state.thermoIn === state.sel && !state.thermoBroken
              ? ` · thermometer reads ${T > THERMO_MAX ? 'off scale' : `${T.toFixed(0)} °C`}`
              : ''}
          </li>
          {pHof(v) !== null ? <li>{litmus || 'No litmus tested yet'}</li> : null}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
          {v.stopper ? <EmergeChip tone="amber" label="Stoppered" /> : null}
          {v.cracked ? <EmergeChip tone="red" label="Cracked" /> : null}
          {v.burst ? <EmergeChip tone="red" label="Burst" /> : null}
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.75 }}>
          <Button size="small" variant="outlined" color="inherit" startIcon={<Wind size={14} />} onClick={() => dispatch({ type: 'smell', k: state.sel })}>
            Waft and smell
          </Button>
          {!state.graded && !v.burst ? (
            <Button size="small" variant="text" color="inherit" startIcon={<Trash2 size={14} />} onClick={() => dispatch({ type: 'empty', k: state.sel })}>
              Empty and rinse
            </Button>
          ) : null}
        </Box>
      </Box>
    </Box>
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

function Hint({ text }: { text: string }): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography component="p" sx={{ m: 0, mt: 0.5, color: theme.brand.sub, fontSize: theme.band.type.base - 1, textWrap: 'pretty' }}>
      <RichText text={text} />
    </Typography>
  );
}

function Row({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mt: 1.25 }}>{children}</Box>;
}

/** A tick in the observation table, or a type in the classification. */
function Toggle({
  label,
  title,
  on,
  verdict,
  disabled,
  onClick,
}: {
  label: string;
  title?: string;
  on: boolean;
  /** After marking: whether this tick agreed with the vessel. */
  verdict?: 'ok' | 'no' | null;
  disabled?: boolean;
  onClick: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const edge =
    verdict === 'ok' ? theme.hues.green : verdict === 'no' ? theme.hues.red : on ? theme.brand.orange : theme.brand.line2;
  const fill =
    verdict === 'ok' ? theme.tints.green : verdict === 'no' ? theme.tints.red : on ? theme.tints.orange : 'transparent';
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={on}
      title={title}
      disabled={disabled}
      onClick={onClick}
      sx={{
        font: 'inherit',
        fontSize: theme.band.type.min + 1,
        fontWeight: on ? 800 : 600,
        textAlign: 'left',
        px: 1.25,
        py: 0.625,
        borderRadius: `${theme.band.radius.sm}px`,
        border: `1px solid ${edge}`,
        backgroundColor: fill,
        color: on || verdict ? theme.brand.ink : theme.brand.sub,
        cursor: disabled ? 'default' : 'pointer',
        transition: `all ${theme.band.motion.fast}ms`,
        '&:hover:not(:disabled)': { borderColor: theme.brand.orange },
      }}
    >
      {label}
    </Box>
  );
}

function Task({ state, dispatch, now }: View): React.ReactElement {
  const focus = state.focus;
  const rx = RX_OF(focus);

  switch (state.step) {
    case STEP.lime: {
      const lime = state.vessels[0]!;
      return (
        <>
          <SectionTitle>(i) Action of water on quicklime</SectionTitle>
          <Hint
            text={`Put about ${state.dose.CaO} g of **quicklime** into the first tube, then add **water**. Stand the **thermometer** in it, let a minute pass on the lab clock, and read it. When the fizzing stops, dip **red litmus** in the milky liquid.`}
          />
          <Row>
            {(['CaO', 'H2O'] as const).map((k) => (
              <EmergeChip key={k} tone={lime.added.includes(k) ? 'green' : 'grey'} label={SP[k].label} />
            ))}
            <EmergeChip tone={state.thermoSeen ? 'green' : 'grey'} label="thermometer" />
            <EmergeChip tone={state.litmusSeen ? 'green' : 'grey'} label="red litmus" />
          </Row>
          <Hint text="The other reactions can be set up in any order — (iii) is slow, so many students start it early." />
        </>
      );
    }

    case STEP.fs: {
      const fs = state.vessels[1]!;
      const inTube = (fs.c.FeSO4x7 ?? 0) > 0 || (fs.c.FeSO4s ?? 0) > 0 || (fs.c.Fe2O3 ?? 0) > 0;
      return (
        <>
          <SectionTitle>(ii) Action of heat on ferrous sulphate crystals</SectionTitle>
          <Hint
            text={`Put about ${state.dose.FeSO4x7} g of green **ferrous sulphate crystals** into a **dry** tube. Pick the **burner** up, slide it under that tube, light it, and let the clock run — watching what the crystals do as the tube gets hotter.`}
          />
          <Row>
            <EmergeChip tone={inTube ? 'green' : 'grey'} label="crystals in" />
            <EmergeChip tone={state.burnerAt === 1 ? 'green' : 'grey'} label="burner in place" />
            <EmergeChip tone={state.flame ? 'amber' : 'grey'} label={state.flame ? 'lit' : 'not lit'} />
            <EmergeChip
              tone={state.fsHeatMin >= 0.5 ? 'green' : 'grey'}
              label={`heated ${Math.round(state.fsHeatMin * 10) / 10} min`}
            />
          </Row>
          <Hint text="**Never** heat a corked tube, and take the flame away once the reaction is over." />
        </>
      );
    }

    case STEP.nails: {
      const nail = state.vessels[2]!;
      const ctrl = state.vessels[3]!;
      return (
        <>
          <SectionTitle>(iii) Iron nails in copper sulphate</SectionTitle>
          <Hint text="Pour **copper sulphate** into **two** tubes. Drop the **iron nails** into one of them and leave the other exactly as it is — that second tube is your **control**, and it is what tells you the change came from the iron." />
          <Row>
            <EmergeChip tone={vol(nail) > 0 ? 'green' : 'grey'} label="nail tube filled" />
            <EmergeChip tone={nail.nails ? 'green' : 'grey'} label="nails in" />
            <EmergeChip tone={vol(ctrl) > 0 && !ctrl.nails ? 'green' : 'grey'} label="control set up" />
          </Row>
          <Hint text="This one is slow. A coating shows within a few minutes; the blue does not plainly go until about fifteen." />
        </>
      );
    }

    case STEP.dd: {
      const dd = state.vessels[4]!;
      return (
        <>
          <SectionTitle>(iv) Sodium sulphate and barium chloride</SectionTitle>
          <Hint text="Pour **sodium sulphate** solution into the last tube, then add **barium chloride** solution to it. Watch the moment the two meet." />
          <Row>
            {(['Na2SO4', 'BaCl2'] as const).map((k) => (
              <EmergeChip key={k} tone={dd.added.includes(k) ? 'green' : 'grey'} label={SP[k].label} />
            ))}
          </Row>
        </>
      );
    }

    case STEP.record: {
      const picked = state.rec[focus];
      const started = RX.filter((r) => state.rec[r.id].length > 0).length;
      return (
        <>
          <SectionTitle>
            Record {rx.roman} {rx.title}
          </SectionTitle>
          <Hint text="Tick **everything that vessel actually showed you** — and nothing it did not. The clock still runs while you write, and every row is marked against its vessel **as it stands when you submit**." />
          <Box sx={{ mt: 1.25 }}>
            <Segmented
              ariaLabel="Reaction to record"
              value={focus}
              onChange={(id) => dispatch({ type: 'focusReaction', rx: id })}
              options={RX.map((r) => ({ value: r.id, label: r.roman }))}
            />
          </Box>
          <Row>
            {TAGS.map((t) => (
              <Toggle
                key={t.k}
                label={t.label}
                title={t.long}
                on={picked.includes(t.k)}
                onClick={() => dispatch({ type: 'toggleTick', rx: focus, tag: t.k })}
              />
            ))}
          </Row>
          <Row>
            <Button variant="contained" disabled={started < RX.length} onClick={() => dispatch({ type: 'submitObs', now: now() })}>
              Submit the table
            </Button>
            <EmergeChip tone={started === RX.length ? 'green' : 'grey'} label={`${started}/4 rows started`} />
            <EmergeChip tone="grey" label={`${fmtMin(state.min)} on the clock`} />
          </Row>
        </>
      );
    }

    default: {
      const chosen = RX.filter((r) => state.cls[r.id] !== '').length;
      return (
        <>
          <SectionTitle>Classify {rx.roman}</SectionTitle>
          <Hint text={`**${rx.title}** — ${rx.eq}`} />
          <Hint text="Count what goes in and what comes out, and look for a free element on both sides." />
          <Row>
            {TYPES.map((t) => (
              <Toggle
                key={t.k}
                label={t.label}
                on={state.cls[focus] === t.k}
                onClick={() => dispatch({ type: 'setClass', rx: focus, value: t.k })}
              />
            ))}
          </Row>
          <Box sx={{ mt: 1.25 }}>
            <Segmented
              ariaLabel="Reaction to classify"
              value={focus}
              onChange={(id) => dispatch({ type: 'focusReaction', rx: id })}
              options={RX.map((r) => ({ value: r.id, label: r.roman }))}
            />
          </Box>
          <Row>
            <Button variant="contained" disabled={chosen < RX.length} onClick={() => dispatch({ type: 'submitClass', now: now() })}>
              Submit classification
            </Button>
            <EmergeChip tone={chosen === RX.length ? 'green' : 'grey'} label={`${chosen}/4 named`} />
          </Row>
        </>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function ObservationsPanel({ state }: { state: ReactionTypesState }): React.ReactElement {
  const theme = useTheme();
  const ctrl = state.vessels[3]!;
  const graded = state.graded;

  if (graded) {
    return (
      <>
        <ObservationTable
          caption={`Marked against what each vessel showed at ${fmtMin(graded.min)}`}
          columns={[{ label: 'Reaction' }, { label: 'Your six ticks', align: 'left' }, { label: 'The vessel showed', align: 'left' }, { label: 'Marks' }]}
          rows={RX.map((r) => {
            const row = graded.rows[r.id];
            return [
              <strong key="r">{r.roman}</strong>,
              // EVERY tick, marked one at a time, and not only the ones that
              // were ticked: half the marks on this row are for the signals a
              // student correctly left blank, and a list of what they wrote
              // cannot show those at all. A row at 5/7 says two ticks went
              // wrong; this says WHICH two.
              <Box key="t" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {TAGS.map((t) => {
                  const on = row.picked.includes(t.k);
                  return (
                    <Toggle
                      key={t.k}
                      label={t.label}
                      title={t.long}
                      on={on}
                      verdict={tickIsRight(row.truth, t.k, on) ? 'ok' : 'no'}
                      disabled
                      onClick={() => undefined}
                    />
                  );
                })}
              </Box>,
              row.shown,
              <EmergeChip
                key="p"
                tone={row.match === TAGS.length ? 'green' : row.match >= 4 ? 'amber' : 'red'}
                label={`${Math.round(row.pts * 10) / 10}/7`}
              />,
            ];
          })}
        />
        <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
          Green is a tick that agreed with the vessel, red one that did not — a bold label is one you ticked, so a red
          plain one is a signal you missed and a red bold one is a signal that was never there. A row scores full marks
          when all six agree, including the ones you correctly left blank.
        </Typography>
      </>
    );
  }

  return (
    <>
      <Typography sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, mb: 1 }}>
        {state.step === STEP.record
          ? 'Tick everything you actually saw — and nothing you did not.'
          : 'You fill this in at the observation-table step.'}
      </Typography>
      {RX.map((r) => (
        <Box key={r.id} sx={{ mb: 1.25, pb: 1.25, borderBottom: `1px solid ${theme.brand.line}` }}>
          <Typography sx={{ fontSize: theme.band.type.base - 1, fontWeight: 700, color: theme.brand.ink }}>
            {r.roman} {r.title}{' '}
            <Box component="span" sx={{ fontWeight: 500, color: theme.brand.tert }}>
              {r.eq}
            </Box>
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
            {state.rec[r.id].length ? (
              state.rec[r.id].map((t) => <EmergeChip key={t} tone="orange" label={TAGS.find((g) => g.k === t)!.label} />)
            ) : (
              <Typography sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>Nothing recorded yet</Typography>
            )}
          </Box>
        </Box>
      ))}
      {vol(ctrl) > 0 ? (
        <Typography sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.sub }}>
          Control tube (copper sulphate, no nail) right now: <b>{showsAs(ctrl)}</b>. It is not marked — it is what
          reaction (iii) is compared against.
        </Typography>
      ) : null}
    </>
  );
}

function EquationsPanel({ state }: { state: ReactionTypesState }): React.ReactElement {
  const theme = useTheme();
  return (
    <>
      <ObservationTable
        caption="Two or more in and one out is combination; one in and two or more out is decomposition; a free element on each side is displacement; two compounds swapping ions is double displacement."
        columns={[{ label: '#' }, { label: 'Equation', align: 'left' }, { label: 'Your answer', align: 'left' }, { label: 'Marks' }]}
        rows={RX.map((r) => {
          const row = state.clsGraded?.[r.id];
          const truth = classify(r);
          return [
            <strong key="r">{r.roman}</strong>,
            r.eq,
            row ? (
              <Box key="a" component="span">
                {typeLabel(row.picked)}
                {row.pts ? '' : ` — it is ${typeLabel(truth).toLowerCase()}`}
              </Box>
            ) : (
              typeLabel(state.cls[r.id] === '' ? null : state.cls[r.id])
            ),
            row ? (
              <EmergeChip key="p" tone={row.pts ? 'green' : 'red'} label={`${row.pts}/6`} />
            ) : (
              ''
            ),
          ];
        })}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        Reaction (ii) is written from the anhydrous salt: the crystals first lose their water of crystallisation, and
        only the salt itself decomposes.
      </Typography>
    </>
  );
}

// ---------------------------------------------------------------------------
// "What's happening"
// ---------------------------------------------------------------------------

function Teach({ revealed }: BenchTeachProps<ReactionTypesState, ReactionAction>): React.ReactElement {
  return <TeachSections sections={reactionTypesTeach(revealed)} />;
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = reactionTypesEngine;
  return (
    <Box sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.sub }}>
      <Typography component="p" sx={{ m: 0, fontSize: 'inherit' }}>
        <b>Aim.</b> {meta.aim}
      </Typography>
      <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit' }}>
        <b>Theory.</b> {meta.theory}
      </Typography>
      <Typography component="p" sx={{ mt: 1, mb: 0, fontSize: 'inherit' }}>
        Room temperature on this bench is {TAMB} °C, and only reaction (ii) is heated. Everything the vessels do —
        the temperature, the colours, the smell, the precipitate — is worked out from what is in them.
      </Typography>
      <TextbookPassage scope={meta.textbook} query={meta.theoryQuery} topK={3} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

export const reactionTypesBench: BenchDefinition<ReactionTypesState, ReactionAction> = {
  engine: reactionTypesEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // Up to and including the observation table every judgement is made by eye,
    // so the magnified tube earns its space. After that the work is on paper.
    showAside: (state) => state.step <= STEP.record,
    // The four patterns and how to tell them apart, in letters rather than in
    // this bench's reagents. It is the same reading whichever vessel is
    // selected and whatever is in it, so there is no `showTeach`.
    Teach,
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'equations', label: 'Equations', Panel: EquationsPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) =>
      state.step >= STEP.classify ? 'equations' : state.step === STEP.record ? 'observations' : 'theory',
    tours: (ctx) => createReactionTours(ctx),
    // "Show me this step", on the student's own vessels. Passed by reference:
    // it reads the `teach` flag as a hook, which is what keeps the step that
    // opens the teaching panel out of the set when it has been removed.
    useTrainer: useReactionTrainer,
    highlightsFor: (step) => (step?.highlight ?? []) as readonly string[],
  },
};
