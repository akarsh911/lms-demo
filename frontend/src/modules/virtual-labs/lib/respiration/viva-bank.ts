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
    q: 'Lime water turns milky because…',
    a: 1,
    o: [
      'carbon dioxide dissolves and simply clouds the water',
      'carbon dioxide reacts with calcium hydroxide to form insoluble calcium carbonate',
      'oxygen reacts with calcium hydroxide to form calcium oxide',
      'water vapour from the flask condenses in the test tube',
    ],
    why: 'Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O. Calcium carbonate will not dissolve, so it hangs in the liquid as a white precipitate — that is the milkiness.',
  },
  {
    cat: 'apparatus',
    q: 'Why is a second flask of boiled seeds set up alongside the first?',
    a: 2,
    o: [
      'To use up the spare lime water',
      'Boiled seeds keep the first flask warm',
      'Boiled seeds are dead, so milkiness there could not come from respiration — it is the control',
      'Boiled seeds respire faster, so the result comes sooner',
    ],
    why: 'Dead seeds cannot respire. Its lime water staying clear is what shows the CO₂ in the other flask came from living seeds and not from the air already inside the apparatus.',
  },
  {
    cat: 'procedure',
    q: 'Why is vaseline smeared round the cork before the clock is started?',
    a: 0,
    o: [
      'It makes the joint airtight, so the only way out for the gas is down the delivery tube',
      'It stops the cork from swelling and cracking the neck of the flask',
      'It absorbs any carbon dioxide that would otherwise escape at the neck',
      'It holds the bent glass tube steady in the hole of the cork',
    ],
    why: 'A cork pushed into a neck is a far easier way out than a long narrow tube. Grease closes that route, and only then is the gas obliged to take the tube.',
  },
  {
    cat: 'errors',
    q: 'The cork is pushed in but not sealed, so the joint leaks. What happens?',
    a: 1,
    o: [
      'The lime water turns milky faster',
      'Most of the carbon dioxide escapes at the neck instead of going down the delivery tube, so the lime water stays clear or barely changes',
      'The seeds stop respiring',
      'Lime water is sucked back into the flask',
    ],
    why: 'Gas takes the easiest way out. The seeds go on respiring, but too little CO₂ reaches the lime water to precipitate visible calcium carbonate — the experiment fails for a reason that has nothing to do with the biology.',
  },
  {
    cat: 'interpretation',
    q: 'Suppose one flask were sealed with vaseline and the other left with the cork merely resting in the neck. Why would the experiment no longer be a fair test?',
    a: 3,
    o: [
      'Because the sealed flask would grow warmer than the unsealed one',
      'Because the unsealed flask would draw lime water back up its delivery tube',
      'Because the seeds in the unsealed flask would stop respiring once the air in it was used up',
      'Because the two flasks would then differ in two things at once, so any difference between them could no longer be put down to the seeds',
    ],
    why: 'A control is only worth having if it is identical in every respect but the one under test. Change a second thing and the comparison can no longer separate the two.',
  },
  {
    cat: 'principle',
    q: 'During respiration, germinating seeds…',
    a: 1,
    o: [
      'take in carbon dioxide and give out oxygen',
      'take in oxygen and give out carbon dioxide',
      'take in nitrogen and give out carbon dioxide',
      'neither take in nor give out any gas',
    ],
    why: 'C₆H₁₂O₆ + 6O₂ → 6CO₂ + 6H₂O + energy. Oxygen is consumed and carbon dioxide released — the reverse of photosynthesis.',
  },
  {
    cat: 'apparatus',
    q: 'Why are germinating seeds used rather than dry ones?',
    a: 2,
    o: [
      'Dry seeds are too hard to fit through the neck of the flask',
      'Dry seeds turn lime water blue instead of milky',
      'Germination switches on the seed’s metabolism, so it respires fast; a dry seed is dormant and gives off almost no CO₂ in the time available',
      'Dry seeds absorb carbon dioxide instead of releasing it',
    ],
    why: 'Soaking and germinating raise the respiration rate many times over. A dormant dry seed would need days to turn lime water milky.',
  },
  {
    cat: 'procedure',
    q: 'How is the seal tested, and when?',
    a: 2,
    o: [
      'By warming the flask in the water bath once the clock has run, and watching for condensation',
      'By lifting the cork out after the run to see whether it comes away cleanly',
      'By squeezing the flask gently before the clock is started, and watching for a string of bubbles at the far end of the delivery tube',
      'By shaking the test tube until the lime water clouds',
    ],
    why: 'Squeezing drives a little of the trapped air out. If the joint is tight it can only leave by the tube, and you see it arrive. A leak found after twenty minutes has already cost you the run.',
  },
  {
    cat: 'errors',
    q: 'A student fits the cork but pours only 5 mL of lime water, leaving the mouth of the bent tube above the surface. What is the consequence?',
    a: 1,
    o: [
      'The gas dissolves in the lime water more slowly, so the change takes about twice as long',
      'The gas breaks into the empty space above the liquid and never meets the calcium hydroxide at all',
      'The lime water is drawn up the delivery tube and into the flask',
      'The carbon dioxide is forced back into the flask and stops the seeds respiring',
    ],
    why: 'A gas can only react with what it touches. The mouth of the tube has to be under the surface so that every bubble is made to travel up through the liquid.',
  },
  {
    cat: 'interpretation',
    q: 'The water bath is switched on and warms both flasks together. What does that change?',
    a: 0,
    o: [
      'Only the speed: respiration roughly doubles per 10 °C in both flasks alike, so the comparison between them is untouched',
      'The kind of gas the seeds give out, from carbon dioxide to water vapour',
      'The chemistry of the lime water, which needs warmth before calcium carbonate can form',
      'Nothing at all: respiration runs at the same rate at every temperature',
    ],
    why: 'Warmth speeds the enzymes up, nothing more. Because the bath warms every flask together it costs the experiment none of its fairness — it only shortens the wait.',
  },
  {
    cat: 'principle',
    q: 'Respiring seeds give off carbon dioxide, water and heat. Why is the carbon dioxide the thing this experiment sets out to detect?',
    a: 2,
    o: [
      'Because it is the only one of the three that respiration actually produces',
      'Because it is the only product that is a gas, so the other two cannot leave the flask',
      'Because there is a simple, specific chemical test for it that a school laboratory can set up in minutes',
      'Because the other two are produced by the boiled seeds as well',
    ],
    why: 'All three come out of the same equation. Carbon dioxide is chosen because lime water answers for it unmistakably; warmth and moisture are far harder to pin on respiration alone.',
  },
  {
    cat: 'apparatus',
    q: 'Why must the far end of the bent delivery tube dip below the surface of the lime water?',
    a: 3,
    o: [
      'To stop lime water evaporating out of the test tube',
      'To keep room air from travelling back up the tube into the flask',
      'To stop the glass tube cracking as the flask warms',
      'So that gas coming down it has to bubble up through the liquid, where the calcium hydroxide is',
    ],
    why: 'The reaction happens where gas and solution meet. Under the surface, every bubble is made to travel the length of the liquid; above it, the gas simply fills the space at the top of the tube.',
  },
  {
    cat: 'procedure',
    q: 'Both test tubes are read at the same moment rather than one soon after the other. Why?',
    a: 1,
    o: [
      'Because lime water begins to clear again a few minutes after it has reacted',
      'Because the flasks have then stood for the same length of time, which is the only way the two are comparable',
      'Because the delivery tubes would otherwise have to be swapped between the flasks',
      'Because carbon dioxide escapes from the test tube if it is left standing',
    ],
    why: 'The experiment compares two flasks, so the only honest reading is a pair taken together. Read one twenty minutes after the other and the difference between them is partly a difference in time.',
  },
  {
    cat: 'errors',
    q: 'A bottle of lime water left standing open in the laboratory for weeks is already faintly cloudy. Why is it unfit for this experiment?',
    a: 0,
    o: [
      'Carbon dioxide from the room air has already precipitated calcium carbonate in it, so it starts part-used and its change no longer belongs to the seeds',
      'Standing turns calcium hydroxide into calcium chloride, which does not react with carbon dioxide',
      'Cloudy lime water reacts with carbon dioxide to give a clear solution instead of a milky one',
      'Light spoils lime water, so it has to be kept in a dark cupboard rather than stoppered',
    ],
    why: 'Lime water takes carbon dioxide from wherever it can get it, the air included. Use it clear and freshly prepared, or filtered, so that whatever it does during the run is the seeds’ doing.',
  },
  {
    cat: 'interpretation',
    q: 'In the alternative set-up a small tube of KOH hangs inside the flask, and coloured water climbs the delivery tube from the beaker. What does the height it climbs measure?',
    a: 2,
    o: [
      'The volume of carbon dioxide the seeds have given out',
      'The pressure of the water vapour the seeds have given off',
      'The volume of oxygen the seeds have used up, since the KOH takes the carbon dioxide away as fast as it is made',
      'The weight of the seeds lost while they respired',
    ],
    why: 'Respiration swaps one gas for another, so a sealed flask barely changes volume. Absorb the carbon dioxide and the swap is broken: the gas shrinks by the oxygen consumed, and the water rises to fill the gap.',
  },
];
