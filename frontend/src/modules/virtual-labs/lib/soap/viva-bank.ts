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
    q: 'What makes a sample of water “hard”?',
    a: 2,
    o: [
      'Carbon dioxide dissolved in it from the air above',
      'Clay and fine sand held in suspension',
      'Dissolved calcium and magnesium salts',
      'A pH that has fallen below 7',
    ],
    why: 'Hardness is caused by dissolved salts of calcium and magnesium — their bicarbonates give temporary hardness, their chlorides and sulphates permanent hardness.',
  },
  {
    cat: 'principle',
    q: 'The white curdy solid that forms when soap is shaken with hard water is…',
    a: 1,
    o: [
      'soap that simply failed to dissolve, and is still unreacted',
      'the insoluble calcium or magnesium salt of the fatty acid — scum',
      'calcium carbonate thrown out of the water by the shaking',
      'sodium chloride crystallising out as the solution is stirred',
    ],
    why: 'Scum is calcium (or magnesium) stearate: 2C₁₇H₃₅COONa + Ca²⁺ → (C₁₇H₃₅COO)₂Ca↓ + 2Na⁺. It is insoluble, so it settles out instead of lathering.',
  },
  {
    cat: 'principle',
    q: 'Why does soap give so little lather in hard water?',
    a: 3,
    o: [
      'Hard water breaks the froth down again as quickly as it is formed',
      'Soap reacts with the water itself once ions are present in it',
      'The lather sinks into the liquid, because hard water is the denser of the two',
      'The soap is precipitated as scum, so hardly any is left in solution to foam',
    ],
    why: 'The soap is consumed before it can foam. Once enough soap has been added to use up every Ca²⁺ and Mg²⁺ ion, the extra soap stays in solution and hard water lathers too.',
  },
  {
    cat: 'apparatus',
    q: 'The soft-water tube is filled with **distilled** water rather than tap water. Why does that matter?',
    a: 0,
    o: [
      'Distilled water has had everything dissolved taken out of it, so the contrast is as clean as it can be',
      'Distilled water is purer, and a pure liquid dissolves soap chemically rather than physically',
      'Tap water comes out too cold for soap to dissolve in it properly at the bench',
      'Distilled water has been boiled, and boiled water always froths more readily',
    ],
    why: 'The comparison is between water carrying hardness ions and water carrying none. Tap water usually carries some, which would blur the very difference the experiment is set up to show.',
  },
  {
    cat: 'apparatus',
    q: 'The tubes are **corked** before they are shaken, rather than shaken with a thumb over the top. Why?',
    a: 0,
    o: [
      'A cork seals the tube the same way every time, so the shaking can be matched between tubes',
      'A cork keeps the soap solution from going off while the tube is being handled',
      'The cork traps the air that the froth is afterwards built out of',
      'A thumb would take the dye and the grease of the skin into the tube',
    ],
    why: 'Both tubes have to be treated identically. A cork is a repeatable seal; a thumb leaks, lets froth escape past it, and cannot be matched from one tube to the next.',
  },
  {
    cat: 'apparatus',
    q: 'The scale is held with its **zero at the water line**, not at the bottom of the tube. Why there?',
    a: 0,
    o: [
      'The quantity wanted is the height of the froth column, and that column starts at the surface',
      'A test tube has a rounded bottom, so no scale can be lined up against it at all',
      'The scale is not long enough to reach from the bottom of the tube to the froth',
      'It lets the volume of water and the height of the froth be read off together',
    ],
    why: 'What is compared between the tubes is the froth, not the liquid beneath it. Measuring from the bottom would add the water column to every reading and the tubes would stop being comparable.',
  },
  {
    cat: 'procedure',
    q: 'Why must both tubes get equal volumes of water, equal soap and equal shaking?',
    a: 0,
    o: [
      'So that the only difference left between them is the water, and the froth can be put down to the hardness',
      'Because the prescribed method in the syllabus asks for it in those words',
      'To make the soap solution in the dropper last out the whole practical',
      'So that the two tubes balance one another and sit level in the rack',
    ],
    why: 'This is a controlled comparison. If one tube got more soap or more shaking, a difference in froth proves nothing about the water — the experiment is spoiled even if the numbers look neat.',
  },
  {
    cat: 'procedure',
    q: 'One tube is given two more drops of soap than the other by accident. What must be done?',
    a: 0,
    o: [
      'Even the soap up and start that pair again, since the froth can no longer be put down to the water',
      'Nothing: two drops is far too small an amount to make any difference to the froth',
      'Give the other tube two extra shakes, which makes up for the missing drops',
      'Record the heights and note the two extra drops in the margin of the table',
    ],
    why: 'The experiment holds everything constant except the water. Once the soap differs, the froth heights are measuring the soap, and no amount of careful noting afterwards repairs that.',
  },
  {
    cat: 'procedure',
    q: 'Why is the froth read a moment after the shaking stops, rather than several minutes later?',
    a: 0,
    o: [
      'A froth column drains and falls as it stands, and the two tubes would not be left standing equally long',
      'The scum rises up into the froth after a few minutes and gets measured with it',
      'Water evaporates quickly out of an uncorked tube and the level drops',
      'The soap goes on reacting slowly with the glass of the tube itself',
    ],
    why: 'Froth is not permanent. If one tube is read at once and the other after a wait, part of the difference recorded is the wait — a difference in method, not in the water.',
  },
  {
    cat: 'errors',
    q: 'A student shakes one tube eight times and the other three times, and finds much more froth in the first. What follows about the water?',
    a: 0,
    o: [
      'Nothing at all: the first tube may have frothed more simply because it was shaken more',
      'That the first water is the softer, since more shaking cannot create froth from nothing',
      'That the second water is the harder, since it frothed less under any treatment',
      'That the result still stands, because shaking changes only how fast froth forms',
    ],
    why: 'Two things differed between the tubes, so neither can be blamed for the result. This is why equal soap, equal shaking and equal volume are part of the method and not a formality.',
  },
  {
    cat: 'errors',
    q: 'Reading the froth height with the eye above the top of the column, rather than square on, gives…',
    a: 0,
    o: [
      'a parallax error, which shifts the reading by more than the millimetre the scale can resolve',
      'a froth column that collapses under the weight of the scale held against it',
      'no error at all, since the scale is beside the tube and not inside it',
      'a reading in millimetres where the scale is in fact graduated in centimetres',
    ],
    why: 'The scale and the froth are a short distance apart, so a sideways eye position projects the top of the column onto the wrong division. Reading straight on costs nothing and is the difference between 2.8 cm and 3.0 cm.',
  },
  {
    cat: 'errors',
    q: 'One tube is filled to 5 mL and the other to 10 mL, and both get the same soap and the same shaking. Why is the comparison spoiled?',
    a: 0,
    o: [
      'The same soap spread through twice the water is half the concentration, before hardness comes into it at all',
      'A larger volume of any water is harder than a smaller volume of the same water',
      'The fuller tube takes longer to shake, so it is always the less well mixed of the two',
      'Nothing is spoiled, because the two tubes still received exactly the same soap',
    ],
    why: 'Lather depends on how much free soap there is per millilitre, not on the number of drops. Unequal volumes change that on their own, and the froth heights then say nothing about hardness.',
  },
  {
    cat: 'interpretation',
    q: 'Detergents lather well even in hard water because…',
    a: 2,
    o: [
      'they soften the water first, and only then begin to clean it',
      'they are far stronger alkalis than soap is, and overwhelm the ions',
      'their calcium and magnesium salts are soluble, so no scum is precipitated',
      'they carry no long hydrocarbon chain, so there is nothing for the ions to take',
    ],
    why: 'Detergents are ammonium or sulphonate salts of long-chain hydrocarbons. Their calcium and magnesium salts dissolve, so the ions never take the detergent out of solution.',
  },
  {
    cat: 'interpretation',
    q: 'Keep adding soap to hard water and it lathers in the end. What does that show?',
    a: 0,
    o: [
      'It can be lathered, but only after every Ca²⁺ and Mg²⁺ has been thrown out as scum, so soap is wasted',
      'The water was never really hard, and the first few drops were mismeasured',
      'The soap and the hardness ions did not in fact react with one another at all',
      'Soap works in hard water just as economically as it does in soft water',
    ],
    why: 'The ions are used up one by one, and every drop of soap spent on them is a drop that never cleaned anything. That waste is exactly what makes hard water expensive to wash in.',
  },
  {
    cat: 'interpretation',
    q: 'Boiled hard water lathers better than hard water, but still not as well as distilled water. The best explanation is that…',
    a: 0,
    o: [
      'boiling removes the temporary hardness only, and any permanent hardness is left behind',
      'boiling removes all the hardness, so the poorer lather must be a slip in the measuring',
      'boiling puts calcium carbonate into the water and so makes it harder than before',
      'boiled water is warmer than the rest, and warm water always froths less freely',
    ],
    why: 'Boiling decomposes the bicarbonates and the chalk is filtered off, which is the temporary part. Chlorides and sulphates of calcium and magnesium survive boiling untouched, and they go on precipitating soap.',
  },
];
