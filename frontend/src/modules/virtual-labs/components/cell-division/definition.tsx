'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Eye, Microscope as MicroscopeIcon } from 'lucide-react';

import { TextbookPassage } from '@/components/textbook/textbook-passage';
import { ChoiceQuiz, EmergeChip, RichText } from '@/components/ui';
import { cellDivisionEngine } from '@labs/lib/cell-division/engine';
import {
  CONCLUSION,
  PER_SLIDE_TABLE_MARKS,
  STEP,
  TRAY_SIZE,
} from '@labs/lib/cell-division/marking';
import { LAMPS, totalMagnification } from '@labs/lib/cell-division/optics';
import type { CellDivisionAction } from '@labs/lib/cell-division/reducer';
import {
  FEATURE_TEXT,
  ORGANISMS,
  PROCESSES,
  SPECIMENS,
  type Organism,
  type Process,
  type SpecimenId,
} from '@labs/lib/cell-division/specimens';
import {
  canIdentify,
  canLabel,
  examinedCount,
  mountedSlide,
  recordedCount,
  specimenOf,
  viewThrough,
  type CellDivisionState,
  type TraySlide,
} from '@labs/lib/cell-division/state';
import { cellDivisionTeach } from '@labs/lib/cell-division/teach';
import type { BenchDefinition, BenchStageProps, BenchTeachProps, BenchViewProps } from '@labs/types/lab-bench';

import { apparatus } from '../apparatus-palette';
import { ObservationTable } from '../observation-table';
import { TeachSections } from '../teach-sections';

import { Microscope, instrumentLine } from './microscope';
import { ReferencePlate, ReferenceSheet } from './reference-plate';
import { createCellDivisionTours } from './tours';
import { useCellDivisionTrainer } from './trainer';

type View = BenchViewProps<CellDivisionState, CellDivisionAction>;

/**
 * The fission-and-budding bench: everything about this practical that is drawn.
 *
 * The engine decides what happens; the shared workspace draws the frame, the
 * step strip, the assistant, the notebook, the viva and the marks. What is
 * genuinely this practical's own is here: the microscope, the eyepiece, the one
 * input the current step asks for, the reference plate docked beside that
 * input, and the three notebook panels.
 */

/** Which reference figure matches what has been written for a slide, if any. */
function pickedFigure(slide: TraySlide | null): SpecimenId | null {
  if (!slide || !slide.org || !slide.proc) return null;
  return SPECIMENS.find((s) => s.organism === slide.org && s.process === slide.proc)?.id ?? null;
}

function pickedFeature(slide: TraySlide | null): SpecimenId | null {
  if (!slide || !slide.seen) return null;
  return SPECIMENS.find((s) => s.feature === slide.seen)?.id ?? null;
}

// ---------------------------------------------------------------------------
// The apparatus
// ---------------------------------------------------------------------------

