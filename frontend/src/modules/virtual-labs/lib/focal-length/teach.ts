import type { TeachSection } from '@labs/components/teach-sections';

/**
 * WHAT THE DRAWN RAYS MEAN, as data — the teaching panel for the focal-length
 * bench.
 *
 * THE RULE, AND HOW IT IS KEPT HERE. Everything this practical marks is a
 * number the student takes off the apparatus themselves — where each stand
 * stands, how sharp the image is, the mean of their own three values of f — so
 * a panel that read the state could hand one of them over.
 *
 * It used to be inline JSX handed nothing and printing nothing, which was a
 * promise kept by care. Moving the words out of the component and into this
 * module makes it structural instead: there is no bench state in scope in this
 * file at all — no stand position, no screen view, no optics solver, no trial,
 * no mean — so nothing can be quoted back, now or after any later edit. The
 * words below are the same at every position of every stand, on every bench
 * seed, for the mirror and for the lens.
 *
 * It is also why there is no `revealed` parameter. A panel that opens up at the
 * end is a panel that was holding something back; this one never held anything.
 *
 * It says what "in focus" IS. It does not say where this bench's focal plane
 * happens to be; the card says that, and finding it is the practical.
 */
const SECTIONS: readonly TeachSection[] = [
  {
    heading: 'Where do the cones of light come from?',
    kind: 'why',
    lead:
      'Every point of the object throws light out in all directions, and the mirror or the lens catches a whole ' +
      'cone of it and turns that cone round so it closes again, to a point.',
    body: [
      'Light does not leave an object along one line. **Every point of it** — one leaf of the tree, one edge of ' +
        'the window frame — throws light out in all directions, and the mirror or the lens catches a whole cone ' +
        'of it. What the optic does is turn that cone round so it closes again, to a point.',
    ],
  },
  {
    heading: 'What does in focus actually mean?',
    kind: 'why',
    lead:
      'That the card is standing exactly where those cones close, so every point of the object is a point on the ' +
      'card and you get a picture.',
    body: [
      '**In focus** means the card is standing exactly where those cones close. Every point of the object is then ' +
        'a point on the card, and you get a picture. Move the card away from there, either way, and each cone is ' +
        'caught before or after it has closed, so every point of the object arrives as a small disc. The picture ' +
        'is the sum of thousands of overlapping discs, which is what blur is. The further off you are, the wider ' +
        'the discs, and the dimmer too — the same light spread over more card.',
    ],
  },
  {
    heading: 'Why must the object be far away?',
    kind: 'how',
    lead:
      'Because only from something distant do the rays arrive effectively **parallel**, and parallel rays close ' +
      'at the **principal focus** — which is what makes the optic-to-card distance the focal length itself.',
    body: [
      'That is why the object has to be **far away**. From something distant the cone is so narrow by the time it ' +
        'arrives that its rays are effectively parallel, and parallel rays close at the **principal focus**. The ' +
        'distance from the optic to the card is then the focal length itself, which is the only reason this ' +
        'practical can measure f by subtracting two positions on a scale.',
    ],
  },
  {
    heading: 'Are the drawn rays really there?',
    kind: 'watch',
    lead:
      'No — a real optical bench shows you nothing of them: there is no light in the air to see, only the patch ' +
      'on the card.',
    body: [
      'The lines drawn across the bench are a teaching aid and nothing more. A real optical bench shows you ' +
        'nothing of them: there is no light in the air to see, only the patch on the card. Switch them off and ' +
        'you are looking at the bench as it really is.',
    ],
  },
];

/**
 * The panel's contents.
 *
 * It takes no argument, and that is the point: there is no bench state it could
 * be handed, so there is none it could print.
 */
export function focalLengthTeach(): readonly TeachSection[] {
  return SECTIONS;
}

export type { TeachSection };
