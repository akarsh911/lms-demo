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
    q: 'Light from a tree 120 m away is treated as a beam of rays parallel to the principal axis. Why?',
    a: 1,
    o: [
      'Because light from any source travels in parallel lines',
      'Because the tree is so far away that the cone of rays reaching the small mirror spreads over a negligible angle',
      'Because the concave mirror makes the incoming rays parallel before reflecting them',
      'Because a distant object is brighter than a near one',
    ],
    why: 'At 120 m, the rays that fall on a 5 cm mirror differ in direction by about two hundredths of a degree — parallel for this purpose. Parallel rays converge at the principal focus, which is why the sharp image lands in the focal plane.',
  },
  {
    cat: 'interpretation',
    q: 'The image of the distant tree caught on the screen is…',
    a: 1,
    o: [
      'virtual, erect and enlarged',
      'real, inverted and very much smaller than the tree',
      'real, erect and the same size as the tree',
      'virtual, inverted and smaller',
    ],
    why: 'The rays really meet on the card — that is what makes it real, and only a real image can be caught on a screen. They cross on the way, so it is inverted, and its height is the object height × v/u, which for a distant object is a centimetre or so.',
  },
  {
    cat: 'procedure',
    q: 'Why must the screen be moved back and forth instead of simply being placed in front of the mirror?',
    a: 2,
    o: [
      'To keep the screen out of the light falling on the mirror',
      'To make the image larger before it is measured',
      'Because only at one position do the rays actually meet; there the image is sharpest, and that distance from the pole is f',
      'Because the screen has to be at half the radius of curvature of the screen itself',
    ],
    why: 'Away from the image plane every point of the object spreads into a blur circle whose size grows with the defocus. The position of sharpest image marks where the rays converge, so screen-to-pole distance = f.',
  },
  {
    cat: 'principle',
    q: 'The tree is replaced by a candle 40 cm in front of the same concave mirror. The sharp image now forms…',
    a: 1,
    o: [
      'at the same place — at the focus, as before',
      'farther from the mirror than the focus',
      'nearer the mirror than the focus',
      'nowhere: a concave mirror cannot image a near object on a screen',
    ],
    why: '1/v = 1/f − 1/u. Bringing the object in from infinity pushes the image out beyond F, so the distance you would measure is v, not f. That is exactly why the object has to be distant.',
  },
  {
    cat: 'apparatus',
    q: 'A classmate suggests using the Sun as the distant object and looking at it through the convex lens. You should…',
    a: 2,
    o: [
      'agree — the Sun is the most distant object available',
      'agree, but look for only a second or two',
      'refuse: never look at the Sun through a lens or a mirror — use a distant tree or window instead',
      'agree, and just squint while looking',
    ],
    why: 'A lens or mirror concentrates sunlight enough to char paper, and focused on the retina it burns it permanently, with no pain to warn you. The standard object for this experiment is a distant tree or window.',
  },
  {
    cat: 'apparatus',
    q: 'The mirror, the screen and the stands are all set at the same height above the bench. Why does that matter?',
    a: 0,
    o: [
      'So that the pole of the mirror and the centre of the screen both lie on the principal axis, which is the line f is measured along',
      'So that the stands are less likely to be knocked over',
      'So that the image comes out the right way up on the card',
      'So that the mirror collects as much light as possible',
    ],
    why: 'f is an axial distance. With the card standing above or below the axis the bright patch is caught obliquely, and the separation you read off the metre scale is a slant length, longer than f.',
  },
  {
    cat: 'errors',
    q: 'The metre scale on this bench has a least count of 0.1 cm. What does that mean for the value of f you write down?',
    a: 3,
    o: [
      'The scale can be read to 0.01 cm by judging the gap between two millimetre marks',
      'The least count applies to the screen stand only, not to the mirror stand',
      'Averaging three trials makes the mean good to as many decimals as the arithmetic gives',
      'No figure beyond the first decimal place can be justified, so each position is written to 0.1 cm',
    ],
    why: 'A reading is never better than the smallest division of the instrument. Repeating a measurement reduces the random scatter, but it cannot manufacture a digit the scale was never able to give.',
  },
  {
    cat: 'errors',
    q: 'Two of your three values of f agree to within a millimetre and the third is nearly 3 cm away from them. The sensible thing to do is…',
    a: 2,
    o: [
      'average all three, because every reading taken has to be kept',
      'keep the odd one and discard the two that agree, since they may both share the same mistake',
      'set that trial up again and focus it afresh — a value that far outside the scatter points to a blurred image or a misread scale, not to honest spread',
      'take the largest of the three, because the sharpest image is always the furthest out',
    ],
    why: 'Three repeats are a check on one another. A value sitting far outside the scatter of the rest is a mistake to be hunted down and repeated, not random error to be diluted by averaging.',
  },
  {
    cat: 'errors',
    q: 'Instead of moving the screen you slide the mirror along the bench to focus. Is that allowed?',
    a: 0,
    o: [
      'Yes — f is the separation of the two, so either stand may be the one that moves, provided both positions are read afterwards',
      'No — once the mirror has been aimed it must not be moved again',
      'No — only the screen may be moved, because the mirror position by itself fixes the focal length',
      'Yes, and then f is simply the screen reading, since the mirror counts as the zero of the scale',
    ],
    why: 'What is measured is the distance from the pole to the focal plane, f = |a − b|. Nothing in that depends on which of the two stands you pushed to close the gap.',
  },
  {
    cat: 'procedure',
    q: 'Between trials the mirror has to be shifted along the bench and the image found again. Why is reading the same set-up twice not a second trial?',
    a: 3,
    o: [
      'Because the focal length of a mirror changes slightly each time it is moved',
      'Because a metre scale reads differently along different parts of its length',
      'Because the image grows fainter if the screen is left standing in one place',
      'Because both readings would carry exactly the same focusing error, so the second adds nothing and the mean would hide the mistake instead of reducing it',
    ],
    why: 'Repeats are worth having only when they are independent. Re-reading one set-up repeats the same defocus and the same parallax, so the spread of your three values stops measuring anything at all.',
  },
  {
    cat: 'interpretation',
    q: 'For a spherical concave mirror, the radius of curvature R and the focal length f are related by…',
    a: 1,
    o: [
      'R = f — the focus and the centre of curvature are the same point',
      'R = 2f — the centre of curvature is twice as far from the pole as the principal focus',
      'R = f ⁄ 2',
      'R and f are unrelated; R depends only on how wide the mirror is',
    ],
    why: 'Paraxial rays from a distant object are reflected to a point halfway between the pole and the centre of curvature, so F is the midpoint of PC and R = 2f.',
  },
  {
    cat: 'interpretation',
    q: 'The lower half of the convex lens is covered with black paper. The image of the distant tree on the screen is then…',
    a: 2,
    o: [
      'only the upper half of the tree',
      'only the lower half of the tree',
      'still the whole tree, but dimmer',
      'the same brightness as before, but half as tall',
    ],
    why: 'Rays from one point of the object fall on the whole aperture and are all brought to the same image point. Masking part of the lens removes some of those rays, so the image loses light, not area.',
  },
  {
    cat: 'interpretation',
    q: 'Why can this method not be used to find the focal length of a concave lens?',
    a: 0,
    o: [
      'A concave lens makes parallel rays diverge, so its image of a distant object is virtual and cannot be caught on a card',
      'A concave lens has no focal length to find',
      'The image would form so far down the bench that a metre scale is too short',
      'The image would form on the same side as the object, where the screen would shade the lens',
    ],
    why: 'Only a real image can be received on a screen. A diverging lens sends the light out still spreading, and it is the backward extensions of those rays that meet, at a virtual focus behind the lens.',
  },
];
