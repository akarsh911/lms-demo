import type { TeachSection } from '@labs/components/teach-sections';

/**
 * WHAT THE RAY BOX IS SHOWING, as data — the teaching panel that sits beside
 * the beam the demonstration puts on the paper.
 *
 * THE RULE, AND HOW IT IS KEPT HERE. This practical marks nine protractor
 * readings taken off the student's own trace, which of their own three rays
 * deviated least, and the index that follows — so a panel that read the state
 * could quote a reading, or the true minimum for this bench's glass, straight
 * back at them.
 *
 * It used to be inline JSX handed nothing and printing nothing, which was a
 * promise kept by care. Moving the words out of the component and into this
 * module makes it structural instead: there is no bench state in scope in this
 * file at all — no aim, no trial, no trace, no refractive index, no minimum —
 * so nothing can be quoted back, now or after any later edit. The words below
 * are the same at every aim of the box, on every bench seed, before and after
 * the marks are in.
 *
 * It is also why there is no `revealed` parameter. A panel that opens up at the
 * end is a panel that was holding something back; this one never held anything.
 *
 * The numbers live where they belong: on the **Ray box** page of the notebook,
 * which is about the demonstration's own beam and never about the student's
 * trace, and on the plot, which is drawn from the box's aim rather than from
 * any reading.
 */
const SECTIONS: readonly TeachSection[] = [
  {
    heading: 'Why does a prism turn the light at all?',
    kind: 'why',
    lead:
      'Its two faces are **inclined**, so the second refraction cannot undo the first — the two bends **add**, ' +
      'and how far the ray has been turned is the **angle of deviation**, D.',
    body: [
      'A slab has parallel faces, so its second refraction undoes the first and the ray comes out parallel to the ' +
        'way it went in. A prism’s two faces are **inclined**, so the second refraction cannot undo the first — ' +
        'the two bends **add**, and the ray leaves turned towards the base. How far it has been turned is the ' +
        '**angle of deviation**, D.',
    ],
  },
  {
    heading: 'Where does the bending actually happen?',
    kind: 'why',
    lead:
      'At the two surfaces and nowhere else — between them the ray runs dead straight, bending towards the normal ' +
      'on the way in and away from it on the way out.',
    body: [
      'The turn happens at the surfaces, not in the glass: between them the ray runs dead straight. At the first ' +
        'face it bends towards the normal on the way in, and at the second it bends away from the normal on the ' +
        'way out. Nothing is chosen — each bend is whatever the refraction equation gives for the angle the ray ' +
        'happens to arrive at.',
    ],
  },
  {
    heading: 'Why plot a curve instead of taking one reading?',
    kind: 'how',
    lead:
      'Because D does not fall for ever: it falls, reaches **one minimum** where the passage is symmetric, and ' +
      'rises again — and that single lowest point is what the practical is after.',
    body: [
      'Turn the box and D does not fall for ever. It falls, reaches **one minimum**, and rises again. At that ' +
        'minimum the passage is symmetric: the light enters and leaves at the same angle, the ray inside runs ' +
        'parallel to the base, and every other deviation is reached at two different angles of incidence, one on ' +
        'each side. That single lowest point is the whole reason this practical plots a curve instead of taking ' +
        'one reading.',
    ],
  },
  {
    heading: 'Why does nothing come out the far face?',
    kind: 'watch',
    lead:
      'You came in too squarely: inside the glass the ray meets that face beyond the **critical angle**, the ' +
      'refraction equation has no solution, and all of the light is turned back out through the base.',
    body: [
      'Come in too squarely at the first face and nothing emerges through the second at all. Inside the glass the ' +
        'ray meets that face beyond the **critical angle**, the refraction equation has no solution, and all of ' +
        'the light is turned back and leaves through the base — **total internal reflection**, not a special case ' +
        'written into the bench but what is left when there is no answer.',
    ],
  },
  {
    heading: 'Is the ray box part of the experiment?',
    kind: 'watch',
    lead:
      'No — it is a demonstration that takes no reading, adds no step and moves no mark; the **four pins** are ' +
      'how you find a ray you cannot see.',
    body: [
      'None of this is on a real sheet of paper. The glass is clear, the ray inside it leaves no track, and that ' +
        'is exactly why the **pin method** exists: four pins in a line are the only way to find a path you cannot ' +
        'see. The ray box is a demonstration — it takes no reading, adds no step and moves no mark.',
    ],
  },
];

/**
 * The panel's contents.
 *
 * It takes no argument, and that is the point: there is no bench state it could
 * be handed, so there is none it could print.
 */
export function prismTeach(): readonly TeachSection[] {
  return SECTIONS;
}

export type { TeachSection };
