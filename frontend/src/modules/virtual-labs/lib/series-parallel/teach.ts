import type { TeachSection } from '@labs/components/teach-sections';

import { P } from './apparatus';

/**
 * "WHAT'S HAPPENING" — the teaching panel for the series/parallel bench, as data.
 *
 * THE RULE, AND HOW IT IS KEPT HERE. The panel demonstrates the method and never
 * hands over a marked value. Everything marked on this bench is read off the
 * apparatus by the student: the two least counts, twelve pairs of meter readings
 * across four circuits, the four means they come to, and the two combinations
 * worked out from their own R₁ and R₂. So this panel is not filtered — it is
 * BLIND.
 *
 * It takes nothing. Moving the words out of a component and into this module
 * makes that structural rather than careful: there is no bench state in scope
 * here to print, no state, no solver, no reading, no mean and no verdict on the
 * wiring, so nothing can be quoted back — now or after any later edit. The only
 * numbers below are properties of the instruments themselves, printed on the
 * apparatus rather than measured off it, and they arrive from `apparatus.ts`
 * exactly as they did in the component. The algebra of the two combinations is
 * here in full because the algebra is the method — the console's own input boxes
 * are labelled with it — while the two resistors it is to be applied to stay
 * unknown until the student measures them.
 *
 * The consequence is checkable by inspection and by driving this module from
 * plain Node: the words below are the same with no wire laid and with the
 * practical finished, in any of the four circuits, on every bench seed. There is
 * nothing here for a later edit to leak, because there is nothing here to leak
 * from.
 *
 * It is also why there is no `revealed` parameter. A panel that opens up at the
 * end is a panel that was holding something back; this one never held anything.
 *
 * The two staircases are named rather than supplied — `figure: 'seriesLadder'`
 * and `figure: 'parallelLadder'` — because this file is pure data and a
 * component here would drag React into `lib/`. The bench's own `Teach` wrapper
 * hands them in, and each now sits under the paragraph that argues for it rather
 * than both together after the second.
 */
