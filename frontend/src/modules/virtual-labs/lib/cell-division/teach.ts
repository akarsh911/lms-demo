import type { TeachSection } from '@labs/components/teach-sections';

/**
 * "WHAT'S HAPPENING" — the teaching panel for the fission-and-budding bench, as
 * data.
 *
 * THE RULE, AND HOW IT IS KEPT HERE. What is marked on this bench is naming the
 * organism and the process on each of the six slides, saying what was in the
 * field, and what the eighteen pointers sit on. Naming the process IS the
 * practical. So the panel explains binary fission and budding in general, and it
 * is BLIND to the box.
 *
 * Its whole input is `revealed`. Moving the words out of a component and into
 * this module makes that structural rather than careful: the tray, the slide on
 * the stage, the view through the eyepiece, the objective and the lamp are not
 * in scope in this file at all, so nothing here can hint which slide is which —
 * now or after any later edit. The bar this bench sets is that the panel is
 * byte-identical across all six slides; a panel that is not given the slide
 * meets it by construction, and driving this module from plain Node says so.
 *
 * `revealed` earns its place here, and it is the one thing held back: which
 * organism goes with which process. That pairing is four of the five marks on
 * every row of the table, so it waits until the practical is over. Everything
 * before it is true of any organism that divides this way, which is why that one
 * section is appended rather than always present.
 */
