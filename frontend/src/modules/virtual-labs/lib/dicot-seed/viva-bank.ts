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
    q: 'What are the two cotyledons of a gram or bean seed for?',
    a: 2,
    o: [
      'They are the first true leaves of the plant',
      'They protect the seed like a second coat',
      'They store food and feed the young seedling until it can make its own',
      'They become the root system',
    ],
    why: 'In a dicot the food is stored in the cotyledons themselves, which is why such a seed is called non-endospermic.',
  },
  {
    cat: 'principle',
    q: 'The plumule and the radicle grow into…',
    a: 0,
    o: [
      'the shoot and the root respectively',
      'the root and the shoot respectively',
      'two cotyledons',
      'the seed coat and the hilum',
    ],
    why: 'The plumule is the feathery upper end of the embryo axis and becomes the shoot; the radicle is the pointed lower end and becomes the root.',
  },
  {
    cat: 'principle',
    q: 'A soaked seed is half as big again as a dry one. Why is that swelling not growth?',
    a: 1,
    o: [
      'It is growth, but of the seed coat only',
      'It is imbibition: dry starch, protein and cell wall physically take water up, and nothing divides and nothing is built',
      'It is the first division of the embryo’s cells, which begins the moment water reaches them',
      'It is the stored starch being digested into sugar, which takes up more room than starch does',
    ],
    why: 'Imbibition is a property of dry colloids, not of living tissue — dead seeds swell just as well. Growth begins later, when the enzymes it has rewetted go to work.',
  },
  {
    cat: 'apparatus',
    q: 'Why is a hand lens enough here, when looking at cells needs a compound microscope?',
    a: 3,
    o: [
      'Because a compound microscope cannot be used on anything that has been soaked',
      'Because a hand lens magnifies more strongly than a compound microscope does',
      'Because the seed would be crushed flat under a coverslip',
      'Because the structures being looked for are features of the whole seed, about a millimetre across, and ten times is plenty to separate them',
    ],
    why: 'You choose the magnification from the size of the thing. Putting a seed under 400× would show a patch of coat cells and none of the anatomy this practical is about.',
  },
  {
    cat: 'apparatus',
    q: 'A blade lies on the bench beside the needle. Why is the seed opened with the needle?',
    a: 0,
    o: [
      'The needle parts the two cotyledons along the surface where nothing joins them; a blade cuts across them, and through the embryo axis with them',
      'A blade would blunt itself on the toughened seed coat',
      'A blade cannot safely be used on a wet specimen',
      'The needle has been sterilised and the blade has not',
    ],
    why: 'The seed is parted, not cut. The natural plane is already there between the halves; the only skill is finding it instead of making a new one.',
  },
  {
    cat: 'apparatus',
    q: 'The dissection is done on a white tile. What is the tile for?',
    a: 2,
    o: [
      'It keeps the specimen warm while it is being opened',
      'It draws the water out of the seed so the coat dries enough to peel',
      'It is a plain pale background, so that a small pale structure a few millimetres long can be seen against it at all',
      'It is the only surface on which a blade may be used',
    ],
    why: 'Contrast is half of seeing. The embryo axis is cream-coloured and tiny; on a wooden bench it disappears, and on white it does not.',
  },
  {
    cat: 'procedure',
    q: 'Why is the seed soaked in water overnight before this experiment?',
    a: 1,
    o: [
      'To kill the embryo so it stops growing',
      'To soften the seed coat and swell the cotyledons, so the seed opens without breaking the embryo',
      'To wash the hilum off the seed',
      'To dissolve the food stored in the cotyledons',
    ],
    why: 'Water enters through the micropyle, softens the testa and swells the cotyledons, so the coat peels and the seed parts along its natural plane instead of shattering.',
  },
  {
    cat: 'procedure',
    q: 'Why is the outside of the seed examined before the coat is taken off, and not afterwards?',
    a: 2,
    o: [
      'Because the coat shrinks as soon as the seed leaves the water',
      'Because the hilum can only be seen while the seed is still wet',
      'Because the marks being looked for are on the coat itself, so they are thrown away with it',
      'Because the pore closes over once the cotyledons are exposed to the air',
    ],
    why: 'Both external features belong to the covering, not to the embryo. Peel first and there is nothing left to look at but two halves and an axis.',
  },
  {
    cat: 'procedure',
    q: 'The soaked seed is squeezed between finger and thumb before the coat comes off. What is that for?',
    a: 1,
    o: [
      'It loosens the coat so the forceps can get under an edge',
      'A bead of water is forced out of the pore in the coat, which shows that this is the way the water got in',
      'It tells you whether the two cotyledons have parted yet inside',
      'It drives the air out of the seed so that it will sink in the beaker',
    ],
    why: 'It turns a claim into a demonstration: the water comes back out of exactly the opening it went in by, and you have seen it do so.',
  },
  {
    cat: 'errors',
    q: 'A seed that has been in water for only an hour crumbles into pieces instead of opening. Why?',
    a: 3,
    o: [
      'The embryo has not yet grown enough to hold the two halves together',
      'An hour softens the coat but not the cotyledons, so the coat slips and the halves shear apart',
      'The water has not yet reached the scar on the flat edge',
      'Dry, the seed is a single brittle solid: a force meant to part it finds the weakest cracks instead of the plane between the halves',
    ],
    why: 'It is the same brittleness that makes a dry coat flake instead of lift. Give the water time and the halves become turgid and slippery and slide apart cleanly.',
  },
  {
    cat: 'errors',
    q: 'A student pushes the needle in while the coat is still on, and the seed will not open. What is holding it shut?',
    a: 0,
    o: [
      'The coat is wrapped round both halves at once and binds them together',
      'The needle is too blunt to reach the plane between the halves',
      'The two halves have fused because the seed was soaked too long',
      'The embryo axis runs across the plane and pins the halves to each other',
    ],
    why: 'The order of the two moves is not arbitrary. The coat is a single continuous case; nothing inside it can part until it is off.',
  },
  {
    cat: 'errors',
    q: 'Why would two days in the beaker be no better than one night?',
    a: 2,
    o: [
      'Because the coat dissolves once it has been wet for a day',
      'Because water stops entering as soon as the coat has softened',
      'Because uptake is fast at first and then flattens off: every water-attracting site takes what it can and stops, and the seed is close to full after about eight hours',
      'Because the swelling bursts the coat and spoils the specimen',
    ],
    why: 'The curve of water taken up against time levels out. "Overnight" is the instruction because overnight is already past the bend in it.',
  },
  {
    cat: 'interpretation',
    q: 'Why is a pea, gram or kidney bean seed called a dicot seed?',
    a: 1,
    o: [
      'Because it has two seed coats',
      'Because its embryo has two cotyledons',
      'Because it germinates in two days',
      'Because it has two micropyles',
    ],
    why: 'Di- means two: the embryo carries two cotyledons. A maize grain has one, so it is a monocot.',
  },
  {
    cat: 'interpretation',
    q: 'What is the function of the micropyle?',
    a: 3,
    o: [
      'It attaches the seed to the pod',
      'It stores food for the embryo',
      'It is the scar left when the seed coat is peeled',
      'It is a tiny pore that lets water and air in, and the radicle out',
    ],
    why: 'Press a soaked seed and a drop of water is forced out of the micropyle — the same pore the water went in through, and the one the radicle emerges from.',
  },
  {
    cat: 'interpretation',
    q: 'A maize grain has one cotyledon and a large endosperm. Where does its seedling’s first food come from?',
    a: 0,
    o: [
      'From the endosperm, a separate tissue that the single cotyledon digests — which is what makes it an endospermic seed',
      'From the single cotyledon, exactly as in a gram seed',
      'From the soil, since a monocot keeps no food store of its own',
      'From the seed coat, which is much thicker in a monocot',
    ],
    why: 'Both kinds of seed pack a larder; they differ in where it is kept. A dicot moves it into the embryo’s own cotyledons before the seed ripens, and a monocot leaves it outside.',
  },
];
