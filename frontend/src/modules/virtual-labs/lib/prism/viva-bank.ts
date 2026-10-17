import type { BenchVivaQuestion } from '@labs/types/lab-bench';

/**
 * THE VIVA BANK for this practical — 13 questions across 5 categories.
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
    q: 'A glass slab only shifts a ray sideways, but a prism turns it. Why?',
    a: 2,
    o: [
      'The prism glass is denser than slab glass',
      'A slab is thinner than a prism',
      'The slab’s two faces are parallel, so the two refractions are equal and opposite; the prism’s faces are inclined at 60°, so the two bendings add',
      'Light travels faster inside a prism',
    ],
    why: 'In a slab the emergent ray is parallel to the incident ray and only laterally displaced, because the second refraction exactly undoes the first; the prism’s faces are not parallel, so the bendings add up into a deviation.',
  },
  {
    cat: 'principle',
    q: 'In D = i + e − A, what are i, e and A?',
    a: 1,
    o: [
      'The three angles of the glass triangle',
      'Angle of incidence at the first face, angle of emergence at the second face, and the angle of the prism',
      'Angle of incidence, angle of refraction inside the glass, and the critical angle',
      'Three readings of the same angle, averaged',
    ],
    why: 'The two internal angles satisfy r₁ + r₂ = A, and the ray turns by (i − r₁) at the first face and (e − r₂) at the second, so the total turn is D = i + e − A.',
  },
  {
    cat: 'interpretation',
    q: 'At the angle of minimum deviation, the ray inside the prism…',
    a: 0,
    o: [
      'runs parallel to the base, with i = e and r₁ = r₂',
      'grazes along the second face',
      'is totally internally reflected',
      'goes straight through without bending',
    ],
    why: 'Minimum deviation is the symmetric passage: i = e and r₁ = r₂ = A/2, so the internal ray is parallel to the base — which is why each deviation value except the minimum is reached at two different angles of incidence.',
  },
  {
    cat: 'principle',
    q: 'Why is the emergent ray deviated towards the base of the prism?',
    a: 3,
    o: [
      'Gravity pulls the light down towards the base',
      'The base is silvered',
      'The base is wider, so more light goes that way',
      'The glass is thicker towards the base, and at both inclined faces the ray turns the same way — towards the thicker part',
    ],
    why: 'Entering, the ray bends towards the normal; leaving, away from it — and because the two faces are inclined, both turns are in the same sense, towards the thicker end of the wedge, which is the base.',
  },
  {
    cat: 'interpretation',
    q: 'A narrow beam of white light through the prism gives a band of colours. That is…',
    a: 2,
    o: [
      'deviation — every colour is bent by the same amount',
      'reflection from the second face',
      'dispersion — the glass has a slightly different refractive index for each colour, so each colour is deviated by a different amount',
      'the same thing as total internal reflection',
    ],
    why: 'Deviation is the turning of one ray; dispersion is the splitting of white light, because n is larger for violet than for red, so violet is deviated most and red least.',
  },
  {
    cat: 'principle',
    q: 'Inside the glass the two angles of refraction satisfy r₁ + r₂ = A. Where does that come from?',
    a: 0,
    o: [
      'From the geometry alone: the two normals meet at 180° − A, and the triangle they make with the ray inside forces r₁ + r₂ = A',
      'From Snell’s law applied at each face, since sin r₁ + sin r₂ = sin A',
      'From the prism being equilateral, so that every angle in the figure is 60°',
      'From the condition for minimum deviation, which holds for every ray',
    ],
    why: 'It is pure geometry and has nothing to do with n — which is why D = i + e − A holds for every ray you trace, and for any prism angle, not only 60°.',
  },
  {
    cat: 'apparatus',
    q: 'Why is the refracting angle taken as A = 60° rather than measured again for each of the three rays?',
    a: 1,
    o: [
      'Because 60° is the angle that gives the least deviation for any glass',
      'Because A is a fixed property of the block, ground into the glass, and the same for every ray traced through it',
      'Because the angle of a prism changes with the angle of incidence',
      'Because a protractor cannot be laid on the apex of a prism',
    ],
    why: 'A is a constant of the apparatus, checked once against the outline. It enters D = i + e − A as a known number, not as a fourth reading to be taken each time.',
  },
  {
    cat: 'apparatus',
    q: 'Why must the prism be lifted off the paper before the four pins are joined up?',
    a: 3,
    o: [
      'Because the glass would magnify the pencil line and make it look crooked',
      'Because the prism has to be put away before the protractor comes out',
      'Because the pins cannot be pulled out while the prism is standing on them',
      'Because the path inside the glass is drawn by joining P to M on the outline, and the pencil cannot reach the paper under the block',
    ],
    why: 'The trace is a drawing of a path nobody ever saw. Once the glass is out of the way, the outline, the two points and the four pin holes are all that is left — and they are enough.',
  },
  {
    cat: 'procedure',
    q: 'Why are the three rays deliberately traced at well-separated angles of incidence, say near 35°, 50° and 65°?',
    a: 2,
    o: [
      'Because three rays at the same angle would make the same four pin holes',
      'Because the prism has to be moved to a new part of the sheet between rays',
      'Because the deviation changes only slowly near its minimum, so three angles bunched together give three almost equal values of D and no dip to read',
      'Because a small angle of incidence always produces total internal reflection',
    ],
    why: 'You are trying to see the shape of D against i from only three points. A wide spread is what makes the fall, the bottom and the rise visible at all.',
  },
  {
    cat: 'procedure',
    q: 'The angle of deviation D is read with the centre of the protractor placed where?',
    a: 0,
    o: [
      'Where the incident ray produced forwards crosses the emergent ray, with the baseline along that produced ray',
      'At the point of incidence P, with the baseline along the normal',
      'At the point of emergence M, with the baseline along face AC',
      'At the apex A of the prism',
    ],
    why: 'D is the angle between the light’s original direction and its final direction. Those two lines cross at one point on the paper, and that is where the protractor goes.',
  },
  {
    cat: 'errors',
    q: 'You look through face AC and can see nothing of the first two pins — the face behaves like a mirror. What has happened, and what do you do?',
    a: 1,
    o: [
      'The prism is the wrong way round; turn it over and sight again',
      'Inside the glass the ray met AC beyond the critical angle and was totally internally reflected, so pull the pins and come in at a larger angle of incidence',
      'The two pins are too far apart; bring them closer together and look again',
      'The room is too dark; the images will appear once a lamp is switched on',
    ],
    why: 'Below a certain angle of incidence, r₂ exceeds the critical angle and sin(refraction) would have to be more than 1. There is no emergent ray at AC to sight at all, so the only cure is a steeper incidence.',
  },
  {
    cat: 'errors',
    q: 'On one ray your readings give D six degrees away from i + e − A. What does that disagreement tell you?',
    a: 3,
    o: [
      'That the refracting angle of this block is not really 60°',
      'That the refractive index of the glass changed between the readings',
      'Nothing — D and i + e − A are different quantities and need not agree',
      'That at least one of the three was read from the wrong baseline or the wrong scale, since the three are not independent',
    ],
    why: 'D = i + e − A is geometry and holds for your own trace whatever that trace looks like. A gap of several degrees is a reading mistake to be found — most often an angle taken from the face instead of from the normal.',
  },
  {
    cat: 'interpretation',
    q: 'Every value of the deviation except the minimum itself is produced by two different angles of incidence. Why?',
    a: 2,
    o: [
      'Because the ray can leave through either face AC or the base BC',
      'Because the prism can be turned over to give a second reading',
      'Because the path is reversible, so interchanging i and e gives the same deviation — and the two coincide only at the symmetric passage where i = e',
      'Because white light contains two dominant colours',
    ],
    why: 'D = i + e − A is symmetric in i and e, and running the light back along the same path swaps them. The graph of D against i is therefore a valley with exactly one point at the bottom.',
  },
];
