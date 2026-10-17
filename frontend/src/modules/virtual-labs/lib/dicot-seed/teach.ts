import type { TeachSection } from '@labs/components/teach-sections';

/**
 * "WHAT'S HAPPENING" — the teaching panel for the dicot seed bench, as data.
 *
 * THE RULE, AND HOW IT IS KEPT HERE. What is marked on this bench is what the
 * student finds on their OWN seed: the hilum and the micropyle on the intact
 * coat, six labels dropped on the parts they name, the seven rows of the table,
 * and three conclusions. So the panel explains the mechanism the seed is obeying
 * — imbibition, why a wet coat behaves differently from a dry one, what the
 * embryo axis is — and it is BLIND to the specimen.
 *
 * Its whole input is `revealed`. Moving the words out of a component and into
 * this module makes that structural rather than careful: the seed, its species,
 * how long it has soaked, whether the coat came off whole or in flakes, where
 * any part lies on it and what has been written down are not in scope in this
 * file at all. It therefore cannot point at anything on this student's seed —
 * now or after any later edit — and it reads the same before a seed has been
 * taken out of a dish as it does with one split open on the tile.
 *
 * `revealed` earns its place twice over. Which end of the embryo axis becomes
 * the root and which the shoot is the thirty-mark labelling; which part emerges
 * first on germination, and by which route, is the third conclusion sentence and
 * is meant to be watched on the cotton dish. Both wait until the practical is
 * finished, and until then the last section says so in as many words rather than
 * leaving a gap. What is taught before then is the anatomy of the axis and the
 * argument for each part's existence, which is what makes the labelling
 * answerable rather than a guess.
 *
 * THE THREE DRAWINGS ARE UNDER THE SAME RULE. They are named rather than
 * supplied — a section holds a key and the bench's own `Teach` wrapper hands the
 * drawing in — because this file is pure data and a component here would drag
 * React into `lib/`; `teach-figures.tsx` says for each one what it teaches and
 * why it is state-free, and none of them is handed a seed. The imbibition curve
 * is set under the soaking paragraph and carries no numbers on either scale,
 * because how far this student's own seed had swollen is itself marked. The two
 * anatomy drawings name and place the very parts the labelling and the table are
 * marked on, so they wait with the rest of the answers until `revealed` — which
 * is why they hang off the revealed section under one key, `anatomy`, and cannot
 * be reached from any section that is always present.
 */
