'use client';

import type { TourRect, TourStep, TourTarget } from '@labs/components/guided-tour';
import {
  SHEET_HEIGHT,
  SHEET_WIDTH,
  criticalAngle,
  minimumDeviation,
  smallestUsefulIncidence,
} from '@labs/lib/prism/optics';
import type { PrismAction } from '@labs/lib/prism/reducer';
import { currentTrial, type PrismState } from '@labs/lib/prism/state';
import type { BenchTourContext } from '@labs/types/lab-bench';

/**
 * "How to play": one ray, start to finish, on a sandbox bench.
 *
 * The workspace parks the student's own practical and its clock while this
 * runs, so nothing here is marked and nothing here is lost. Every step watches
 * the real bench — there is no simulated click anywhere — and the two steps
 * that talk about numbers read them off whatever the student has just done.
 */
export type PrismTourCtx = BenchTourContext<PrismState, PrismAction>;

type Region = readonly [x: number, y: number, w: number, h: number];

const RG_BOARD: Region = [40, 26, 920, 476];
const RG_PRISM: Region = [364, 126, 272, 242];
const RG_LEFT: Region = [60, 250, 380, 240];
const RG_RIGHT: Region = [604, 190, 336, 300];

export function createPrismTours(ctx: PrismTourCtx): { controls: readonly TourStep<PrismTourCtx>[] } {
  const sheet = ctx.stage;
  const find = ctx.find;

  /**
   * A rectangle in SHEET coordinates, mapped to where it actually is on screen.
   * The drawing scales to fit and centres, so it is letterboxed whenever the
   * box's proportions differ from the sheet's; scaling by width alone lands the
   * spotlight well away from what it is naming.
   */
  const region = ([x, y, w, h]: Region): TourTarget => ({
    element: sheet,
    region: (box): TourRect => {
      const k = Math.min(box.width / SHEET_WIDTH, box.height / SHEET_HEIGHT);
      const originX = box.left + (box.width - SHEET_WIDTH * k) / 2;
      const originY = box.top + (box.height - SHEET_HEIGHT * k) / 2;
      return { left: originX + x * k, top: originY + y * k, width: w * k, height: h * k };
    },
  });
  const tagged = (name: string): TourTarget => ({ element: () => find(name), pad: 6 });

  const controls: TourStep<PrismTourCtx>[] = [
    {
      title: 'Your bench',
      target: region(RG_BOARD),
      body: 'A drawing board seen from above: paper, a **60° glass prism**, pins and a protractor. Every ray you draw here is computed from **Snell’s law at both faces** — nothing is drawn for effect. **Nothing in the tour is marked.**',
    },
    {
      title: 'Why a prism, not a slab',
      target: region(RG_PRISM),
      body: 'A glass slab has parallel faces, so the second refraction undoes the first and the ray comes out _displaced_ but parallel. A prism’s two faces are inclined at **60°**, so the two bendings add and the ray leaves **deviated towards the base**.',
    },
    {
      title: 'Trace the outline',
      target: region(RG_PRISM),
      highlight: ['prism'],
      body: 'Every angle is measured off this **outline**, so it goes on the paper before any pin. Move the prism afterwards and the whole trace is worthless.',
      task: 'Tap the **prism** to pin it down and pencil round it.',
      done: ({ state }) => state.outline,
      doneMessage: 'Outline on the paper, corners lettered A, B, C.',
    },
    {
      title: 'Pick up a pin',
      target: tagged('prism-controls'),
      body: 'The instruments live under the bench. A pin in your hand turns the paper into a pin cushion — tap where you want it, or move the crosshair with the arrow keys and press Enter.',
      task: 'Press **Pick up a pin**.',
      done: ({ state }) => state.tool === 'pin',
    },
    {
      title: 'Fix the incident ray',
      target: region(RG_LEFT),
      body: 'The line through your first two pins IS your incident ray. You choose the angle by where you put them, not from a menu — so put them at least **3 cm** apart, or the line they define is only a guess.',
      task: 'Tap the paper twice, to the **left** of the prism, to fix P1 and P2.',
      done: ({ state }) => currentTrial(state).pins.length >= 2 && currentTrial(state).P !== null,
      doneMessage: 'Two pins in, and the line through them meets face AB at P.',
      after: ({ state }) => {
        const t = currentTrial(state);
        return `The bench worked out where that line strikes the glass and drew the **normal** at P in blue. Your angle of incidence came out at about **${
          t.i === null ? '—' : t.i.toFixed(0)
        }°**.`;
      },
    },
    {
      title: 'Sight through the prism',
      target: region(RG_RIGHT),
      body: 'Now move your eye to the right of the prism and look through face **AC**. The two dashed circles are the **images of P1 and P2** seen through the glass — they lie along the real emergent ray.',
    },
    {
      title: 'Fix the last two pins',
      target: region(RG_RIGHT),
      body: 'Put them a little off that line and your trace is a little wrong — and it stays wrong all the way to your answer. That is exactly what happens in the lab; nobody corrects it for you.',
      task: 'Tap twice beyond face AC, in line with the two images, to fix P3 and P4.',
      done: ({ state }) => currentTrial(state).pins.length >= 4,
      doneMessage: 'Four pins, all in one line.',
    },
    {
      title: 'Lift and join',
      target: tagged('prism-task'),
      body: 'With the prism lifted, the pencil line through P1 P2, the line through P3 P4 and the line joining P to M are the whole trace.',
      task: 'Press **Lift the prism and join the pins**.',
      done: ({ state }) => currentTrial(state).traced,
      after: ({ state }) => {
        const t = currentTrial(state);
        return `Trace complete. Your emergent line was **${
          t.err === null ? '—' : t.err.toFixed(1)
        }°** away from the line of the images. The emergent ray is clearly turned **towards the base** — a slab would have given you a parallel ray.`;
      },
    },
    {
      title: 'The protractor',
      target: tagged('console'),
      body: 'At the Measure step the protractor is laid on the paper for you, centred on the right point with its baseline along the **normal** (or, for D, along the produced incident ray). You still have to read it. A **magnified copy** appears right beside the box you type into: drag its pointer onto the ray, or nudge it with the arrow keys. **Your first reading counts**, and more than 2° out earns nothing.',
    },
    {
      title: 'The deviation curve',
      target: tagged('console'),
      body: ({ state }) =>
        `Each ray puts one point on the graph: D against i. Three well-spread angles — try about 35°, 50° and 65° — show the curve **falling and then rising**. The bottom of it is the **angle of minimum deviation**, about ${minimumDeviation(
          state.n,
        ).D.toFixed(0)}° for this glass, and from it you get the refractive index: n = sin((A + Dm)/2) ÷ sin(A/2).`,
    },
    {
      title: 'The ray box',
      target: tagged('teach-toggle'),
      highlight: ['raybox'],
      body:
        'A lamp can be put down on the paper: the beam, the path inside the glass and the angle of deviation, all ' +
        'drawn from the same tracer your own trace is marked against. **A real bench shows you none of this** — ' +
        'that is the whole reason for the pin method. It is a **teaching aid, separate from the practical, and ' +
        'nothing in it is marked**.',
      task: 'Press **The ray box**.',
      done: ({ state }) => state.demo.on,
      doneMessage: 'The lamp is on the paper.',
      after: ({ state }) => {
        const m = minimumDeviation(state.n);
        return (
          'Its own controls appear under the apparatus. Drag the box round, or **sweep** it, and the deviation ' +
          `curve draws itself: it falls, bottoms out at one minimum — about **${m.D.toFixed(
            0,
          )}° at i ≈ ${m.i.toFixed(0)}°** for this glass, where i = e — and rises again.`
        );
      },
    },
    {
      title: 'Total internal reflection',
      target: region(RG_PRISM),
      body: ({ state }) =>
        `Come in at less than about **${smallestUsefulIncidence(state.n).toFixed(
          0,
        )}°** to the normal and you will see nothing at all through face AC: inside the glass the ray meets that face beyond the **critical angle (${criticalAngle(
          state.n,
        ).toFixed(
          1,
        )}°)** and is totally internally reflected out of the base. That is not a special case in the code — it is what happens when the refraction equation has no solution.`,
    },
    {
      title: 'White light',
      target: tagged('prism-controls'),
      body: 'The lamp swaps your single ray for **white light**. Each colour has its own refractive index, so each is deviated by a different amount and the ray opens into a spectrum — that is **dispersion**, a demonstration only, and not part of the marked practical.',
    },
    {
      title: 'How you are marked',
      target: tagged('stats'),
      body: 'Marks come from tracing the outline first, pinning properly, **how truly you sighted the emergent ray**, nine protractor readings, whether your own readings satisfy **D = i + e − A**, and what you make of the curve. Every slip is logged so you can learn from it.',
    },
  ];

  return { controls };
}