const ALWAYS: readonly TeachSection[] = [
  {
    heading: 'Why does nothing on the stage move?',
    kind: 'why',
    lead:
      'These are **prepared slides** — killed, fixed, stained and mounted in resin, possibly years ago — so a ' +
      'cell caught halfway through dividing was stopped at that instant and will never finish.',
    body: [
      'These are **prepared slides**: the material was killed, fixed, stained and mounted in resin under a ' +
        'coverslip, possibly years ago. A cell caught halfway through dividing was stopped at that instant and is ' +
        'still at it — it will never finish, and nothing here will crawl or bud in front of you. What does move ' +
        'is the instrument: the tube travelling, the stage coasting, the lamp coming up. A slide is therefore a ' +
        'single frozen frame, and the whole skill is reading which moment of the process that frame belongs to.',
    ],
  },
  {
    heading: 'What makes a process asexual?',
    kind: 'why',
    lead:
      'One parent, and no gametes: no two nuclei fuse, so the offspring is built from a copy of the one parent’s ' +
      'DNA and is genetically identical to it.',
    body: [
      'One parent, and no gametes: no two nuclei fuse, so nothing is mixed. The offspring is built from a copy of ' +
        'the one parent’s DNA and is genetically identical to it — a clone — unless the copying itself went ' +
        'wrong. That is what separates these processes from fertilisation, and it is why one individual on its ' +
        'own can fill a culture. It is also why they are quick: there is no partner to find and no embryo to ' +
        'build.',
    ],
  },
  {
    heading: 'In binary fission, what divides first?',
    kind: 'why',
    lead:
      'The nucleus — karyokinesis before cytokinesis — because splitting the cytoplasm first would leave one ' +
      'half with no nucleus, and it would die.',
    body: [
      'Karyokinesis before cytokinesis. Each half has to come away with a complete set of instructions, so the ' +
        'nucleus is copied and pulled apart into two _before_ the cytoplasm is touched. Only then does the cell ' +
        'constrict at the middle, the membrane pinching in from both sides like a tightening belt, until the two ' +
        'come apart. Split the cytoplasm first and one half would be left with no nucleus, and would die. The two ' +
        'daughters come out the **same size**, and the parent has not survived as a separate individual — it has ' +
        'become the two.',
    ],
  },
  {
    heading: 'What makes budding different?',
    kind: 'why',
    lead:
      'It is an unequal division: one small offspring is pinched off a parent that is not used up, and that ' +
      'parent is still there afterwards to bud again.',
    body: [
      'A small outgrowth forms on the parent, a copy of the nucleus travels into it, and it is pinched off once ' +
        'it can live on its own. The parent is not used up: it is still there afterwards, the same individual, ' +
        'and it can bud again and again. That single difference — two equal daughters and no parent left, against ' +
        'one small offspring and a parent that carries on — is the whole contrast this practical is built on, and ' +
        'it is read off a _whole field_ rather than off one cell.',
    ],
  },
  {
    heading: 'Why do buds sometimes come away in chains, and what are the rings?',
    kind: 'why',
    lead:
      'A bud can begin budding itself before it has separated, so several cells stay joined end to end; the ' +
      'rings on an older cell are where earlier buds pinched off.',
    body: [
      'In a single-celled organism with plenty of food a bud can begin budding itself before it has separated, so ' +
        'three or four cells stay joined end to end in a short chain of unequal sizes — biggest at one end, ' +
        'newest at the other. On the wall of an older cell, the places where earlier buds pinched off are left as ' +
        'small raised rings; count them and you are counting how many times that cell has reproduced.',
    ],
  },
  {
    heading: 'Why are some buds already miniature adults?',
    kind: 'why',
    lead:
      'In a multicellular animal the bud is a pocket of the whole body wall, fed by the parent while it grows the ' +
      'complete body plan, so nothing is left to be built by the time it drops off.',
    body: [
      'In a multicellular animal the bud is not one cell but a pocket of the whole body wall, with the parent’s ' +
        'gut cavity running straight into it, so it is fed by the parent while it develops. It grows the complete ' +
        'body plan — the mouth, the cone it sits on, a ring of tentacles — while still attached, and by the time ' +
        'it drops off it can catch and digest its own food. That is why it is called a miniature adult and not an ' +
        'embryo: nothing is left to be built.',
    ],
  },
  {
    heading: 'Why low power first, and centred?',
    kind: 'how',
    lead:
      'The two objectives agree only about the centre, so anything not walked to the middle while the field was ' +
      'wide will not be in the high-power field at all.',
    body: [
      'The 40× field is a quarter of the width and so a sixteenth of the area of the 10× field, and the two ' +
        'objectives agree only about the centre. Anything not walked to the middle while the field was wide will ' +
        'not be in the high-power field at all — and there is far too little depth of focus at 40× to go hunting ' +
        'for it. Depth of focus falls away roughly as the square of the aperture, so the sharp band on high power ' +
        'is a small fraction of what it was: the same turn of the knob that barely softens the low-power image ' +
        'throws the high-power one away completely. That is the entire reason a microscope carries a second, ' +
        'finer adjustment.',
    ],
  },
  {
    heading: 'Why does racking the wrong way crack a slide, and why is full brightness not best?',
    kind: 'watch',
    lead:
      'The 40× objective works a fraction of a millimetre from the coverslip and the rack has no idea what is ' +
      'underneath it; and contrast is a difference, not a quantity, so flooding the field washes the detail out.',
    body: [
      'The 40× objective is the longer barrel and works a fraction of a millimetre from the coverslip; the 10× ' +
        'sits far enough back that it cannot reach the glass however far it is racked. The rack and pinion has no ' +
        'idea what is underneath it, so watch the gap from the side as the tube comes down and, once you are at ' +
        'the eyepiece, focus _upwards_, away from the slide. As for the lamp: contrast is a difference, not a ' +
        'quantity. A stained specimen is seen because it absorbs more light than the mountant around it — flood ' +
        'the field and both come back near white and the detail washes out. A dark field is never evidence of an ' +
        'empty slide.',
    ],
  },
];

/**
 * The pairing, which is four of the five marks on every row of the table, so it
 * is printed only once those rows are settled.
 */
const PAIRING: TeachSection = {
  heading: 'Now the table is marked: which organism goes with which?',
  kind: 'after',
  lead:
    '_Amoeba_, _Paramecium_ and bacteria divide by **binary fission**; **budding** is what yeast does on its ' +
    'wall and what _Hydra_ does from its body wall.',
  body: [
    '_Amoeba_ and _Paramecium_, and bacteria too, divide by **binary fission** — one cell into two equal ' +
      'daughters. **Budding** is what yeast does, one cell growing a smaller one on its wall, and what _Hydra_ ' +
      'does, a whole miniature animal growing out of the body wall and dropping off. Which slide showed which ' +
      'was the question this practical asked, so the panel said nothing about the pairing while it was still ' +
      'being asked.',
  ],
};

/**
 * The panel's contents.
 *
 * @param revealed true once the table has been submitted and the marks are in.
 */
export function cellDivisionTeach(revealed: boolean): readonly TeachSection[] {
  return revealed ? [...ALWAYS, PAIRING] : ALWAYS;
}

export type { TeachSection };
