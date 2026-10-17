'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Droplets, Eraser, HandMetal, Ruler, Waves } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { EmergeChip, NumberField, RichText, Segmented } from '@/components/ui';
import { parseDecimal } from '@labs/lib/numbers';
import {
  DROPS,
  LATHERS,
  LEAST_COUNT,
  POUR,
  SHAKES_MIN,
  WATERS,
  WATER_BY_ID,
  frothWord,
  lathered,
  type Lather,
} from '@labs/lib/soap/chemistry';
import { soapEngine } from '@labs/lib/soap/engine';
import {
  REASONS,
  SCUM_MARKS,
  STEP,
  TUBES,
  TUBE_A,
  TUBE_B,
  WHICH_OPTIONS,
  heightMarksFor,
} from '@labs/lib/soap/marking';
import type { SoapAction } from '@labs/lib/soap/reducer';
import {
  entryAt,
  fairness,
  latherIn,
  recordedCount,
  tubeAt,
  volumeIn,
  type SoapState,
} from '@labs/lib/soap/state';
import { soapTeach, type TeachSection } from '@labs/lib/soap/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { TeachSections } from '../teach-sections';
import { ObservationTable } from '../observation-table';

import { SoapBench } from './bench';
import { LatherReader } from './lather-reader';
import { createSoapTours } from './tours';
import { useSoapTrainer } from './trainer';

type View = BenchViewProps<SoapState, SoapAction>;

/** Marks one froth height is worth, straight from the marking rule. */
const MARKS_PER_HEIGHT = heightMarksFor(0);
/** Full marks for one tube's row: its height and its scum. */
const MARKS_PER_ROW = MARKS_PER_HEIGHT + SCUM_MARKS;

/**
 * The soap bench: everything about this practical that is drawn.
 *
 * The engine decides what happens; the shared workspace draws the frame, the
 * step strip, the assistant, the notebook, the viva and the marks. What is
 * genuinely this practical's own is here: the apparatus, what is in the
 * student's hand, the one input the current step asks for, the magnified tube
 * docked beside that input, and the three notebook panels.
 */

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

