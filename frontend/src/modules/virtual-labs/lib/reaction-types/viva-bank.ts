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
    q: 'Quicklime is added to water and the beaker becomes too hot to hold. This reaction is…',
    a: 2,
    o: [
      'decomposition, and endothermic',
      'displacement, and exothermic',
      'combination, and exothermic',
      'double displacement, and exothermic',
    ],
    why: 'CaO + H₂O → Ca(OH)₂: two substances join to make one, so it is a combination reaction, and it gives out so much heat that the water can start to boil — exothermic.',
  },
  {
    cat: 'principle',
    q: 'Iron nails are left in blue copper sulphate. Why is this called a displacement reaction?',
    a: 0,
    o: [
      'Iron is more reactive, so it takes copper’s place in the salt',
      'The two solutions exchange their ions',
      'One compound breaks into two',
      'Two elements combine into one compound',
    ],
    why: 'Fe + CuSO₄ → FeSO₄ + Cu. A free element (iron) pushes out a less reactive element (copper) from its compound, so exactly one element is displaced — that is displacement. The control tube, with no nail, stays blue.',
  },
  {
    cat: 'principle',
    q: 'A reaction in which a single compound is broken up by heat into two or more products is called…',
    a: 3,
    o: [
      'neutralisation',
      'a combination reaction',
      'a displacement reaction',
      'thermal decomposition',
    ],
    why: 'One reactant in, several products out, with heat as the agent. Counting the formulas on each side of the equation is what tells you the type — not the colour of what is left behind.',
  },
  {
    cat: 'apparatus',
    q: 'The ferrous sulphate is heated in a dry test tube rather than in an open dish because…',
    a: 1,
    o: [
      'a dish cannot be made hot enough',
      'a tube can be held in the flame and its narrow mouth keeps the escaping gases together and directed away from the face',
      'the crystals would dissolve in a dish',
      'a dish would crack and a tube never does',
    ],
    why: 'The choice of vessel is a safety decision as much as a heating one: choking gases come off, and a narrow mouth sends them one way.',
  },
  {
    cat: 'apparatus',
    q: 'A thermometer is stood in the quicklime tube because…',
    a: 0,
    o: [
      'a rise in temperature is the evidence that the reaction gives out heat, and evidence has to be measured rather than felt',
      'it stirs the mixture as the reaction goes',
      'it stops the mixture boiling over',
      'it shows the exact moment the reaction finishes',
    ],
    why: '“It felt warm” is not a reading. The thermometer turns the exothermic change into a number that can be written in the table.',
  },
  {
    cat: 'apparatus',
    q: 'A second tube of copper sulphate with no nail in it is kept beside the first. That tube is there…',
    a: 2,
    o: [
      'to double the amount of product',
      'as a spare in case the first tube breaks',
      'as the control: it shows what the solution does on its own, so any change in the first tube can be put down to the iron',
      'to keep the first tube upright in the rack',
    ],
    why: 'Without a control, a solution that faded simply from standing would be read as a reaction. The control is what makes the comparison honest.',
  },
  {
    cat: 'procedure',
    q: 'A tube of ferrous sulphate must never be corked while it is being heated because…',
    a: 3,
    o: [
      'the cork keeps the heat out of the tube',
      'the crystals would not change colour in a closed tube',
      'the cork would soak up the water driven off',
      'the gases given off have nowhere to go, and the pressure would burst the tube',
    ],
    why: 'Decomposition here produces SO₂ and SO₃. Gas made inside a sealed vessel over a flame is a bomb; the tube must stay open at the top.',
  },
  {
    cat: 'procedure',
    q: 'Water is added to quicklime slowly, a little at a time, because…',
    a: 1,
    o: [
      'the quicklime dissolves too slowly to take it all at once',
      'so much heat is given out that adding it all at once makes the mixture spit and boil',
      'the mixture would otherwise set solid',
      'the reaction will not start unless the water is added gradually',
    ],
    why: 'The heat is the hazard. Slaking releases enough of it to bring the water to the boil, and boiling alkaline slurry spits.',
  },
  {
    cat: 'procedure',
    q: 'The iron nails are rubbed with sandpaper before they go into the copper sulphate so that…',
    a: 2,
    o: [
      'the nails weigh more',
      'a sanded nail is a more reactive metal than iron itself',
      'rust and grease are removed and the iron itself is in contact with the solution',
      'the copper already on them is scraped off',
    ],
    why: 'The reaction happens at the surface of the metal. A layer of oxide or oil between the iron and the solution simply keeps the two apart.',
  },
  {
    cat: 'errors',
    q: 'After a few seconds of heating a student writes “brown residue” for the ferrous sulphate. Why is that wrong?',
    a: 0,
    o: [
      'at that stage the crystals have only lost their water of crystallisation; the brown residue comes later, on much stronger heating',
      'a brown residue never forms at all',
      'the residue is black, not brown',
      'the residue forms only if the tube is corked',
    ],
    why: 'The change runs in two stages, and recording the second before it has happened is recording the textbook instead of the tube.',
  },
  {
    cat: 'errors',
    q: 'The nail tube is looked at after two minutes and written down as “no change”. The likely explanation is…',
    a: 1,
    o: [
      'iron does not in fact react with copper sulphate',
      'the reaction is a slow one, and neither the coating nor the fading of the blue is far enough along in two minutes',
      'the solution was too dilute to react at all',
      'the nails were of the wrong metal',
    ],
    why: 'Some reactions are instant and some take a quarter of an hour. Reading a slow one too early records the clock, not the chemistry.',
  },
  {
    cat: 'errors',
    q: 'A white solid appears inside the dropper used to add the barium chloride. That tells you…',
    a: 3,
    o: [
      'the reaction can be reversed',
      'the solid is sodium chloride',
      'the barium chloride has decomposed',
      'the two solutions have met inside the dropper, so it is contaminated and neither its contents nor a reading taken with it can be trusted',
    ],
    why: 'A dropper that carries one solution into the bottle of another spoils the stock. One dropper per bottle, and rinse before it is put back.',
  },
  {
    cat: 'interpretation',
    q: 'Green ferrous sulphate crystals are heated. They first turn white because…',
    a: 1,
    o: [
      'iron(III) oxide has formed',
      'the crystals have lost their water of crystallisation',
      'sulphur dioxide has escaped',
      'the crystals have melted',
    ],
    why: 'FeSO₄·7H₂O is green because of the water of crystallisation. Driving that water off leaves anhydrous FeSO₄, which is white. Only stronger heating breaks the salt itself.',
  },
  {
    cat: 'interpretation',
    q: 'On stronger heating the white solid leaves a brown residue and a choking smell. The brown residue is…',
    a: 3,
    o: [
      'sulphur',
      'iron(II) sulphate',
      'iron filings',
      'ferric oxide, Fe₂O₃',
    ],
    why: '2FeSO₄ → Fe₂O₃ + SO₂ + SO₃. The brown residue is ferric oxide; the choking smell is the sulphur dioxide and sulphur trioxide burning off. One substance has broken into several, so this is decomposition.',
  },
  {
    cat: 'interpretation',
    q: 'Sodium sulphate and barium chloride give a white precipitate at once. That precipitate is…',
    a: 1,
    o: [
      'sodium chloride, and this is displacement',
      'barium sulphate, and this is double displacement',
      'barium hydroxide, and this is combination',
      'sulphur, and this is decomposition',
    ],
    why: 'Na₂SO₄ + BaCl₂ → BaSO₄↓ + 2NaCl. The two compounds swap their ions; barium sulphate is insoluble, so it drops out as a white precipitate. Sodium chloride stays dissolved.',
  },
];