const SECTIONS: readonly TeachSection[] = [
  {
    heading: 'What does a pair of resistors do that one cannot?',
    kind: 'why',
    lead:
      'Joined in series they offer the charge a single road through both; joined in parallel they offer it two — ' +
      'so the same four circuits are built on the same bench and each is measured the same way.',
    body: [
      'What does a pair of them do that one of them cannot? Joined in series, one after the other, they offer the ' +
        'charge a single road through both. Joined in parallel, side by side between the same two points, they ' +
        'offer it two roads. So the same four circuits are built on the same bench and each is measured the same ' +
        'way — the current through it, the potential difference across it, and its resistance from the ratio of ' +
        'the two.',
    ],
  },
  {
    heading: 'How do you tell series from parallel?',
    kind: 'how',
    lead:
      'Not by how the drawing looks, but by saying the circuit out loud: if the walk round it never offers you a ' +
      'choice of turning, everything you named is in series; if the path divides and the parts meet again, ' +
      'whatever lies between those two junctions is in parallel.',
    body: [
      'Do not go by how the drawing looks — a parallel pair can be drawn side by side, stacked, or as a loop, and ' +
        'none of that is the test. Say the circuit out loud instead. Put a finger on one terminal of the source ' +
        'and walk, naming everything you cross, until you are back where you began. If the walk gets round without ' +
        'ever having to choose a turning, everything you named is in series and one current runs through the whole ' +
        'sentence. If you reach a junction where the path divides and the parts meet again further on, whatever ' +
        'lies between those two junctions is in parallel, and the current divides there while the potential does ' +
        'not. Then two checks on your own wiring follow from the same walk: a lead you cannot fit into the ' +
        'sentence is a lead going nowhere, and a lead that lets you get home two different ways when there should ' +
        'have been one has put something in parallel that you meant to be in series — most often a resistor with ' +
        'a wire laid straight across it, which takes it out of the circuit altogether.',
    ],
  },
  {
    heading: 'Why do the resistances add in series?',
    kind: 'why',
    lead:
      'There is one road and so one current, each resistor takes its own drop, and going once round the loop ' +
      'those drops add up to what the cells supplied — so the pair behaves as one resistor of **R₁ + R₂**.',
    // The series staircase belongs under the series argument. Both were set
    // after the parallel paragraph in the component, one below the other; each
    // is more use under the paragraph it illustrates.
    figure: 'seriesLadder',
    body: [
      'It has to be: there is no junction between them, and charge does not collect anywhere in between. Each ' +
        'resistor then takes its own drop, IR₁ and IR₂, and going once round the loop those drops add up to what ' +
        'the cells supplied: V = IR₁ + IR₂ = I(R₁ + R₂). Divide through by I and the pair behaves exactly as one ' +
        'resistor of **R₁ + R₂**. It could hardly be otherwise — the charge has to get through both, one after ' +
        'the other, so the pair is harder to drive than either of them alone.',
    ],
  },
  {
    heading: 'Why is a parallel pair smaller than either resistor alone?',
    kind: 'why',
    lead:
      'Both resistors sit between the same two points, so it is the currents that add rather than the potentials ' +
      '— **1/Rₚ = 1/R₁ + 1/R₂** — and giving the charge a second road can only make the pair easier to drive.',
    figure: 'parallelLadder',
    body: [
      'Both resistors are joined between the same two points, so the same potential difference sits across each ' +
        'of them; what differs is how much charge each lets through. Charge cannot pile up at a junction, so what ' +
        'arrives there splits between the branches and the shares add back up where the roads meet again — and ' +
        'the branch with the _smaller_ resistance carries the larger share, because the same push drives more ' +
        'through it. Now it is the currents that add: V/R₁ through one and V/R₂ through the other, so ' +
        'V/Rₚ = V/R₁ + V/R₂, which is **1/Rₚ = 1/R₁ + 1/R₂**, or Rₚ = R₁R₂/(R₁ + R₂). That always comes out ' +
        '_smaller than either resistor on its own_: you have given the charge a second road, and two roads take ' +
        'more traffic than one.',
    ],
  },
  {
    heading: 'What do the two staircases say that the formulae do not?',
    kind: 'why',
    lead:
      'In series the pair spends two steps one after the other, so it is harder to drive than either alone; in ' +
      'parallel it spends one step that both branches share, so it is easier.',
    body: [
      'Put them side by side and the whole difference is visible before any algebra. In series the pair spends ' +
        'TWO steps, one after the other, so the fall across the pair is bigger than either alone and the pair is ' +
        'harder to drive. In parallel the pair spends ONE step, which both branches share, so the fall across the ' +
        'pair is whatever that single step is and the pair is easier to drive than either alone. That also ' +
        'settles the two mistakes students make at this point. The potentials add in series because the steps are ' +
        'stacked; they do not add in parallel because there is only one step to add. And the currents add in ' +
        'parallel because the one step is being descended by two separate streams of charge; they do not add in ' +
        'series because there is only one stream.',
    ],
  },
  {
    heading: 'Why must the ammeter stay in the main line?',
    kind: 'why',
    lead:
      'An equivalent resistance needs the _whole_ current through the pair, and an ammeter sitting in one branch ' +
      'would only ever count that branch.',
    body: [
      'An equivalent resistance is the potential difference across the pair divided by the _whole_ current ' +
        'through it, and an ammeter sitting in one branch would only ever count that branch. In the main line it ' +
        'lies on every route out of the cells, so the whole of the current has to pass through it. The parallel ' +
        'combination is also the least resistance of the four circuits and therefore draws the largest current, ' +
        'which is why every circuit is switched on at the smallest current the bench can give it before anything ' +
        'is wound up.',
    ],
  },
  {
    heading: 'Why does the ammeter go in the line and the voltmeter across?',
    kind: 'why',
    lead:
      `An ammeter has to lie in the path it counts, so it is wound to about ${P.rAm} Ω to leave the current ` +
      `alone; a voltmeter has to touch two points, so it is wound to about ${P.rVm} Ω to leave them alone.`,
    body: [
      'An ammeter counts the charge going past it, so it has to be put in the path — which makes it part of the ' +
        'circuit, and anything added to a circuit changes it. The only way out is to make the change too small to ' +
        `matter: this one is wound to about ${P.rAm} Ω, a small fraction of the smallest thing it sits beside. A ` +
        'voltmeter compares the potential at two points, so it has to touch both of them, which offers the charge ' +
        'a road it did not have before; the way out there is the opposite one, and it is wound to about ' +
        `${P.rVm} Ω so that the road is nearly impassable. Exchange the two and both arguments fail at once — a ` +
        'voltmeter in the loop stops the current almost dead, and an ammeter laid across a resistor is a short ' +
        'circuit through a delicate instrument. Neither position is a rule to be memorised: it is the resistance ' +
        'of the instrument that decides where it is allowed to go.',
    ],
  },
  {
    heading: 'Why three readings of each arrangement?',
    kind: 'how',
    lead:
      'One pair of readings could be a fluke, so every arrangement is read at three different currents and the ' +
      'mean of the three ratios taken.',
    body: [
      'One pair of readings could be a fluke, so every arrangement is read at three different currents and the ' +
        'mean of the three ratios taken — and the manual offers two controls for that, either of which may be on ' +
        'the bench.',
    ],
  },
  {
    heading: 'How do the cell taps give three currents?',
    kind: 'how',
    lead:
      'This is the manual’s own method: take the circuit off at a later brass stud and another cell is driving ' +
      `it — ${P.cellEmf} V of push added each time, behind an arrangement that has not been touched.`,
    body: [
      'The holder carries three dry cells end to end with a brass stud between every pair, at A, B, C and D. Take ' +
        `the circuit off at B and one cell drives it, at C two, at D three — ${P.cellEmf} V of push added each ` +
        'time, behind an arrangement that has not been touched. It carries its own trap: only _one_ stud may hold ' +
        'a lead, because a wire from one stud to another lies straight across the cells between them and ' +
        'short-circuits them.',
    ],
  },
  {
    heading: 'What is the rheostat for, and how is it wired?',
    kind: 'how',
    lead:
      'It is a control rather than a thing being measured: wired through **A and C**, pushing the slider changes ' +
      'the current everywhere in the loop while the resistors under test stay exactly what they are.',
    body: [
      'Between its ends A and B lies resistance wire wound on a tube, and the sliding contact **C** taps that ' +
        'winding part of the way along. Wire the circuit through **A and C** and only the stretch between them is ' +
        'in the loop; push the slider and the current everywhere in the loop changes, while the resistors under ' +
        'test stay exactly what they are. Wire it through A and B instead and the whole coil is always in circuit; ' +
        'the slider then taps a length of wire leading nowhere, and sliding it changes nothing. A rheostat has ' +
        'also to be MATCHED to what it is controlling: put one of tens of ohms in series with a pair of about two, ' +
        'and it is the coil the cells are really driving — the resistors barely matter, the voltmeter across them ' +
        'sits at a twentieth of full scale, and the difference between series and parallel is buried. The one here ' +
        'is the small one the manual’s resistors need.',
    ],
  },
  {
    heading: 'Why does the key come out between readings?',
    kind: 'watch',
    lead:
      'Current heats the coils at I²R watts, and nichrome’s resistance climbs by about ' +
      `${(P.alpha * 100).toFixed(2)}% for every degree it warms — and both resistors are supposed to be the same ` +
      'two resistors in all four circuits.',
    body: [
      'Charge driven through a resistance gives up energy in it, at I²R watts, and that energy comes out as heat. ' +
        'Nichrome does not ignore its own temperature: its resistance climbs by about ' +
        `${(P.alpha * 100).toFixed(2)}% for every degree it warms, so a coil that has been carrying current for a ` +
        'while is genuinely no longer the coil it was cold. Both resistors are supposed to be the same two ' +
        'resistors in all four circuits, so the key is taken out between readings and they are given nothing to ' +
        'heat them with.',
    ],
  },
  {
    heading: 'Why are the wire ends sanded first?',
    kind: 'watch',
    lead:
      'Enamel and oxide sit between the copper and the terminal screw exactly where the current has to cross, ' +
      'adding a resistance that appears nowhere in the circuit diagram and pushes each of the four circuits by a ' +
      'different amount.',
    body: [
      'Copper does not stay bare. New connecting wire carries a thin insulating enamel, and wire that has lain in ' +
        'a drawer grows an oxide film of its own; either one sits between the copper and the terminal screw ' +
        'exactly where the current has to cross. A film like that is a resistance in series with everything — one ' +
        'that appears nowhere in the circuit diagram, is different at every joint, and is different again when a ' +
        'screw is nudged. It does not average out over repeated readings, because it is not random: it pushes ' +
        'every measurement the same way. On this practical it also pushes the four circuits by different amounts, ' +
        'since each is wired afresh — which is why it is step 2 of the procedure, why it is done once before any ' +
        'of the four goes on, and why this bench will not let a wire be laid until it is done.',
    ],
  },
];

/**
 * The panel's contents.
 *
 * It takes no argument, and that is the point: there is no bench state it could
 * be handed, so there is none it could print.
 */
export function seriesParallelTeach(): readonly TeachSection[] {
  return SECTIONS;
}

export type { TeachSection };