const ALWAYS: readonly TeachSection[] = [
  {
    heading: 'What is imbibition?',
    kind: 'why',
    lead:
      'It is a physical swelling of dry colloids rather than growth — the starch, protein and cellulose walls ' +
      'banked in the seed attract water strongly, and wet ones take up more room than dry ones do.',
    body: [
      'A ripe seed is dry — near a tenth of its weight is water, and every enzyme in it is sitting inert. Most of ' +
        'what fills it is the food banked in its two thick halves: starch grains, protein bodies, and the ' +
        'cellulose walls of the cells holding them, all three of which attract water strongly. Put that seed in ' +
        'water and it takes water up by **imbibition**, a physical swelling of dry colloids rather than growth. ' +
        'Nothing divides and nothing is built; the seed simply gets wet from the inside and gets bigger, because ' +
        'wet starch and wet protein take up more room than dry ones do.',
    ],
  },
  {
    heading: 'Why overnight, and not five minutes?',
    kind: 'why',
    lead:
      'The coat is close to waterproof, so almost all the water has to come through one microscopic pore — and ' +
      'the uptake then flattens off after about eight hours, which is why two days would be no better.',
    // The curve belongs under this paragraph, which is where it was set in the
    // component. It carries no numbers on either scale, because how far a
    // particular seed had swollen is itself marked.
    figure: 'imbibition',
    body: [
      'The coat is close to waterproof — dead, thick-walled, waxed tissue whose whole job is to keep water out — ' +
        'so almost all the water that gets in has to come through the one microscopic pore left in it. One pore ' +
        'is why soaking takes hours instead of seconds. Every water-attracting site then takes up what it can and ' +
        'stops, so the uptake is quick at first and slows as the seed fills: the curve flattens off after about ' +
        'eight hours, which is why the instruction is “overnight” and why two days would be no better. The fine ' +
        'bubbles leaving a soaking seed are the air that filled the spaces between its dry cells, pushed out as ' +
        'water takes their place.',
    ],
  },
  {
    heading: 'Why does a soaked coat peel and a dry one tear?',
    kind: 'why',
    lead:
      'Dry, the walls of the testa are glassy and brittle, so a load cracks them and the crack runs; wet, the ' +
      'same walls imbibe, soften and turn leathery, so a lift travels round the seed instead.',
    body: [
      'The testa is dead tissue: layers of thick-walled cells cemented to one another. Dry, those walls and that ' +
        'cement are glassy — stiff, and brittle — and a brittle sheet cannot stretch, so when it is loaded it ' +
        'cracks, and the crack runs. The coat comes away in flakes, and the flakes stay stuck to what they were ' +
        'covering. Wet the same walls and they imbibe too: they swell, they soften, the sheet turns leathery, and ' +
        'a lift in one place now travels round the seed instead of starting a crack, so the whole thing comes off ' +
        'as one piece.',
    ],
  },
  {
    heading: 'Why is the seed parted and not cut?',
    kind: 'how',
    lead:
      'The two halves meet along a **natural plane** where nothing joins them, so a swollen seed slides apart ' +
      'along it under a needle — while a blade cuts straight through the embryo lying between them.',
    body: [
      'The two halves of the embryo are packed against one another along a surface where nothing joins them — a ' +
        '**natural plane**. Swollen, they are turgid and slippery and slide apart along it, which is why a needle ' +
        'is enough. Dry, the seed is one brittle solid and a force meant to part it finds the weakest cracks ' +
        'instead: it comes to pieces. A blade does something worse than fail — it cuts straight across both ' +
        'halves, and through the embryo lying between them, so there is nothing left whole to identify.',
    ],
  },
  {
    heading: 'What is the embryo axis?',
    kind: 'why',
    lead:
      'It is the actual plant — a stalk a few millimetres long attached between the two halves, with a growing ' +
      'point at each end, one of which becomes the entire root system and the other the entire shoot.',
    body: [
      'Take the coat off and almost everything left is larder: two thick halves packed with stored food, which ' +
        'are neither leaves nor roots. The actual plant is the small piece attached between them — the **embryo ' +
        'axis**, a stalk a few millimetres long with a growing point at each end. One of those growing points ' +
        'will become the entire root system; the other will become the entire shoot — stem, leaves, flowers, all ' +
        'of it. For its first week or two the seedling does nothing but pull food out of the two halves and build ' +
        'more axis with it. Which growing point is which, and where on your own seed the axis has stayed, is ' +
        'exactly what the labelling asks you to work out, so the panel stops there.',
    ],
  },
  {
    heading: 'Why is a dicot seed called non-endospermic?',
    kind: 'why',
    lead:
      'Its embryo eats the **endosperm** while the seed is still ripening and banks the food in its own two ' +
      'cotyledons, so a ripe seed has none left at all — which is what non-endospermic means.',
    body: [
      'Fertilisation in a flowering plant makes two things at once: the embryo, and a separate food tissue called ' +
        'the **endosperm**. What becomes of that endosperm afterwards is what splits seeds into two kinds. In a ' +
        'wheat or maize grain it stays, and it is most of the grain; the embryo’s single cotyledon lies against ' +
        'it and digests it as the seedling grows, and such a seed is **endospermic**. In gram, pea and kidney ' +
        'bean the embryo eats the endosperm while the seed is still ripening on the plant and banks the food in ' +
        'its own two cotyledons, so a ripe seed has none left at all — which is what **non-endospermic** means, ' +
        'and why those two halves are so thick and heavy. The larder has been moved inside the embryo. Two ' +
        'cotyledons: di-cotyledon, a **dicot**. One: a monocot. It is a count, not a measurement, which is why ' +
        'all three seeds on this bench give the same answer at three different sizes.',
    ],
  },
  {
    heading: 'What is germination?',
    kind: 'why',
    lead:
      'Soaking is physical; germination is the growth that follows — water restarts the enzymes, the stored food ' +
      'is cut up and moved into the embryo axis, and its cells stretch and begin to divide.',
    body: [
      'Soaking is physical; germination is what the wet seed then does with itself. Water restarts enzymes that ' +
        'were sitting dry and inert, and they cut the stored starch to sugar and the stored protein to amino ' +
        'acids; those move out of the two halves into the embryo axis, whose cells take up water, stretch and ' +
        'begin to divide. That is growth — and it is why a germinating seed needs air as well as water, since ' +
        'releasing the energy in that sugar takes oxygen. The two ends of the axis do not start together, and the ' +
        'order is not arbitrary: a seedling that cannot hold on to the ground and draw its own water cannot ' +
        'support anything above it.',
    ],
  },
];

/**
 * What the panel will not do for you, said out loud while it is still being
 * asked. Without this the holding back would read as an omission.
 */
const HELD_BACK: TeachSection = {
  heading: 'Which end moves first, and by which route?',
  kind: 'how',
  lead:
    'That is one of the things you are asked to state, so this panel will not do it for you — sow a soaked seed ' +
    'on the wet cotton and let the lab clock run.',
  body: [
    'Which end moves first and by which route it leaves the seed is one of the things you are asked to state. ' +
      'Sow a soaked seed on the wet cotton and let the lab clock run: your own dish will show you. This panel ' +
      'will not do it for you.',
  ],
};

/**
 * The answers, and the two anatomy drawings with them, once naming a part can
 * cost nobody a mark. Both drawings hang off this one section under the key
 * `anatomy`, so there is no section present before `revealed` that could reach
 * them.
 */
const SETTLED: TeachSection = {
  heading: 'Now the marks are settled: which end is which?',
  kind: 'after',
  figure: 'anatomy',
  lead:
    'The **radicle** is the pointed, thicker end and becomes the root; the **plumule** is the feathery end and ' +
    'becomes the shoot, and on germination the radicle comes out first through the **micropyle**.',
  body: [
    'The **radicle** is the pointed, thicker end of the embryo axis and becomes the root; the **plumule** is the ' +
      'feathery end and becomes the shoot. On germination the radicle comes out first, and it leaves through the ' +
      '**micropyle** — the same pore the water came in by, and the only easy way out of a coat built to keep ' +
      'things out. The plumule follows once the root is established, and only then do the cotyledons, emptied, ' +
      'shrivel and drop away. Two cotyledons make it a dicot; the food sitting in those cotyledons rather than ' +
      'in a separate endosperm makes it non-endospermic.',
  ],
};

/**
 * The panel's contents.
 *
 * @param revealed true once the labelling, the table and the conclusions have
 * been submitted and the marks for them are settled.
 */
export function dicotSeedTeach(revealed: boolean): readonly TeachSection[] {
  return revealed ? [...ALWAYS, SETTLED] : [...ALWAYS, HELD_BACK];
}

export type { TeachSection };