/** Each tube's lather, worked out once and shared by the stage and the console. */
function lathersOf(state: SoapState): Lather[] {
  return state.tubes.map((_, k) => latherIn(state, k));
}

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<SoapState, SoapAction>): React.ReactElement {
  return (
    <Box sx={{ flex: 1, minHeight: 240, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <SoapBench
        tubes={state.tubes}
        lathers={lathersOf(state)}
        held={state.held}
        sel={state.sel}
        pulse={highlights}
        onSvg={onStageElement}
        onPickUp={(held) => dispatch({ type: 'pickUp', held })}
        onTapTube={(index) => dispatch({ type: 'tapTube', index, now: now() })}
        onPutDown={() => dispatch({ type: 'putDown' })}
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

/** What is in the student's hand, and the one thing that acts on a whole tube. */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const held = state.held;
  const hands = !held
    ? 'Hands free — tap a bottle, the soap dropper, the corks or the scale to pick it up'
    : held.kind === 'water'
      ? `Holding ${WATER_BY_ID[held.id].label} — tap a tube to add ${POUR} mL`
      : held.kind === 'soap'
        ? `Holding the soap dropper — tap a tube to squeeze in ${DROPS} drops`
        : held.kind === 'cork'
          ? 'Holding a cork — tap a tube to cork it and shake once'
          : 'Holding the centimetre scale — tap a tube to hold it against the froth';

  return (
    <Box
      data-tour="soap-hands"
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
        <Box component="span" role="status" sx={{ fontWeight: held ? 700 : 400 }}>
          {hands}
        </Box>
      </Box>
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
        variant="outlined"
        startIcon={<Eraser size={14} />}
        disabled={volumeIn(state, state.sel) === 0 || state.done}
        onClick={() => dispatch({ type: 'emptyTube', index: state.sel, now: now() })}
        sx={BENCH_BUTTON}
      >
        Empty and rinse
      </Button>
      <Button size="small" variant="outlined" disabled={!state.held} onClick={() => dispatch({ type: 'putDown' })} sx={BENCH_BUTTON}>
        Put down
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The magnified tube, docked beside the height field
// ---------------------------------------------------------------------------

/** What the selected tube holds, said plainly. The reading itself is not given. */
function tubeCaption(state: SoapState, index: number): React.ReactNode {
  const spec = TUBES[index];
  const t = tubeAt(state, index);
  const poured = [...new Set(t.added)].map((id) => WATER_BY_ID[id].label).join(' + ');
  const wrong = spec ? t.added.some((a) => a !== spec.water) : false;
  return (
    <>
      <Box component="b">
        Tube {spec?.id ?? '?'}
        {spec?.marked ? '' : ' (extra)'}
      </Box>
      <br />
      {volumeIn(state, index) ? `${volumeIn(state, index)} mL of ${poured}` : 'Empty — pour the water in first'}
      {wrong ? ' · wrong water' : ''}
      <br />
      {t.drops ? `${t.drops} drops of soap` : 'No soap yet'}
      {t.shakes ? ` · shaken ${t.shakes}×` : ''}
      {t.measured ? '' : ' · not measured'}
    </>
  );
}

/**
 * Which tube the console is talking about.
 *
 * Usually whichever one was last tapped, but the two marked steps know better:
 * the record step only ever writes A or B, and the extension is tube B by
 * definition. Without this the magnified tube can end up showing one tube while
 * the box underneath it edits another.
 */
function focusTube(state: SoapState): number {
  if (state.step === STEP.extend) return TUBE_B;
  if (state.step === STEP.record) return state.sel === TUBE_B ? TUBE_B : TUBE_A;
  return state.sel;
}

function Aside({ state, dispatch, maxWidth }: View & { maxWidth: number }): React.ReactElement {
  const index = focusTube(state);
  const tube = tubeAt(state, index);
  const typed = parseDecimal(entryAt(state, index).height);
  const recording = state.step === STEP.record && state.graded === null;

  return (
    <LatherReader
      lather={latherIn(state, index)}
      caption={tubeCaption(state, index)}
      measured={tube.measured}
      reading={Number.isNaN(typed) ? null : typed}
      maxWidth={maxWidth}
      onRead={
        recording
          ? (cm) => dispatch({ type: 'setEntry', index, field: 'height', value: cm.toFixed(1) })
          : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------
// The current step, and its one input
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
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1,
        mt: 1.5,
        '& > .MuiFormControl-root': { flex: '0 1 150px', minWidth: 120 },
      }}
    >
      {children}
    </Box>
  );
}

/** Pick something up from the console, for a student who has not found the bench yet. */
function TakeButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  return (
    <Button size="small" variant={active ? 'contained' : 'outlined'} color="inherit" startIcon={icon} onClick={onClick}>
      {label}
    </Button>
  );
}

const SCUM_OPTIONS = [
  { value: 'scum' as const, label: 'Scum' },
  { value: 'none' as const, label: 'None' },
];

function RecordTask({ state, dispatch, now }: View): React.ReactElement {
  const index = focusTube(state);
  const entry = entryAt(state, index);
  const filled = recordedCount(state);
  const spec = TUBES[index];
  const stale = !tubeAt(state, index).measured;

  return (
    <>
      <SectionTitle>Record tube {spec?.id ?? 'A'}</SectionTitle>
      <Hint>
        {stale ? (
          <RichText text="**This tube has changed since you measured it.** Pick up the scale and hold it against the tube again before you write anything down." />
        ) : (
          <RichText text="Read the froth column off the scale beside you, to the nearest millimetre, and say whether that tube showed scum. You are marked against **what the tube actually showed** — record what you read, not what the book says." />
        )}
      </Hint>
      <Fields>
        <Segmented
          ariaLabel="Tube to record"
          value={String(index)}
          onChange={(value) => dispatch({ type: 'selectTube', index: Number(value) })}
          options={[
            { value: String(TUBE_A), label: 'A · distilled' },
            { value: String(TUBE_B), label: 'B · hard' },
          ]}
        />
        <EmergeChip tone={filled === 2 ? 'green' : 'grey'} label={`${filled}/2 rows written`} />
      </Fields>
      <Fields>
        <NumberField
          id="soap-height"
          label="Froth height"
          unit="cm"
          value={entry.height}
          placeholder="0.0"
          onChange={(value) => dispatch({ type: 'setEntry', index, field: 'height', value })}
          onEnter={() => dispatch({ type: 'selectTube', index: index === TUBE_A ? TUBE_B : TUBE_A })}
        />
        <Segmented
          ariaLabel={`Scum in tube ${spec?.id ?? ''}`}
          value={entry.scum}
          onChange={(value) => dispatch({ type: 'setEntry', index, field: 'scum', value })}
          options={SCUM_OPTIONS}
        />
        <Button variant="contained" disabled={filled < 2} onClick={() => dispatch({ type: 'submitTable', now: now() })}>
          Submit the table
        </Button>
      </Fields>
    </>
  );
}

function ExtensionTask({ state, dispatch, now }: View): React.ReactElement {
  const b = tubeAt(state, TUBE_B);
  const m = latherIn(state, TUBE_B);
  const made = lathered(m);

  return (
    <>
      <SectionTitle>Extension — soap the hard water until it lathers</SectionTitle>
      <Hint>
        <RichText
          text={
            'Keep squeezing soap into **tube B** and shaking it. Once every Ca²⁺ and Mg²⁺ ion has been thrown out as ' +
            'scum, the next soap you add stays in solution — and hard water lathers after all. Watch the close-up and ' +
            `stop as soon as a real froth column (${LATHERS} cm) stands above the water.`
          }
        />
      </Hint>
      <Fields>
        <TakeButton
          active={state.held?.kind === 'soap'}
          label="Take the dropper"
          icon={<Droplets size={14} />}
          onClick={() => dispatch({ type: 'pickUp', held: { kind: 'soap' } })}
        />
        <EmergeChip tone="grey" label={`B: ${b.drops} drops · ${b.shakes} shakes`} />
        <EmergeChip tone={made ? 'green' : 'amber'} label={frothWord(m)} />
      </Fields>
      <Fields>
        <NumberField
          id="soap-ext"
          label="Drops tube B needed in all"
          unit="drops"
          value={state.extDrops}
          placeholder="e.g. 8"
          onChange={(value) => dispatch({ type: 'setExtDrops', value })}
          onEnter={() => dispatch({ type: 'submitExtension', skipped: false, now: now() })}
        />
        <Button variant="contained" disabled={!made} onClick={() => dispatch({ type: 'submitExtension', skipped: false, now: now() })}>
          {made ? 'Submit' : 'Make it lather first'}
        </Button>
        <Button variant="text" color="inherit" onClick={() => dispatch({ type: 'submitExtension', skipped: true, now: now() })}>
          Skip the extension
        </Button>
      </Fields>
    </>
  );
}

function ChoiceRow({
  options,
  picked,
  onPick,
}: {
  options: readonly string[];
  picked: string;
  onPick: (value: string) => void;
}): React.ReactElement {
  return (
    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {options.map((o, j) => (
        <Button
          key={o}
          size="small"
          variant={picked === String(j) ? 'contained' : 'outlined'}
          color="inherit"
          onClick={() => onPick(String(j))}
          sx={{ justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', fontWeight: 500 }}
        >
          {o}
        </Button>
      ))}
    </Box>
  );
}

function ConclusionTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const pick = state.conclPick;

  return (
    <>
      <SectionTitle>Conclusion</SectionTitle>
      <Hint>
        <RichText text="From **your own** table: which water washed better — that is, gave more lather with the same soap and the same shaking?" />
      </Hint>
      <ChoiceRow
        options={WHICH_OPTIONS}
        picked={pick.which}
        onPick={(value) => dispatch({ type: 'setConclusion', field: 'which', value })}
      />
      <Typography sx={{ mt: 1.5, fontWeight: 700, fontSize: theme.band.type.base - 0.5, color: theme.brand.ink }}>
        Why?
      </Typography>
      <ChoiceRow
        options={REASONS}
        picked={pick.why}
        onPick={(value) => dispatch({ type: 'setConclusion', field: 'why', value })}
      />
      <Fields>
        <Button
          variant="contained"
          disabled={pick.which === '' || pick.why === ''}
          onClick={() => dispatch({ type: 'submitConclusion', now: now() })}
        >
          Submit conclusion
        </Button>
      </Fields>
    </>
  );
}

function Task(view: View): React.ReactElement {
  const { state, dispatch } = view;
  const a = tubeAt(state, TUBE_A);
  const b = tubeAt(state, TUBE_B);

  switch (state.step) {
    case STEP.fill:
      return (
        <>
          <SectionTitle>Fill the two tubes</SectionTitle>
          <Hint>
            <RichText
              text={
                `Tube **A** takes distilled water, tube **B** takes hard water — the labels are under the rack. Pick ` +
                `up a bottle and tap its tube to add ${POUR} mL. **Equal volumes**, or the comparison proves nothing. ` +
                'Tube C is optional and unmarked: fill it with boiled hard water to see what boiling does to hardness.'
              }
            />
          </Hint>
          <Fields>
            {WATERS.map((w) => (
              <TakeButton
                key={w.id}
                active={state.held?.kind === 'water' && state.held.id === w.id}
                label={w.label}
                icon={<Droplets size={14} />}
                onClick={() => dispatch({ type: 'pickUp', held: { kind: 'water', id: w.id } })}
              />
            ))}
            <EmergeChip tone={volumeIn(state, TUBE_A) ? 'green' : 'grey'} label={`A: ${volumeIn(state, TUBE_A)} mL`} />
            <EmergeChip tone={volumeIn(state, TUBE_B) ? 'green' : 'grey'} label={`B: ${volumeIn(state, TUBE_B)} mL`} />
          </Fields>
        </>
      );

    case STEP.soap:
      return (
        <>
          <SectionTitle>Add the soap solution</SectionTitle>
          <Hint>
            <RichText
              text={
                `Pick up the dropper and squeeze **${DROPS} drops** at a time. Put the **same** number of drops into A ` +
                'and into B — that is the whole point of the test. Two squeezes each is plenty to start with.'
              }
            />
          </Hint>
          <Fields>
            <TakeButton
              active={state.held?.kind === 'soap'}
              label="Take the dropper"
              icon={<Droplets size={14} />}
              onClick={() => dispatch({ type: 'pickUp', held: { kind: 'soap' } })}
            />
            <EmergeChip tone={a.drops ? 'green' : 'grey'} label={`A: ${a.drops} drops`} />
            <EmergeChip tone={b.drops ? 'green' : 'grey'} label={`B: ${b.drops} drops`} />
            <EmergeChip tone={a.drops === b.drops ? 'green' : 'red'} label={a.drops === b.drops ? 'equal' : 'not equal'} />
          </Fields>
        </>
      );

    case STEP.shake:
      return (
        <>
          <SectionTitle>Cork and shake both tubes</SectionTitle>
          <Hint>
            <RichText
              text={
                'Pick up a cork and tap a tube to cork it and shake it once. Shake each tube the **same** number of ' +
                `times — at least ${SHAKES_MIN} — so that the mixing is the same in both.`
              }
            />
          </Hint>
          <Fields>
            <TakeButton
              active={state.held?.kind === 'cork'}
              label="Take a cork"
              icon={<Waves size={14} />}
              onClick={() => dispatch({ type: 'pickUp', held: { kind: 'cork' } })}
            />
            <EmergeChip tone={a.shakes >= SHAKES_MIN ? 'green' : 'grey'} label={`A: ${a.shakes} shakes`} />
            <EmergeChip tone={b.shakes >= SHAKES_MIN ? 'green' : 'grey'} label={`B: ${b.shakes} shakes`} />
            <EmergeChip tone={a.shakes === b.shakes ? 'green' : 'red'} label={a.shakes === b.shakes ? 'equal' : 'not equal'} />
          </Fields>
        </>
      );

    case STEP.measure:
      return (
        <>
          <SectionTitle>Measure the froth</SectionTitle>
          <Hint>
            <RichText
              text={
                'Pick up the **centimetre scale** and tap each tube. The scale sits with its **zero at the water ' +
                'line**, so the height of the froth column reads straight off it. Measure the **froth** above the ' +
                'water, not the scummy layer in it.'
              }
            />
          </Hint>
          <Fields>
            <TakeButton
              active={state.held?.kind === 'scale'}
              label="Take the scale"
              icon={<Ruler size={14} />}
              onClick={() => dispatch({ type: 'pickUp', held: { kind: 'scale' } })}
            />
            <EmergeChip tone={a.measured ? 'green' : 'grey'} label={a.measured ? 'A measured' : 'A not measured'} />
            <EmergeChip tone={b.measured ? 'green' : 'grey'} label={b.measured ? 'B measured' : 'B not measured'} />
          </Fields>
        </>
      );

    case STEP.record:
      return <RecordTask {...view} />;

    case STEP.extend:
      return <ExtensionTask {...view} />;

    default:
      return <ConclusionTask {...view} />;
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function ObservationsPanel({ state }: { state: SoapState }): React.ReactElement {
  const theme = useTheme();
  const graded = state.graded;
  const rows = TUBES.map((spec, k) => ({ spec, k })).filter(({ spec, k }) => spec.marked || volumeIn(state, k) > 0);

  return (
    <>
      <ObservationTable
        caption={
          graded
            ? 'Marked against the froth each tube actually showed — tube C is extra and is not marked'
            : state.step === STEP.record
              ? 'Read each froth column off the scale, to the nearest millimetre'
              : 'You fill this in at the Record step'
        }
        columns={[
          { label: 'Tube' },
          { label: 'Soap · shakes' },
          { label: 'Froth (cm)' },
          { label: 'Scum', align: 'left' },
          ...(graded ? [{ label: 'Marks' as const }] : []),
        ]}
        rows={rows.map(({ spec, k }) => {
          const t = tubeAt(state, k);
          const entry = entryAt(state, k);
          const cell = graded?.cells[k];
          return [
            <React.Fragment key="t">
              <Box component="b">{spec.id}</Box>
              <Box component="span" sx={{ display: 'block', fontSize: theme.band.type.min, color: theme.brand.tert }}>
                {WATER_BY_ID[spec.water].short}
                {spec.marked ? '' : ' · extra'}
              </Box>
            </React.Fragment>,
            <React.Fragment key="s">
              {t.drops} d · {t.shakes} sh
              <Box component="span" sx={{ display: 'block', fontSize: theme.band.type.min, color: theme.brand.tert }}>
                {volumeIn(state, k)} mL
              </Box>
            </React.Fragment>,
            <React.Fragment key="h">
              {entry.height.trim() === '' ? '—' : entry.height}
              {cell ? (
                <Box component="span" sx={{ color: theme.brand.tert }}> ({cell.trueHeight.toFixed(2)})</Box>
              ) : null}
            </React.Fragment>,
            <React.Fragment key="c">
              {entry.scum === '' ? '—' : entry.scum}
              {cell ? (
                <Box component="span" sx={{ color: theme.brand.tert }}> ({cell.trueScum ? 'scum' : 'none'})</Box>
              ) : null}
            </React.Fragment>,
            ...(graded
              ? [
                  spec.marked ? (
                    <EmergeChip
                      key="m"
                      tone={cell && cell.pts === MARKS_PER_ROW ? 'green' : cell && cell.pts >= SCUM_MARKS ? 'amber' : 'red'}
                      label={`${cell?.pts ?? 0}/${MARKS_PER_ROW}`}
                    />
                  ) : (
                    <Box key="m" component="span" sx={{ color: theme.brand.tert }}>
                      not marked
                    </Box>
                  ),
                ]
              : []),
          ];
        })}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textWrap: 'pretty' }}>
        A froth line is never sharper than the scale: a height within one division ({LEAST_COUNT} cm) of what the tube
        showed earns all {MARKS_PER_HEIGHT} marks, within two divisions still earns {MARKS_PER_HEIGHT / 2}.
      </Typography>
    </>
  );
}

/**
 * The three things that have to match, live.
 *
 * Kept out of the table on purpose: the table is what the student observed, and
 * this is what makes those observations mean anything. A tube that frothed more
 * because it got more soap proves nothing about the water, however neat the
 * numbers look.
 */
function FairTestPanel({ state }: { state: SoapState }): React.ReactElement {
  const theme = useTheme();
  const a = tubeAt(state, TUBE_A);
  const b = tubeAt(state, TUBE_B);
  const judged = state.fair;
  const live = fairness(state);
  const shown = judged ?? live;

  const rows: { label: string; a: string; b: string; ok: boolean }[] = [
    {
      label: 'Water',
      a: `${volumeIn(state, TUBE_A)} mL distilled`,
      b: `${volumeIn(state, TUBE_B)} mL hard`,
      ok: shown.volumes,
    },
    { label: 'Soap', a: `${a.drops} drops`, b: `${b.drops} drops`, ok: shown.soap },
    { label: 'Shaking', a: `${a.shakes}×`, b: `${b.shakes}×`, ok: shown.shaking },
  ];

  return (
    <>
      <ObservationTable
        caption={
          judged
            ? 'Judged at the moment you submitted the table — the soap you added afterwards does not count against it'
            : 'Checked when you submit the table. Only the water may differ between A and B'
        }
        columns={[{ label: 'Control' }, { label: 'Tube A', align: 'left' }, { label: 'Tube B', align: 'left' }, { label: '' }]}
        rows={rows.map((r) => [
          r.label,
          r.a,
          r.b,
          <EmergeChip key="ok" tone={r.ok ? 'green' : 'red'} label={r.ok ? 'equal' : 'differs'} />,
        ])}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, textWrap: 'pretty' }}>
        <RichText text="Equal volumes, equal soap, equal shaking. Then the only difference left is the **water**, and the froth can be blamed on its hardness — which is the whole experiment." />
      </Typography>
    </>
  );
}

// ---------------------------------------------------------------------------
// "What's happening"
// ---------------------------------------------------------------------------

function Teach({ revealed }: BenchTeachProps<SoapState, SoapAction>): React.ReactElement {
  return <TeachSections sections={soapTeach(revealed)} />;
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = soapEngine;
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

export const soapBench: BenchDefinition<SoapState, SoapAction> = {
  engine: soapEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // The magnified tube earns its space exactly while a froth column is being
    // judged by eye: measuring it, writing it down, and growing one in tube B.
    showAside: (state) => state.step >= STEP.measure && state.step <= STEP.extend,
    // What soap is and what hard water does to it — true of the bottle on the
    // shelf, so it does not wait for a tube to be filled and there is no
    // `showTeach`. It deliberately stops short of the conclusion.
    Teach,
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'fair', label: 'Fair test', Panel: FairTestPanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) => (state.step <= STEP.shake ? 'fair' : 'observations'),
    tours: (ctx) => createSoapTours(ctx),
    // "Show me this step", on the student's own pair of tubes. Passed by
    // reference: it reads the `teach` flag as a hook, which is what keeps the
    // step that opens the teaching panel out of the set when it has been removed.
    useTrainer: useSoapTrainer,
    highlightsFor: (step) => step?.highlight ?? [],
  },
};
