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
    q: 'One metal is said to be **more reactive** than another when…',
    a: 0,
    o: [
      'it can push the other out of a solution of that other metal’s salt',
      'it is harder and denser than the other, and harder to scratch',
      'it melts at a lower temperature than the other metal does',
      'it carries an electric current better than the other metal does',
    ],
    why: 'Reactivity here means how readily a metal gives up electrons and goes into solution as ions. Hardness, melting point and conductivity are properties of the metal, but none of them decides which way an exchange runs.',
  },
  {
    cat: 'principle',
    q: 'In Zn + CuSO₄ → ZnSO₄ + Cu, which species is **oxidised**?',
    a: 0,
    o: [
      'The zinc atoms of the strip, which give up electrons and leave as Zn²⁺',
      'The Cu²⁺ ions, which give up electrons and settle out as copper metal',
      'The sulphate ions, which are altered although they do not change place',
      'The water, which supplies the electrons that the exchange needs',
    ],
    why: 'Oxidation is loss of electrons. The zinc atoms hand theirs over and dissolve; the Cu²⁺ ions take them and are reduced to copper. Sulphate is a spectator and is not changed at all.',
  },
  {
    cat: 'principle',
    q: 'Aluminium stands above zinc in the reactivity series. It follows that…',
    a: 0,
    o: [
      'aluminium can displace zinc from zinc sulphate, and zinc cannot displace aluminium',
      'each of the two can displace the other, since both are reactive metals',
      'zinc can displace aluminium, because aluminium is the lighter of the two',
      'neither can displace the other, since both stand above copper and iron',
    ],
    why: 'Between any two metals the exchange runs one way only, from the more reactive to the less. Aluminium gives up its electrons the more readily, so it displaces zinc and never the other way about.',
  },
  {
    cat: 'apparatus',
    q: 'Every metal is also put into a solution of **its own** salt. What are those four tubes for?',
    a: 0,
    o: [
      'They are controls: a metal cannot displace itself, so any change there has another cause',
      'They speed the reactions up in the tubes standing next to them in the rack',
      'They are there so that no solution is left over at the end of the practical',
      'They show at a glance which of the four metals is the most reactive one',
    ],
    why: 'A control is a tube in which the thing being tested cannot happen. If a self-pair changed, the cause would be a dirty tube or a contaminated bottle — so the controls say whether the rest of the rack can be trusted.',
  },
  {
    cat: 'apparatus',
    q: 'All four solutions are **sulphates**, rather than one sulphate and one nitrate. Why?',
    a: 0,
    o: [
      'The negative ion is then the same in every tube, so the only variable left is the metal',
      'Sulphates are the only salts of these four metals that will dissolve in water',
      'The sulphate ion takes part in the exchange and the nitrate ion does not',
      'Nitrate solutions are coloured, which would hide the colour change being watched',
    ],
    why: 'The sulphate is a spectator and stays one throughout. Keeping it the same in all sixteen tubes means any difference between tubes can only come from the metals, which is the whole comparison.',
  },
  {
    cat: 'apparatus',
    q: 'The strips are rubbed with **sandpaper** and not simply rinsed with water. Why will rinsing not do?',
    a: 0,
    o: [
      'The oxide is a solid skin bonded to the metal, and only abrasion takes it off',
      'Water would attack the bare metal and dissolve part of the strip away',
      'A rinsed strip stays wet, and water dilutes the solution it is dropped into',
      'Rinsing leaves the surface too smooth for the solution to wet it properly',
    ],
    why: 'Grease and dust rinse off; an oxide coat does not. Aluminium’s film in particular is tough and insoluble, and nothing short of rubbing brings the strip back to bare metal.',
  },
  {
    cat: 'procedure',
    q: 'Only **one** strip goes into each tube. What goes wrong if two different metals are dropped into the same tube?',
    a: 0,
    o: [
      'Either metal could account for what the tube shows, so it settles nothing about either',
      'The two strips touch and short out, which stops the exchange altogether',
      'The solution warms up so much that it boils over the mouth of the tube',
      'The reaction runs backwards and the deposit dissolves again as you watch',
    ],
    why: 'One tube tests exactly one pair. With two metals in one solution neither the colour nor the deposit can be attributed, and the tube has to be emptied and started again.',
  },
  {
    cat: 'procedure',
    q: 'A little FeSO₄ has been splashed by accident into a tube belonging to the CuSO₄ group. The right thing to do is…',
    a: 0,
    o: [
      'empty that tube, rinse it, and refill it with CuSO₄ before any strip goes in',
      'add more CuSO₄ until the blue colour of the tube comes back to normal',
      'carry on with it, and note beside the entry that the tube was contaminated',
      'move the tube into the FeSO₄ group, where the splash would not matter',
    ],
    why: 'Topping up does not remove the iron, and the tube now holds a mixture that belongs to no single pair. Rinsing and starting that tube again costs a minute and saves the result.',
  },
  {
    cat: 'procedure',
    q: 'Why does the procedure have you leave the rack standing and come back to it, instead of reading it at once?',
    a: 0,
    o: [
      'These reactions take time, and a pair that is merely slow looks exactly like one that cannot happen',
      'The solutions have to come up to room temperature before they will react at all',
      'The strips need time to dissolve completely before anything can be judged',
      'The colours of the solutions only develop once they have been left in the dark',
    ],
    why: 'The pairs run at very different rates. Reading the rack too early records a slow reaction as no reaction, and that one error is enough to put two metals the wrong way round in the series.',
  },
  {
    cat: 'errors',
    q: 'A strip went in without being sandpapered and its tube shows nothing at all. Why is “no reaction” an unsafe thing to conclude?',
    a: 0,
    o: [
      'The oxide film may have blocked an exchange that would otherwise have run, so nothing was really tested',
      'Every pair of metals reacts somehow, so “no reaction” can never be a correct entry',
      'The strip would certainly have dissolved if it had only been left there for longer',
      'An uncleaned strip always reacts faster than a clean one, so the tube is misleading',
    ],
    why: 'A blocked exchange and an impossible one look identical in the tube. The entry may be an honest one, but the tube did not test what it was set up to test — which is why cleaning is a step and not a suggestion.',
  },
  {
    cat: 'errors',
    q: 'Which of these would do most damage to the comparison between the four metals?',
    a: 0,
    o: [
      'Sandpapering the strips for some tubes and leaving the strips for others uncleaned',
      'Standing the rack on the window sill instead of in the middle of the bench',
      'Using test tubes that are a centimetre or two different in length from one another',
      'Pouring 5 mL into most of the tubes and a little over 5 mL into one or two',
    ],
    why: 'Everything except the metals has to be held the same. A surface that is bare in one tube and oxide-coated in another alters the rate by far more than the difference in reactivity it is meant to reveal.',
  },
  {
    cat: 'errors',
    q: 'A student writes down the reaction the textbook predicts rather than what the tube in front of them showed. The real damage is that…',
    a: 0,
    o: [
      'the record stops being a report of the experiment, so nothing in it can be checked',
      'the marks for that one row are lost, and nothing else about the work is affected',
      'the textbook and the tube in fact always agree, so the entry is simply redundant',
      'the conclusion becomes harder to reach than it would have been from the tube',
    ],
    why: 'An observation is evidence; a prediction copied into an observation column is not. It also hides exactly what the record could have revealed — an uncleaned strip, a contaminated tube, or too short a wait.',
  },
  {
    cat: 'interpretation',
    q: 'Reading your finished table, how do you decide which metal is the **most** reactive?',
    a: 0,
    o: [
      'It is the one that produced a change in the greatest number of the other metals’ solutions',
      'It is the one whose own solution was changed in the greatest number of tubes',
      'It is the one whose strip was visibly eaten away in the greatest number of tubes',
      'It is the one that turned up as a deposit in the greatest number of tubes',
    ],
    why: 'A metal’s place in the series is set by how many of the others it can push out. A metal turning up as a deposit is the one being pushed out, which points the other way entirely.',
  },
  {
    cat: 'interpretation',
    q: 'A metal that is found plated on other strips, and never displaces anything itself, must be…',
    a: 0,
    o: [
      'below every metal it was tested against, since its ions took electrons in every pair',
      'above every metal it was tested against, since it came out as solid metal every time',
      'exactly in the middle of the series, since it both gained and lost electrons',
      'impossible, because every metal displaces at least one other from that other’s salt',
    ],
    why: 'Being plated out means its ions accepted electrons rather than gave them, and doing so in every pair means every other metal in the rack parts with electrons more readily than it does.',
  },
  {
    cat: 'interpretation',
    q: 'Two tubes both show a grey-black deposit. Why is that on its own not enough to rank the two strips against each other?',
    a: 0,
    o: [
      'A deposit says the strip displaced something, but the two tubes held different solutions and so tested different pairs',
      'A grey-black deposit is always copper, so the two tubes must be showing one and the same reaction',
      'The colour of a deposit is decorative and carries no information about the exchange at all',
      'Two tubes should never agree, so one of the two must have been contaminated by the other',
    ],
    why: 'Each tube settles one pair only. Ranking four metals means putting all the pair results together — which is exactly what counting along the rows of the finished table does.',
  },
];
