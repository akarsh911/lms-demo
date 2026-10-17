import type { TeachSection } from '@labs/components/teach-sections';

/**
 * "WHAT'S HAPPENING" — the teaching panel for the leaf-peel bench, as data.
 *
 * THE RULE, AND HOW IT IS KEPT HERE. What is marked on this bench is what the
 * student saw in their OWN field of view: the six observation lines, the count
 * of stomata in the field, and the four pinned parts on the drawing. So the
 * panel explains the biology of a stoma and the technique of a wet mount, and it
 * is BLIND to the slide.
 *
 * Its whole input is `revealed`. Moving the words out of a component and into
 * this module makes that structural rather than careful: the peel, the surface
 * it came from, the stain, the bubbles, the objective, the field and the count
 * are not in scope in this file at all, so they cannot be named, counted or
 * judged — now or after any later edit. The words below are the same before a
 * leaf has been touched and with a finished mount under the objective.
 *
 * `revealed` earns its place here for one reason, and only one. Typical stomatal
 * densities are exactly the sort of number that anchors a count, and the count
 * is marked, so the figures are held back until the observations have been
 * submitted and marked. Everything else reads the same either way, which is why
 * that one section is the only one appended rather than always present.
 */
const ALWAYS: readonly TeachSection[] = [
  {
    heading: 'What is a stoma?',
    kind: 'why',
    lead:
      'It is the leaf’s adjustable hole — a pore in the epidermis with a pair of **guard cells** around it, the ' +
      'pore being the gap between that pair rather than a hole through either of them.',
    body: [
      'It is the leaf’s adjustable hole: a pore in the epidermis with a pair of **guard cells** around it, and ' +
        'the pore is the gap between that pair rather than a hole through either of them. Carbon dioxide diffuses ' +
        'in through it for photosynthesis and oxygen diffuses out; nearly all the water a plant loses leaves ' +
        'through it as vapour, and it is that loss which pulls the transpiration stream up from the roots. Open, ' +
        'the leaf can feed but it dries. Shut, it is safe but starving. The guard cells are the valve, and a leaf ' +
        'carries thousands of them.',
    ],
  },
  {
    heading: 'How do the guard cells work the valve?',
    kind: 'why',
    lead:
      'Water swells them, and because the wall facing the pore is thicker and less elastic than the outer wall ' +
      'the swelling bends the pair apart instead of inflating them evenly — and that bending is what opens the ' +
      'pore.',
    body: [
      'They are the one kind of epidermal cell that carries chloroplasts, and they need them: the sugar they make ' +
        'lowers their water potential, water follows in by osmosis, and they swell. The wall facing the pore is ' +
        'thicker and less elastic than the outer wall, so the swelling cannot inflate them evenly — it bends the ' +
        'pair apart, and that bending is what opens the pore. Lose the water again and they go slack and close it. ' +
        'In most plants they are kidney-shaped; in grasses they are dumb-bells that straighten the same way.',
    ],
  },
  {
    heading: 'Why is the rest of the epidermis clear?',
    kind: 'why',
    lead:
      'It is a transparent skin on purpose, so that light reaches the photosynthetic mesophyll underneath — and ' +
      'transparent means no chloroplasts, which is why the guard cells stand out.',
    body: [
      'The epidermis is a protective skin, and it is transparent on purpose, so that light reaches the ' +
        'photosynthetic mesophyll underneath. Transparent means no chloroplasts — an ordinary epidermal cell has ' +
        'a wall, a large vacuole, some cytoplasm and a nucleus, and nothing green in it at all. The guard cells ' +
        'are the single exception, which is what makes a stoma stand out in a peel once it is sharp enough to ' +
        'look into.',
    ],
  },
  {
    heading: 'Why does a dicot leaf carry more stomata underneath?',
    kind: 'why',
    lead:
      'The lower surface is shaded and cooler and its layer of still, damp air is not stirred away as fast, so a ' +
      'pore there loses less water for the same exchange of gas.',
    body: [
      'A stoma has to be open for the leaf to feed, and every moment it is open the leaf is losing water. The ' +
        'lower surface is shaded and cooler, and the layer of still, damp air against it is not stirred away as ' +
        'fast, so a pore there loses less water for the same exchange of gas. The upper surface faces the sun and ' +
        'is usually finished with a thicker waxy cuticle instead. A floating leaf reverses the whole argument and ' +
        'puts its stomata on top, and a vertical leaf such as a grass blade spreads them evenly — the rule is not ' +
        'about up and down, it is about where water is cheap.',
    ],
  },
  {
    heading: 'Why is the epidermis peeled rather than cut?',
    kind: 'how',
    lead:
      'A microscope is in focus at one plane at a time, and a true peel is one cell thick, so that single plane ' +
      'holds everything in it.',
    body: [
      'A microscope is in focus at one plane at a time. A true epidermal peel is one cell thick, so that single ' +
        'plane holds everything in it. Tear off a piece of the whole leaf and you have several layers stacked ' +
        'further apart than the depth of focus: rack to one and the others are a haze over it, rack to another ' +
        'and the first is gone. There is no setting that shows them all, so the answer to a thick piece is a ' +
        'thinner peel, not a better knob. Floating the peel out matters for the same reason — a peel curls as it ' +
        'leaves the leaf, and a fold is two layers where there should be one.',
    ],
  },
  {
    heading: 'Why does the water go down first, and the coverslip down on a needle?',
    kind: 'how',
    lead:
      'The drop is the mount, so the light passes glass, water, glass with almost no change of refractive index — ' +
      'and letting one edge touch the liquid first sweeps the air out ahead of the falling glass.',
    body: [
      'The drop is the mount: it fills the space between slide and coverslip so the light passes glass, water, ' +
        'glass with almost no change of refractive index. Put the peel on dry glass and every air gap scatters ' +
        'the light into glare. Let one edge of the coverslip touch the liquid first and capillary action draws ' +
        'the liquid along underneath it, sweeping the air out ahead of the falling glass; drop it flat and the ' +
        'whole face lands at once, the air in the middle has nowhere to go, and it is sealed in.',
    ],
  },
  {
    heading: 'Why does one trapped bubble ruin the patch it sits on?',
    kind: 'watch',
    lead:
      'A bubble is a strong little lens that throws the light out of the path the eyepiece collects, so nothing ' +
      'underneath it can be seen — and what cannot be seen cannot be counted.',
    body: [
      'A bubble is air with water curved around it. Light crossing that curved boundary between two very ' +
        'different refractive indices is bent hard, so the bubble behaves as a strong little lens: it throws the ' +
        'light out of the path the eyepiece collects, and comes up as a bright disc inside a thick black ring. ' +
        'Nothing underneath it can be seen — and what cannot be seen cannot be counted, which is why a bubble is ' +
        'not merely ugly but subtracts from the evidence. A few of them, and it is quicker to make the mount ' +
        'again than to argue with them.',
    ],
  },
  {
    heading: 'What is the safranin binding to?',
    kind: 'why',
    lead:
      'It is a basic dye, so its coloured part is held wherever it meets a negative charge — the lignin and ' +
      'pectin of the cell walls, and the phosphate backbone of the DNA in the nucleus.',
    body: [
      'Safranin is a basic dye: its coloured part carries a positive charge, so it is held wherever it meets a ' +
        'negative one — the lignin and pectin of the cell walls, and the phosphate backbone of the DNA in the ' +
        'nucleus. That is why a stained peel shows walls and nuclei picked out in red while the watery cytoplasm ' +
        'between them stays almost clear. The colour arrives gradually, and from the edge of the drop inwards, ' +
        'because the dye has to diffuse through the tissue to reach a binding site.',
    ],
  },
  {
    heading: 'Why one or two drops of stain and not four?',
    kind: 'watch',
    lead:
      'Contrast is a _difference_: once every binding site is taken the whole cell goes dark red together, and ' +
      'there is no difference left for the wall to stand out by.',
    body: [
      'Once every binding site is taken, more dye simply sits about in the cytoplasm and the whole cell goes dark ' +
        'red together. Contrast is a _difference_: flood the peel and there is no difference left, so the wall ' +
        'stops standing out from what is inside it, and anything naturally green is buried under the red. ' +
        'Over-staining does not make a faint structure clearer; it removes the distinction that made it a ' +
        'structure.',
    ],
  },
  {
    heading: 'Why is the excess blotted, and only after the coverslip?',
    kind: 'how',
    lead:
      'Too much liquid and the coverslip floats rather than resting on the mount, so the specimen drifts while ' +
      'you focus — but blot _before_ the coverslip is on and the specimen simply dries out.',
    body: [
      'Too much liquid and the coverslip floats rather than resting on the mount: it then drifts while you focus, ' +
        'so the specimen keeps wandering out from under the point you were looking at, and the working distance ' +
        'you set is not the one you have a moment later. Touching blotting paper to one edge draws the surplus ' +
        'out by capillarity and lets the glass settle. Blot _before_ the coverslip is on and all that happens is ' +
        'that the specimen dries out — the thing the drop was there to prevent.',
    ],
  },
  {
    heading: 'Why low power first, and centred?',
    kind: 'how',
    lead:
      'The two objectives agree only about the centre, so anything not brought to the middle while the field was ' +
      'wide will simply not be in the high-power field at all.',
    body: [
      'At 40× the field is a quarter of the width and so a sixteenth of the area of the 10× field, and the two ' +
        'objectives agree only about the centre. Anything not brought to the middle while the field was wide will ' +
        'simply not be in the high-power field at all. The depth of focus falls away roughly as the square of the ' +
        'aperture, so the sharp band at 40× is a small fraction of what it was — the same turn of the knob that ' +
        'barely softens a low-power image throws the high-power one away completely, which is the whole reason ' +
        'for a separate fine adjustment.',
    ],
  },
  {
    heading: 'Why does racking up crack the slide?',
    kind: 'watch',
    lead:
      'The 40× objective works a fraction of a millimetre from the coverslip and the rack and pinion has no ' +
      'sense at all of what is above it, so a coarse turn that was harmless on low power drives the front lens ' +
      'straight through the glass.',
    body: [
      'The 40× objective is physically longer than the 10× and works far closer to the coverslip — a fraction of ' +
        'a millimetre. The stage is driven by a rack and pinion with no sense at all of what is above it, so a ' +
        'coarse turn that was harmless on low power drives the front lens straight through the glass, and the ' +
        'mount goes with it. Two habits prevent that, and both are a matter of looking somewhere other than down ' +
        'the tube: watch the gap _from the side_ while the stage comes up, and once your eye is at the eyepiece, ' +
        'focus by racking _away_ from the slide, so the direction you are turning can only widen the gap.',
    ],
  },
];

