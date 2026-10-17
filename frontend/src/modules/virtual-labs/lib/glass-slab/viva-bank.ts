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
    q: 'Why is the emergent ray parallel to the incident ray?',
    a: 2,
    o: [
      'Because glass does not bend light at all',
      'Because the ray reflects twice inside the slab',
      'Because the two faces are parallel, so the second refraction undoes the first and ∠e = ∠i',
      'Because the slab is thin',
    ],
    why: 'The normals at the two parallel faces are parallel, so the angle inside is the angle of refraction at one face and the angle of incidence at the other — the bending cancels exactly.',
  },
  {
    cat: 'interpretation',
    q: 'The lateral displacement of the ray depends on…',
    a: 1,
    o: [
      'only the length of the slab',
      'the thickness of the slab, the angle of incidence and the refractive index',
      'only the colour of the paper',
      'the distance between the two pins',
    ],
    why: 'd = t·sin(i − r)/cos r, and r comes from n. A thicker slab, a larger angle of incidence or a denser glass all shift the ray further.',
  },
  {
    cat: 'principle',
    q: 'Why does the ray bend towards the normal on entering the glass?',
    a: 3,
    o: [
      'Glass is heavier than air',
      'The ray is attracted to the glass surface',
      'Light speeds up in glass',
      'Light travels more slowly in glass, so going from a rarer to a denser medium turns it towards the normal',
    ],
    why: 'Refraction is a change of speed. Entering the optically denser medium, sin i / sin r = n > 1, so r < i.',
  },
  {
    cat: 'apparatus',
    q: 'What are the four pins for?',
    a: 0,
    o: [
      'Two pins fix the direction of the incident ray; the other two are placed in line with their images to fix the emergent ray',
      'They hold the glass slab down',
      'They hold the paper on the drawing board',
      'They mark the corners of the slab',
    ],
    why: 'Two points define a straight line. You see P₁ and P₂ through the glass along the emergent ray, so pins put in line with those images lie on the emergent ray.',
  },
  {
    cat: 'interpretation',
    q: 'A ray falls on the slab at 0°, along the normal. What happens?',
    a: 1,
    o: [
      'It bends towards the normal and comes out displaced',
      'It goes straight through undeviated and undisplaced',
      'It is totally internally reflected',
      'It comes out at 90°',
    ],
    why: 'With i = 0, sin i = 0, so sin r = 0 and r = 0. Nothing bends and d = 0 — the only ray a slab leaves completely alone.',
  },
  {
    cat: 'apparatus',
    q: 'Why must every pin stand upright in the paper rather than leaning?',
    a: 3,
    o: [
      'Because a leaning pin would scratch the face of the slab',
      'Because the paper tears if a pin goes in at an angle',
      'Because upright pins are easier to pull out again afterwards',
      'Because you judge the line by the pin heads but mark it by the holes the feet make, and on a leaning pin those are not the same point',
    ],
    why: 'Sighting is done on the heads; the pencil line is drawn through the holes. Lean a pin over and the two disagree by a few millimetres, and that difference goes straight into ∠e.',
  },
  {
    cat: 'apparatus',
    q: 'Why should P₁ and P₂ be pushed in at least about 5 cm apart instead of close together?',
    a: 1,
    o: [
      'Because two pins closer than 5 cm would both be hidden behind the slab',
      'Because the line is ruled through the two holes, and the further apart they are the less a small error in either one swings it',
      'Because the light needs room to spread out between them',
      'Because the protractor will not fit between two pins any closer',
    ],
    why: 'The angular error of a line through two points is roughly the position error divided by their separation. Doubling the gap halves the error in every angle you then read off that line.',
  },
  {
    cat: 'procedure',
    q: 'Why is the outline traced round the slab before the first pin goes in?',
    a: 2,
    o: [
      'Because the pencil will not mark the paper once there are pins in it',
      'Because the outline stops the slab sliding while the pins are pushed in',
      'Because the slab has to be lifted off before the points are joined, and after that the outline is the only record of where its faces lay',
      'Because the examiner expects to see the outline drawn first',
    ],
    why: 'Every angle is measured from the faces of that outline. Trace it late and a pin has already nudged the glass, so the outline records a position the light never passed through.',
  },
  {
    cat: 'procedure',
    q: 'When you fix P₃, what exactly are you bringing it into line with?',
    a: 0,
    o: [
      'The images of P₁ and P₂ as they appear through the glass — all four have to look like one straight line',
      'The two pins P₁ and P₂ themselves, seen over the top of the slab',
      'The normal drawn through the point of incidence',
      'The edge AB of the pencil outline',
    ],
    why: 'Light from P₁ and P₂ reaches your eye only after refracting at both faces, so it arrives along the emergent ray. A pin set on that line of sight is a point of the emergent ray.',
  },
  {
    cat: 'errors',
    q: 'Every row of your table gives ∠e a few degrees larger than ∠i. The most likely cause is…',
    a: 2,
    o: [
      'this slab has a refractive index larger than 1.5',
      'the slab was thicker than the one the theory assumes',
      'P₃ and P₄ were consistently off the line of sight, so the emergent ray you drew is not the one the light took',
      'the protractor reads one degree high all the way round',
    ],
    why: '∠e = ∠i follows from the faces being parallel, and holds whatever n or the thickness may be. A steady difference points at the sighting — or at an angle read from the face instead of from the normal.',
  },
  {
    cat: 'errors',
    q: 'A classmate measures the angle between the ray and the surface AB and writes it down as ∠i. Their value is…',
    a: 0,
    o: [
      '90° minus the true angle of incidence, so every ratio sin i ⁄ sin r they work out is wrong',
      'the same as the true angle of incidence, because the normal is perpendicular to the surface anyway',
      'twice the true angle of incidence',
      'perfectly usable, as long as they do the same thing at the second face',
    ],
    why: 'The normal and the face are 90° apart, so the two readings add to 90°. Sine is not linear, so taking the complement at both faces does not cancel out in the ratio either.',
  },
  {
    cat: 'interpretation',
    q: 'The 4 cm slab is swapped for a 6 cm one and the same angle of incidence is used. Your table would then show…',
    a: 1,
    o: [
      'a larger ∠r, because the light spends longer inside the glass',
      'the same ∠i, ∠r and ∠e, with a larger sideways shift',
      'a smaller ∠e, because the ray has further to travel',
      'no change at all in any column',
    ],
    why: 'The angles come from Snell’s law at the two faces and depend only on n and on ∠i. Thickness appears only in d = t·sin(i − r)/cos r, so only the shift grows.',
  },
  {
    cat: 'principle',
    q: 'Your three traces are at three quite different angles, yet sin i ⁄ sin r comes out near the same number each time. That constancy shows…',
    a: 3,
    o: [
      'that the protractor was reading accurately',
      'that the two faces of the slab were exactly parallel',
      'that the three angles of incidence were closer together than they looked',
      'that the ratio belongs to the glass and not to the angle you happened to choose — which is what makes it the refractive index',
    ],
    why: 'Snell’s law says that ratio is the same for every angle of incidence. Getting one number out of three different angles is the experimental evidence for it, and the number is n.',
  },
];
