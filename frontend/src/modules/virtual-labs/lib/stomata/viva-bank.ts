import type { BenchVivaQuestion } from '@labs/types/lab-bench';

/**
 * THE VIVA BANK for this practical — 15 questions across 5 categories.
 *
 * Five are drawn per attempt, one from each category where the bank allows,
 * with the options shuffled and the correct answer carried by identity. See
 * `@labs/lib/viva.ts`; never read this list to mark an answer.
 *
 * The questions and their explanations are the reference bench's own words,
 * carried over verbatim.
 */
export const VIVA_BANK: readonly BenchVivaQuestion[] = [
  {
    cat: 'principle',
    q: 'What is the main job of a stoma?',
    a: 1,
    o: [
      'To absorb water from the soil',
      'To let gases in and out of the leaf, and to let water vapour out in transpiration',
      'To give the leaf its green colour',
      'To carry food to the rest of the plant',
    ],
    why: 'A stoma is a pore for gas exchange — carbon dioxide in, oxygen out during photosynthesis — and almost all transpiration happens through it.',
  },
  {
    cat: 'principle',
    q: 'Guard cells contain chloroplasts, but the epidermal cells around them do not. Why does that matter?',
    a: 2,
    o: [
      'Chloroplasts give the guard cells their bean shape',
      'The epidermal cells lost theirs as the leaf matured',
      'The guard cells photosynthesise; the sugar they make draws water in, they swell, and the pore opens',
      'It only makes them easier to see',
    ],
    why: 'Guard cells are the only epidermal cells that photosynthesise. The sugar made there pulls water in by osmosis, and because the inner wall is thicker the swollen cells bend apart and open the pore.',
  },
  {
    cat: 'principle',
    q: 'A pair of guard cells takes up water and swells. Why does that open a pore instead of simply inflating the pair?',
    a: 3,
    o: [
      'The two cells push against one another and shove the pore apart',
      'Water collects in the pore itself and forces the walls back',
      'The chloroplasts swell first and drag the wall with them',
      'The wall facing the pore is thicker and less elastic than the outer wall, so each swelling cell bends away from it',
    ],
    why: 'The unequal thickening is the whole mechanism. A cell that swells evenly just gets rounder; one with a stiff inner wall and a stretchy outer wall has to curve, and a curving pair parts in the middle.',
  },
  {
    cat: 'apparatus',
    q: 'Why is the peel stained with safranin?',
    a: 0,
    o: [
      'The cells are almost colourless, and safranin dyes the walls and nuclei red so they can be seen',
      'It kills the cells so they stop moving',
      'It sticks the peel down to the slide',
      'It dissolves the chloroplasts',
    ],
    why: 'An unstained epidermal peel has almost no contrast under the microscope. Safranin reddens the cell walls and nuclei so the outlines — and the guard cells — stand out.',
  },
  {
    cat: 'apparatus',
    q: 'The eyepiece is marked 10× and the objective in use is 40×. What magnification are you working at, and how is it reached?',
    a: 2,
    o: [
      '50×, because the two magnifications add together',
      '40×, because the eyepiece only carries the image to the eye and does not magnify',
      '400×: the objective forms a magnified real image up the tube and the eyepiece magnifies that image again',
      '400×, but the figure means the specimen is 400 times brighter rather than 400 times wider',
    ],
    why: 'The two lenses work in series, so the magnifications multiply. That is what "compound" means, and it is why a single lens of any kind cannot reach these powers.',
  },
  {
    cat: 'apparatus',
    q: 'Glycerine is on the bench beside the water. What is it for?',
    a: 1,
    o: [
      'It stains the guard cells so their chloroplasts show up green',
      'It evaporates far more slowly than water, so the mount does not dry out and will keep for a few days',
      'It kills the cells so they stop changing shape while you draw',
      'It dissolves the waxy cuticle so the safranin can get in',
    ],
    why: 'Water alone makes a proper temporary mount, but it is gone in an hour. A drop of glycerine turns the same slide into one that survives until the next lesson.',
  },
  {
    cat: 'procedure',
    q: 'Why is the coverslip lowered at an angle with a needle?',
    a: 3,
    o: [
      'To spread the stain evenly',
      'To squeeze the water out from underneath',
      'To stop the coverslip cracking',
      'So the liquid spreads across and drives the air out ahead of it instead of trapping bubbles',
    ],
    why: 'Letting one edge touch first means the liquid creeps across and pushes the air out. Dropped flat, the coverslip traps air, and every bubble is a thick dark-rimmed circle hiding the cells beneath it.',
  },
  {
    cat: 'procedure',
    q: 'Why is the peel floated on water in a watch glass before it is mounted?',
    a: 0,
    o: [
      'A peel taken straight from the leaf curls on itself, and surface tension on the water opens it flat again',
      'The water rinses the chlorophyll out of it so that it becomes transparent',
      'Soaking softens the peel so the coverslip cannot crush it',
      'It washes off the safranin that was used to loosen the epidermis',
    ],
    why: 'A fold is two cell layers, and two layers lie further apart than the depth of focus, so no setting of the knob will ever show both. Flattening the peel before it goes on the slide is cheaper than fixing it afterwards.',
  },
  {
    cat: 'procedure',
    q: 'The floating peel is lifted out with a brush rather than with the forceps that tore it off the leaf. Why the change of tool?',
    a: 2,
    o: [
      'Forceps would scratch the surface of the slide',
      'Metal reacts with safranin and discolours the peel',
      'A wet peel is a limp film: metal points pinch through it and fold it, while a wet brush lifts it flat on its hairs',
      'The brush is the only tool in the set that has been sterilised',
    ],
    why: 'The forceps were right on a dry flap still anchored to the leaf. Once the peel is loose and wet it has no strength of its own, and anything with a point goes through it.',
  },
  {
    cat: 'errors',
    q: 'A student turns the fine knob back and forth: the field sharpens, softens and sharpens again, but no one setting brings the whole of it into focus. What is wrong with the preparation?',
    a: 1,
    o: [
      'The lamp is too bright and is washing the contrast out',
      'The piece is more than one cell thick, so its layers lie further apart than the depth of focus',
      'The mount has dried out under the coverslip',
      'The 40× objective has not been screwed fully home in the nosepiece',
    ],
    why: 'A microscope is in focus at one plane at a time. A true epidermal peel is one cell thick, so that plane holds everything; a lump of lamina has several layers and there is no knob setting that shows them together.',
  },
  {
    cat: 'errors',
    q: 'The same turn of the coarse knob that was harmless at 10× cracks the slide at 40×. Why?',
    a: 2,
    o: [
      'The 40× lens is heavier and presses harder on the glass',
      'The stage rises faster at high power, because the gearing changes with the objective',
      'The 40× objective is longer and works a fraction of a millimetre above the coverslip, so the clearance that absorbed the turn at low power is no longer there',
      'The brighter lamp needed at 40× warms the slide and makes the glass brittle',
    ],
    why: 'Nothing about the rack and pinion changes — the working distance does. It is also why the fine adjustment exists at all, and why you watch the gap from the side while racking up.',
  },
  {
    cat: 'errors',
    q: 'Four drops of safranin have gone on instead of one. What has that cost the preparation?',
    a: 0,
    o: [
      'Every binding site is taken, so the surplus dye sits in the cytoplasm and the whole cell goes dark red together — the contrast between wall and contents is gone',
      'The dye digests the cell walls, so the outlines disappear',
      'The extra liquid makes the mount too thick for the coverslip to lie flat',
      'Safranin turns brown above two drops and stops behaving as a dye',
    ],
    why: 'Contrast is a difference. Stain everything equally and there is no difference left to see, and anything naturally green — the grains inside the guard cells — is buried under the red.',
  },
  {
    cat: 'interpretation',
    q: 'Why is the lower epidermis peeled when the leaf is a dicot?',
    a: 2,
    o: [
      'It is the only surface that takes a stain',
      'It has no chloroplasts anywhere',
      'It carries far more stomata than the upper epidermis, so one field of view shows many',
      'It is the only surface thin enough to peel',
    ],
    why: 'In a dorsiventral dicot leaf most stomata sit on the shaded lower surface, which cuts water loss. A peel of the upper epidermis shows almost none — which is itself worth recording.',
  },
  {
    cat: 'interpretation',
    q: 'A peel of the upper epidermis of the same leaf shows hardly any pores at all. What goes in the record book?',
    a: 3,
    o: [
      'Nothing — the peel has failed and another must be taken',
      'The figure from the lower surface, since that is what the textbook diagram shows',
      'The upper-surface figure multiplied by the ratio printed in the textbook',
      'Exactly what the field showed: a surface with almost none is a real result, and the comparison between the two surfaces is the point',
    ],
    why: 'A practical is marked on what the specimen did. An honest near-zero on the upper epidermis is the evidence for the whole argument about where a dicot leaf keeps its stomata.',
  },
  {
    cat: 'interpretation',
    q: 'A water lily floats, so only the upper surface of its leaf is in the air. Where would you expect its stomata to be?',
    a: 1,
    o: [
      'It has none at all, because it lives in water',
      'On the upper epidermis, because that is the only surface in contact with air',
      'On the lower epidermis, as in any other dicot',
      'Spread evenly over both surfaces, since neither is shaded',
    ],
    why: 'A stoma is only useful where there is air to exchange with. The rule is not "lower surface" but "the surface facing the air", and the floating leaf is the case that shows the difference.',
  },
];