/**
 * The one thing held back, and why: a typical density would anchor the count
 * that is being marked, so it waits until the count is in.
 */
const DENSITY: TeachSection = {
  heading: 'Now your observations are marked: what is a count worth?',
  kind: 'after',
  lead:
    'One field is a sample, so a count is turned into a **stomatal density** — the number per square millimetre ' +
    '— by dividing by the area of the field, and several fields are averaged before the figure is trusted.',
  body: [
    'One field is a sample, and stomata are not spread evenly over a leaf — so a count is turned into a ' +
      '**stomatal density**, the number per square millimetre, by dividing by the area of the field, and several ' +
      'fields are averaged before the figure is trusted. For a typical dicot leaf the lower epidermis runs to ' +
      'some hundreds per square millimetre and the upper to a few tens or none at all, and the ratio between the ' +
      'two surfaces is the usual thing an examiner asks for. Those figures are worth nothing as a substitute for ' +
      'counting your own field, which is why this panel kept them to itself until your count was in.',
  ],
};

/**
 * The panel's contents.
 *
 * @param revealed true once the observations have been submitted and marked.
 */
export function stomataTeach(revealed: boolean): readonly TeachSection[] {
  return revealed ? [...ALWAYS, DENSITY] : ALWAYS;
}

export type { TeachSection };
