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
    q: 'What separates binary fission from budding?',
    a: 2,
    o: [
      'Fission needs two parents, budding needs one',
      'Fission happens only in animals, budding only in plants',
      'In fission the parent divides into two equal daughters; in budding an unequal outgrowth leaves a parent that carries on',
      'Fission produces different offspring, budding produces identical ones',
    ],
    why: 'Fission splits the parent into equal halves and the parent is gone; a bud is a small unequal outgrowth that detaches from a parent which survives.',
  },
  {
    cat: 'principle',
    q: 'Why are both binary fission and budding called asexual reproduction?',
    a: 0,
    o: [
      'One parent is involved and no gametes fuse, so the offspring are genetically identical to it',
      'Because they happen only in single-celled organisms',
      'Because they need no water',
      'Because the offspring are always smaller than the parent',
    ],
    why: 'Asexual reproduction means one parent and no fusion of gametes, so the new individual carries a copy of the parent’s DNA.',
  },
  {
    cat: 'principle',
    q: 'In the binary fission of Amoeba, what divides first?',
    a: 1,
    o: [
      'The contractile vacuole',
      'The nucleus',
      'The pseudopodia',
      'The cell membrane at the waist',
    ],
    why: 'Karyokinesis comes before cytokinesis: the nucleus divides into two, and only then does the cytoplasm constrict at the middle.',
  },
  {
    cat: 'apparatus',
    q: 'Why does this practical use permanently mounted prepared slides rather than a drop of pond water?',
    a: 3,
    o: [
      'Pond water is too dilute to hold enough organisms to find',
      'A living cell cannot be looked at through a compound microscope at all',
      'Prepared slides are already stained, and stain is what makes an image sharp',
      'Reproduction takes hours and is over in a moment; a prepared slide has caught that moment and fixed it, so it can be found and drawn at leisure',
    ],
    why: 'You cannot order an Amoeba to divide while you watch. The technician has caught the stage, killed and mounted it, and the slide will still show it next year.',
  },
  {
    cat: 'apparatus',
    q: 'Why is the 10× objective always swung in first, even though the drawing is made at 40×?',
    a: 0,
    o: [
      'Its field is about four times wider and far deeper, so there is something to find at all — and its long working distance cannot reach the slide',
      'The two objectives are focused by different knobs, and only the coarse knob works at 40×',
      'Starting at 40× would pull the coverslip off the slide as the nosepiece turned',
      'The 40× objective inverts the image, so the specimen would appear upside down',
    ],
    why: 'Finding and crashing are the two risks, and low power answers both: a wide, deep field to search in, and a lens that physically cannot reach the glass.',
  },
  {
    cat: 'apparatus',
    q: 'What is the lamp dial actually changing in the image?',
    a: 2,
    o: [
      'The magnification, which rises with brightness',
      'The resolution, which is set by the lamp rather than by the objective',
      'How much light gets through the specimen — a narrow high-power cone needs a brighter source, while too much light at low power washes the contrast out',
      'The temperature of the slide, which has to be kept warm for the specimen to stay visible',
    ],
    why: 'Illumination is not magnification. The 40× objective takes in a smaller cone of light than the 10×, so the same lamp setting leaves the high-power field dimmer.',
  },
  {
    cat: 'procedure',
    q: 'Why must the specimen be brought to the middle of the field at 10× before the 40× is swung in?',
    a: 1,
    o: [
      'Because the stage cannot be moved once the 40× is in place',
      'Because the high-power field is about a quarter as wide, so anything left off-centre at low power is simply outside the field at high power',
      'Because the 40× objective turns the image a quarter turn as it swings in',
      'Because the specimen drifts towards the edge as the tube is racked down',
    ],
    why: 'The objectives are parfocal about the centre and nowhere else. Centring is not tidiness — it is the only thing that keeps the specimen in the picture.',
  },
  {
    cat: 'procedure',
    q: 'Once the 40× is in, why is the fine adjustment used and never the coarse?',
    a: 3,
    o: [
      'The coarse knob does not move the tube at all while the 40× is in',
      'The coarse knob moves the stage sideways rather than up and down',
      'Turning the coarse knob at high power loosens the objective in the nosepiece',
      'At 40× the objective sits a fraction of a millimetre above the coverslip, and one turn of the coarse knob drives it through the glass',
    ],
    why: 'The whole reason a microscope carries two knobs is that the last fraction of a millimetre has to be crossed in steps too small for the coarse rack.',
  },
  {
    cat: 'procedure',
    q: 'You are looking down the eyepiece and the field is a blur. Which way should the tube be turned?',
    a: 1,
    o: [
      'Towards the slide, slowly, watching the eyepiece as it comes down',
      'Away from the slide, so the focal plane is approached from the side on which the objective cannot reach the glass',
      'Either way, as long as the coarse knob is used to save time',
      'Neither: the slide should be lifted by hand under the clips until it looks sharp',
    ],
    why: 'Focusing away from the slide can only ever end in a blur; focusing towards it can end in a crack. The clearance is set first, by eye from the side, and then given back.',
  },
  {
    cat: 'errors',
    q: 'A field shows one rounded cell with a single nucleus and nothing growing out of it. Why is it wrong to record that as budding?',
    a: 2,
    o: [
      'Because that organism never reproduces by budding',
      'Because budding cannot be resolved at 40×',
      'Because budding is recognised by the outgrowth itself, and there is no outgrowth there to be a bud',
      'Because a single nucleus means the specimen must be in fission instead',
    ],
    why: 'A process is recorded from what the specimen shows, not from what the organism is capable of. A resting cell is a resting cell.',
  },
  {
    cat: 'errors',
    q: 'Why is a dark field not the same thing as an empty slide?',
    a: 0,
    o: [
      'With the lamp low or off there is nothing to light the specimen, so a perfectly good slide reads as blank — the fault is the illumination, not the slide',
      'A dark field always means the objective lens is dirty',
      'A dark field always means the slide has been clipped on upside down',
      'A dark field always means the coverslip has come away from the mount',
    ],
    why: 'Every one of the three commonest "nothing on this slide" reports is really the lamp, the centring or the focus. Check all three before calling a slide empty.',
  },
  {
    cat: 'errors',
    q: 'Each slide in the box carries a number. What does that number tell you about the specimen on it?',
    a: 1,
    o: [
      'The magnification the slide was mounted to be viewed at',
      'Nothing at all — it is only the technician’s order in the box, and identifying the slide is done by looking',
      'The number of organisms mounted on that slide',
      'Its place in a sequence running from the simplest organism to the most complex',
    ],
    why: 'Labels are a filing convenience. Reading one and writing down what you expect to find is the one habit this practical is designed to break.',
  },
  {
    cat: 'interpretation',
    q: 'Why do yeast buds sometimes appear as a chain of cells?',
    a: 3,
    o: [
      'The cells are dividing by fission at the same time',
      'The slide has been squashed under the coverslip',
      'Two parents have fused end to end',
      'A bud can start budding itself before it has pinched off from the parent',
    ],
    why: 'When food is plentiful a bud grows its own bud before separating, so three or four cells stay attached in a short chain.',
  },
  {
    cat: 'interpretation',
    q: 'Why is a bud on Hydra described as a miniature adult?',
    a: 1,
    o: [
      'It is a single cell that will grow into an adult later',
      'It grows a hypostome, a mouth and tentacles of its own before it detaches',
      'It is exactly half the size of the parent',
      'It stays attached to the parent for life',
    ],
    why: 'The bud develops the full body plan — hypostome, mouth and a ring of tentacles — while still on the parent, then drops off and feeds on its own.',
  },
  {
    cat: 'interpretation',
    q: 'Half the slides in the box carry an organism that is not reproducing at all. Why are they there?',
    a: 0,
    o: [
      'So that the process has to be read off the specimen: with nothing to compare against, "budding" could be written for any yeast cell on sight',
      'To make the practical take a full period',
      'Because the technician could not prepare six dividing specimens',
      'Because a resting cell is what a dividing one turns into once the division finishes',
    ],
    why: 'A control is what turns a recognition exercise into an observation. Naming the resting slides correctly is worth exactly as much as naming the dividing ones.',
  },
];