function Stage({
  state,
  dispatch,
  now,
  onStageElement,
  highlights,
}: BenchStageProps<CellDivisionState, CellDivisionAction>): React.ReactElement {
  const v = viewThrough(state);
  return (
    <Box sx={{ flex: 1, minHeight: 260, display: 'flex', p: { xs: 0.5, sm: 1 }, backgroundColor: apparatus.bench }}>
      <Microscope
        state={state}
        pulse={highlights}
        showPins={canLabel(state, v)}
        activePin={state.step === STEP.slides ? state.pin : -1}
        onSvg={onStageElement}
        onMount={(index) => dispatch({ type: 'mountSlide', index, now: now() })}
        onObjective={(objective) => dispatch({ type: 'setObjective', objective, now: now() })}
        onRack={(knob, dir) => dispatch({ type: 'rack', knob, dir, now: now() })}
        onMove={(dir) => dispatch({ type: 'moveStage', dir })}
        onLamp={() => dispatch({ type: 'cycleLamp' })}
        onPan={(x, y) => dispatch({ type: 'panStage', x, y })}
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

/** What the instrument is set to, and the one thing that acts on the whole slide. */
function Controls({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      data-tour="cd-instrument"
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
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
        <MicroscopeIcon size={14} aria-hidden="true" />
        <Box component="span" role="status">
          {instrumentLine(state)}
        </Box>
      </Box>
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
        variant="outlined"
        startIcon={<Eye size={14} />}
        disabled={state.mounted === null}
        onClick={() => dispatch({ type: 'takeOff', now: now() })}
        sx={BENCH_BUTTON}
      >
        Take the slide off
      </Button>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The reference plate, docked beside the input
// ---------------------------------------------------------------------------

function Aside({ state, dispatch, maxWidth }: View & { maxWidth: number }): React.ReactElement {
  const recording = state.step === STEP.record && state.graded === null;
  const slide = recording ? (state.tray[state.row] ?? null) : mountedSlide(state);
  const v = viewThrough(state);
  const live = recording || (slide !== null && canIdentify(v) && state.step === STEP.slides);

  return (
    <ReferencePlate
      mode={recording ? 'record' : 'identify'}
      picked={recording ? pickedFeature(slide) : pickedFigure(slide)}
      maxWidth={maxWidth}
      onPick={
        live
          ? (id: SpecimenId) => {
              if (recording) {
                const feature = SPECIMENS.find((s) => s.id === id)?.feature;
                if (feature) dispatch({ type: 'setSeen', index: state.row, feature });
              } else {
                dispatch({ type: 'identifyAs', specimen: id });
              }
            }
          : undefined
      }
      caption={
        recording
          ? `Slide ${slide?.n ?? '—'}: tap the figure that matches what was in the field.`
          : !slide
            ? 'Nothing is on the stage yet. Clip a slide on and find it at 10×.'
            : live
              ? 'Tap the figure your field matches. It records the organism and the process together.'
              : 'Get the specimen into the field and into focus — you cannot name what you cannot see.'
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
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mt: 1.25 }}>{children}</Box>
  );
}

/** A row of small choices: the one input a step asks for, wrapped to fit. */
function Options<T extends string>({
  label,
  options,
  value,
  onPick,
}: {
  label: string;
  options: readonly T[];
  value: T | '';
  onPick: (value: T) => void;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Box sx={{ mt: 1 }}>
      <Typography
        sx={{
          fontSize: theme.band.type.min,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: theme.brand.tert,
          fontWeight: 700,
        }}
      >
        {label}
      </Typography>
      <Box role="group" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
        {options.map((option) => {
          const on = option === value;
          return (
            <Box
              key={option}
              component="button"
              type="button"
              aria-pressed={on}
              onClick={() => onPick(option)}
              sx={{
                font: 'inherit',
                cursor: 'pointer',
                px: 1,
                py: 0.4,
                borderRadius: `${Math.max(6, theme.band.radius.sm - 2)}px`,
                border: `1px solid ${on ? theme.brand.ink : theme.brand.line2}`,
                backgroundColor: on ? theme.brand.ink : theme.brand.surface,
                color: on ? theme.brand.surface : theme.brand.text,
                fontSize: theme.band.type.min + 0.5,
                fontWeight: on ? 800 : 600,
                '&:hover': { borderColor: theme.brand.orange },
                '&:focus-visible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 2 },
              }}
            >
              {option}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

/** The ladder of hints a student climbs from a dark field to a labelled view. */
function focusHint(state: CellDivisionState): string {
  const v = viewThrough(state);
  if (v.light === 0) return 'The lamp is off, so the field is dark. A dark field is not an empty slide.';
  if (v.q < 0.05) {
    return 'Nothing to see yet. Move the stage to bring the specimen into the field — or drag the image itself — then rack the tube until it comes up sharp.';
  }
  if (v.f < 0.99) return 'Something is in the field but it is off to one side — centre it before you go to high power.';
  if (v.sharp < 0.8) return 'In the field, not yet sharp. Turn the adjustment slowly through the plane of best focus.';
  if (state.objective === 10) return 'Sharp and centred at 10×. Now swing in the **40×** and refocus with the **fine** adjustment.';
  return 'Sharp and centred at 40× — this is the view you identify and label.';
}

function SlidesTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const slide = mountedSlide(state);
  const v = viewThrough(state);
  const examined = examinedCount(state);

  if (!slide) {
    return (
      <>
        <SectionTitle>
          Work through the slides · {examined}/{TRAY_SIZE} examined
        </SectionTitle>
        <Hint>
          Take a slide from the box and clip it to the stage. Each is labelled only by a number, so the only way to know
          what is on it is to look.
        </Hint>
        <Fields>
          {state.tray.map((s, i) => (
            <Button
              key={s.n}
              size="small"
              variant="outlined"
              color="inherit"
              disabled={s.broken}
              onClick={() => dispatch({ type: 'mountSlide', index: i, now: now() })}
            >
              {s.broken ? `${s.n} cracked` : `Slide ${s.n}`}
            </Button>
          ))}
        </Fields>
      </>
    );
  }

  if (slide.broken) {
    return (
      <>
        <SectionTitle>Slide {slide.n} is cracked</SectionTitle>
        <Hint>
          There is no spare of that slide. Take it off and go on to another — the four marks it cost are gone, the rest
          of the practical is not.
        </Hint>
        <Fields>
          <Button variant="contained" onClick={() => dispatch({ type: 'takeOff', now: now() })}>
            Take it off
          </Button>
        </Fields>
      </>
    );
  }

  const identified = Boolean(slide.org && slide.proc);
  const labelling = identified && canLabel(state, v);
  const spec = specimenOf(slide);
  const pin = Math.min(state.pin, spec.pins.length - 1);

  return (
    <>
      <SectionTitle>
        Slide {slide.n} · {totalMagnification(state.objective)}× · {examined}/{TRAY_SIZE} examined
      </SectionTitle>
      <Hint>
        <RichText text={focusHint(state)} />
      </Hint>

      {!canIdentify(v) ? null : !identified ? (
        <>
          <Options
            label="Organism"
            options={ORGANISMS}
            value={slide.org}
            onPick={(value: Organism) => dispatch({ type: 'setIdentity', field: 'organism', value })}
          />
          <Options
            label="Process"
            options={PROCESSES}
            value={slide.proc}
            onPick={(value: Process) => dispatch({ type: 'setIdentity', field: 'process', value })}
          />
        </>
      ) : labelling ? (
        <>
          <Options
            label={`Pointer ${pin + 1} of ${spec.pins.length} — what does it sit on?`}
            options={spec.opts}
            value={slide.labels[pin] ?? ''}
            onPick={(part: string) => dispatch({ type: 'setLabel', pin, part })}
          />
          <Fields>
            {spec.pins.map((_, k) => (
              <Button
                key={k}
                size="small"
                variant={k === pin ? 'contained' : 'outlined'}
                color="inherit"
                onClick={() => dispatch({ type: 'selectPin', pin: k })}
              >
                {k + 1}
                {slide.labels[k] ? ' ✓' : ''}
              </Button>
            ))}
            <EmergeChip
              tone={slide.labels.every((l) => l) ? 'green' : 'grey'}
              label={`${slide.org} · ${slide.proc}`}
            />
            <Button
              size="small"
              variant="text"
              color="inherit"
              onClick={() => dispatch({ type: 'setIdentity', field: 'organism', value: '' })}
            >
              Change the identification
            </Button>
          </Fields>
        </>
      ) : (
        <Fields>
          <EmergeChip tone="grey" label={`${slide.org} · ${slide.proc}`} />
          <Box component="span" sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.sub }}>
            The three pointers are only resolved on a sharp, centred view at 40×.
          </Box>
          <Button
            size="small"
            variant="text"
            color="inherit"
            onClick={() => dispatch({ type: 'setIdentity', field: 'organism', value: '' })}
          >
            Change the identification
          </Button>
        </Fields>
      )}
    </>
  );
}

function RecordTask({ state, dispatch, now }: View): React.ReactElement {
  const theme = useTheme();
  const index = state.row;
  const slide = state.tray[index];
  const filled = recordedCount(state);

  const nextBlank = (): void => {
    for (let k = 1; k <= state.tray.length; k += 1) {
      const i = (index + k) % state.tray.length;
      if (!state.tray[i]?.seen) {
        dispatch({ type: 'selectRow', index: i });
        return;
      }
    }
  };

  return (
    <>
      <SectionTitle>
        Slide {slide?.n ?? '—'} of {state.tray.length} · what you saw
      </SectionTitle>
      <Hint>
        <RichText
          text={
            'The organism and the process are the ones you named at the microscope. In the last column record **what ' +
            'you actually saw** in the field — not what the textbook says should be there. Tap a figure on the plate ' +
            'beside you.'
          }
        />
      </Hint>
      <Fields>
        <EmergeChip tone="grey" label={`${slide?.org || '—'} · ${slide?.proc || '—'}`} />
        <Box component="span" sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, flex: '1 1 140px' }}>
          {slide?.seen ? FEATURE_TEXT[slide.seen] : 'nothing recorded for this row yet'}
        </Box>
      </Fields>
      <Fields>
        {state.tray.map((s, i) => (
          <Button
            key={s.n}
            size="small"
            variant={i === index ? 'contained' : 'outlined'}
            color="inherit"
            onClick={() => dispatch({ type: 'selectRow', index: i })}
          >
            {s.n}
            {s.seen ? ' ✓' : ''}
          </Button>
        ))}
        {filled < state.tray.length ? (
          <Button size="small" variant="outlined" color="inherit" onClick={nextBlank}>
            Next row
          </Button>
        ) : null}
        <Button
          variant="contained"
          disabled={filled < state.tray.length}
          onClick={() => dispatch({ type: 'submitTable', now: now() })}
        >
          Submit the table
        </Button>
        <EmergeChip tone={filled === state.tray.length ? 'green' : 'grey'} label={`${filled}/${state.tray.length} rows`} />
      </Fields>
    </>
  );
}

function ConcludeTask({ state, dispatch, now }: View): React.ReactElement {
  return (
    <>
      <SectionTitle>Conclude</SectionTitle>
      <Hint>The examinable contrast between the two processes. Your first answer counts.</Hint>
      <Box sx={{ mt: 1.5 }}>
        <ChoiceQuiz
          idPrefix="cd-conclusion"
          questions={CONCLUSION.map((c) => ({ q: c.q, options: c.o, answer: c.a, why: c.why }))}
          picks={state.concl.map((c) => (c ? c.pick : null))}
          onPick={(question, option) => dispatch({ type: 'answerConclusion', question, option, now: now() })}
          explain={(i) => (
            <TextbookPassage scope={cellDivisionEngine.meta.textbook} query={CONCLUSION[i]!.textbookQuery} />
          )}
        />
      </Box>
    </>
  );
}

function Task(view: View): React.ReactElement {
  const { state, dispatch } = view;

  switch (state.step) {
    case STEP.setup:
      return (
        <>
          <SectionTitle>Set up the microscope</SectionTitle>
          <Hint>
            <RichText
              text={
                'Switch the **lamp** on — the dial on the base has four positions — and make sure the **10× objective** ' +
                'is swung in. Low power always goes on first: it has the wide field you need to find anything at all, ' +
                'and a working distance long enough that the objective cannot reach the slide.'
              }
            />
          </Hint>
          <Fields>
            <EmergeChip tone={state.lamp > 0 ? 'green' : 'grey'} label={`lamp ${LAMPS[state.lamp]}`} />
            <EmergeChip tone={state.objective === 10 ? 'green' : 'amber'} label={`${state.objective}× objective`} />
            <Button size="small" variant="outlined" color="inherit" onClick={() => dispatch({ type: 'cycleLamp' })}>
              Turn the lamp dial
            </Button>
          </Fields>
        </>
      );

    case STEP.slides:
      return <SlidesTask {...view} />;

    case STEP.record:
      return <RecordTask {...view} />;

    default:
      return <ConcludeTask {...view} />;
  }
}

// ---------------------------------------------------------------------------
// The notebook
// ---------------------------------------------------------------------------

function ObservationsPanel({ state }: { state: CellDivisionState }): React.ReactElement {
  const theme = useTheme();
  const graded = state.graded;

  return (
    <>
      <ObservationTable
        caption={
          graded
            ? 'Marked against what each slide really carries'
            : state.step === STEP.record
              ? 'One row per slide — the last column is what you saw'
              : 'Filled in as you work through the box'
        }
        columns={[
          { label: 'Slide' },
          { label: 'Organism', align: 'left' },
          { label: 'Process', align: 'left' },
          { label: 'What you saw', align: 'left' },
          ...(graded ? [{ label: 'Marks' as const }] : []),
        ]}
        rows={state.tray.map((slide, i) => {
          const spec = specimenOf(slide);
          const cell = graded?.cells[i];
          const truth = (mine: string, actual: string): React.ReactNode =>
            graded && mine !== actual ? (
              <Box component="span" sx={{ display: 'block', color: theme.brand.tert, fontSize: theme.band.type.min }}>
                was: {actual}
              </Box>
            ) : null;

          return [
            <React.Fragment key="n">
              {slide.n}
              {slide.broken ? <EmergeChip tone="red" label="cracked" /> : null}
              {!graded && state.mounted === i ? (
                <Box component="span" sx={{ display: 'block', color: theme.brand.tert, fontSize: theme.band.type.min }}>
                  on the stage
                </Box>
              ) : null}
            </React.Fragment>,
            <React.Fragment key="o">
              {slide.org || '—'}
              {truth(slide.org, spec.organism)}
            </React.Fragment>,
            <React.Fragment key="p">
              {slide.proc || '—'}
              {truth(slide.proc, spec.process)}
            </React.Fragment>,
            <React.Fragment key="f">
              {slide.seen ? FEATURE_TEXT[slide.seen] : '—'}
              {truth(slide.seen ? FEATURE_TEXT[slide.seen] : '', FEATURE_TEXT[spec.feature])}
            </React.Fragment>,
            ...(graded
              ? [
                  <EmergeChip
                    key="m"
                    tone={
                      cell && cell.pts === PER_SLIDE_TABLE_MARKS ? 'green' : cell && cell.pts >= 3 ? 'amber' : 'red'
                    }
                    label={`${cell?.pts ?? 0}/${PER_SLIDE_TABLE_MARKS}`}
                  />,
                ]
              : []),
          ];
        })}
      />
      <Typography sx={{ mt: 1.5, fontSize: theme.band.type.min + 0.5, color: theme.brand.tert, textWrap: 'pretty' }}>
        {graded
          ? `Labelling is marked separately: ${graded.label} of ${state.tray.reduce(
              (a, s) => a + (s.broken ? 0 : s.labels.length),
              0,
            )} pointers, one mark each, against the structure the pointer actually sits on.`
          : 'Each row is worth 5: two for the organism, two for the process, one for the feature you saw. The eighteen pointers are marked on top of that.'}
      </Typography>
    </>
  );
}

function ReferencePanel(): React.ReactElement {
  return <ReferenceSheet />;
}

function TheoryPanel(): React.ReactElement {
  const theme = useTheme();
  const { meta } = cellDivisionEngine;
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
 * `@labs/lib/cell-division/teach.ts`. The tray, the slide on the stage and the
 * view through the eyepiece are not in its scope at all, which is what makes it
 * identical whichever of the six is under the objective; the one thing
 * `revealed` unlocks is which organism goes with which process, four of the
 * five marks on every row. It draws no figures, so none are passed.
 */
function Teach({ revealed }: BenchTeachProps<CellDivisionState, CellDivisionAction>): React.ReactElement {
  return <TeachSections sections={cellDivisionTeach(revealed)} />;
}

// ---------------------------------------------------------------------------
// The bench
// ---------------------------------------------------------------------------

export const cellDivisionBench: BenchDefinition<CellDivisionState, CellDivisionAction> = {
  engine: cellDivisionEngine,
  ui: {
    Stage,
    Controls,
    Task,
    Aside,
    // The plate earns its space exactly while a figure is being matched.
    showAside: (state) => state.step === STEP.slides || state.step === STEP.record,
    // THE TEACHING LAYER. It explains binary fission and budding in general and
    // is never handed the slide, so it is byte-identical whichever of the six is
    // under the objective — naming the process is what this bench marks. Only
    // `revealed` reaches it, and the one thing it holds back is which organism
    // goes with which process. See `@labs/lib/cell-division/teach.ts`. No
    // `showTeach`: the biology is worth reading before the lamp is even on.
    Teach,
    tabs: [
      { id: 'observations', label: 'Observations', Panel: ObservationsPanel },
      { id: 'reference', label: 'The six stages', Panel: ReferencePanel },
      { id: 'theory', label: 'Theory', Panel: TheoryPanel },
    ],
    tabForStep: (state) => (state.step === STEP.setup ? 'theory' : 'observations'),
    tours: (ctx) => createCellDivisionTours(ctx),
    // "Show me this step", per step of the procedure. It drives the student's
    // own instrument and says nothing about what comes up in it — naming that is
    // what this bench marks. See `trainer.tsx`.
    useTrainer: useCellDivisionTrainer,
    highlightsFor: (step) => step?.highlight ?? [],
  },
};
