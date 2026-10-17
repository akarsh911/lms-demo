import type { TeachSection } from '@labs/components/teach-sections';

import { P } from './apparatus';

/**
 * "WHAT'S HAPPENING" — the teaching panel for the Ohm's law bench, as data.
 *
 * THE RULE, AND HOW IT IS KEPT HERE. The panel demonstrates the method and
 * never hands over a marked value. On this bench every marked value is read off
 * the apparatus by the student: the two least counts, the five pairs of meter
 * readings, and the resistance they draw out of their own line. So this panel is
 * not filtered — it is BLIND.
 *
 * It takes nothing. Moving the words out of a component and into this module
 * makes that structural rather than careful: there is no bench state in scope
 * here to print, no state, no solver, no readings, no fit and no verdict on the
 * wiring, so nothing can be quoted back — now or after any later edit. The only
 * numbers below are properties of the instruments themselves — the ammeter's
 * shunt, the voltmeter's coil, the cells' emf, nichrome's temperature
 * coefficient — which are printed on the apparatus rather than measured off it,
 * and they arrive from `apparatus.ts` exactly as they did in the component.
 *
 * The consequence is checkable by inspection and by driving this module from
 * plain Node: the words below are the same with no wire laid and with the
 * practical finished, on every bench seed, at every slider position, with the
 * key in or out. There is nothing here for a later edit to leak, because there
 * is nothing here to leak from.
 *
 * It is also why there is no `revealed` parameter. A panel that opens up at the
 * end is a panel that was holding something back; this one never held anything.
 *
 * The one drawing is named rather than supplied — `figure: 'ladder'` — because
 * this file is pure data and a component here would drag React into `lib/`. The
 * bench's own `Teach` wrapper hands the staircase in.
 */
const SECTIONS: readonly TeachSection[] = [
  {
    heading: 'What is this bench trying to find out?',
    kind: 'why',
    lead:
      'Whether the potential difference across one metal conductor rises in step with the current through it — ' +
      'V ∝ I — asked several times over, at several different currents, and always before the wire has had time ' +
      'to warm.',
    body: [
      'Push more current through a metal conductor and does the potential difference across it rise in step? ' +
        'Ohm’s law says it does — V ∝ I — but only while the temperature and the other physical conditions stay ' +
        'the same. Everything on this bench is arranged to put that question several times over, at several ' +
        'different currents, and to put it before the wire has had time to warm.',
    ],
  },
  {
    heading: 'Why does the ammeter go in the line?',
    kind: 'why',
    lead:
      'An ammeter counts the charge going past it, so it has to lie in the path the charge takes — and this one ' +
      `is wound to about ${P.rAm} Ω so that being there barely alters the current it is there to measure.`,
    body: [
      'An ammeter counts the charge going past it, so it has to be put in the path — which makes it part of the ' +
        'circuit, and anything added to a circuit changes it. The only way out is to make the change too small to ' +
        `matter: this one is wound to about ${P.rAm} Ω, a small fraction of the smallest thing it sits beside, so ` +
        'dropping it into the loop barely alters the current it is there to measure. A single loop has no junction ' +
        'for the charge to divide at, so the current is the same at every point along it, and it makes no ' +
        'difference where in the loop the ammeter sits.',
    ],
  },
  {
    heading: 'Why does the voltmeter go across?',
    kind: 'why',
    lead:
      'Potential difference is a difference between two points, so a voltmeter has to touch both of them — and ' +
      `this one is wound to about ${P.rVm} Ω so that the road it offers the charge is nearly impassable.`,
    body: [
      'Potential difference is a difference between two points, so a voltmeter has to touch both of them — which ' +
        'means it offers the charge a road it did not have before. Here the way out is the opposite one: make that ' +
        `road nearly impassable. This one is wound to about ${P.rVm} Ω, so it draws well under a thousandth of an ` +
        'ampere and leaves the stretch of circuit it is reading essentially as it found it. Placed across the ' +
        'resistor, the two points it compares are the two ends of that resistor, so what it reports is the ' +
        'potential difference across that — and across nothing else.',
    ],
  },
  {
    heading: 'What if the two meters are exchanged?',
    kind: 'watch',
    lead:
      'Both arguments fail at once — a voltmeter dropped into the loop all but stops the current, and an ammeter ' +
      'laid across a resistor is a short circuit through a delicate instrument.',
    body: [
      'A voltmeter dropped into the loop puts thousands of ohms in series with everything, and the current all but ' +
        'stops. An ammeter laid across a resistor puts a twentieth of an ohm alongside it, and almost all the ' +
        'charge takes that road instead — a short circuit, through a delicate instrument. Neither position is a ' +
        'rule to be memorised: it is the resistance of the instrument that decides where it is allowed to go.',
    ],
  },
  {
    heading: 'Why read the same resistor at several currents?',
    kind: 'how',
    lead: 'One point cannot show that V rises in step with I, so the same resistor has to be read at several currents.',
    body: [
      'One point cannot show that V rises in step with I, so the same resistor has to be read at several currents ' +
        '— and the manual offers two controls for that, either of which may be on the bench.',
    ],
  },
  {
    heading: 'How do the cell taps give four currents?',
    kind: 'how',
    lead:
      'This is the manual’s own method: take the circuit off at a later brass stud and another cell is driving it ' +
      `— ${P.cellEmf} V of push added each time, behind the same unchanged resistor, with no moving part.`,
    body: [
      'The holder carries four dry cells end to end with a brass stud between every pair, at A, B, C, D and E. ' +
        `Take the circuit off at B and one cell drives it, at C two, and so on — ${P.cellEmf} V of push added each ` +
        'time, behind the same unchanged resistor. That is four currents from one piece of apparatus with no ' +
        'moving part. It also carries its own trap: only _one_ stud may hold a lead, because a wire from one stud ' +
        'to another lies straight across the cells between them and short-circuits them.',
    ],
  },
  {
    heading: 'What is the rheostat for, and how is it wired?',
    kind: 'how',
    lead:
      'It is a control rather than a thing being measured: wired through **A and C**, pushing the slider changes ' +
      'how much resistance wire is in the loop, so the current everywhere changes while the resistor under test ' +
      'stays exactly what it is.',
    body: [
      'Between its ends A and B lies resistance wire wound on a tube, and the sliding contact **C** taps that ' +
        'winding part of the way along. Wire the circuit through **A and C** and only the stretch between them is ' +
        'in the loop; push the slider and you change how much wire the charge must struggle through, so the ' +
        'current everywhere in the loop changes while the resistor under test stays exactly what it is. Wire it ' +
        'through A and B instead and the whole coil is always in the circuit; the slider then taps a length of ' +
        'wire leading nowhere, and sliding it changes nothing. A rheostat has to be matched to what it is ' +
        'controlling: one of tens of ohms put in series with a few would swamp them, and the meters would barely ' +
        'leave their stops.',
    ],
  },
  {
    heading: 'How do you check a circuit before switching on?',
    kind: 'how',
    lead:
      'Say it out loud as a sentence — walk from one terminal of the source naming everything you cross until you ' +
      'are back where you began — because a lead you cannot fit into the sentence is going nowhere, and a lead ' +
      'that lets you get home two different ways is a short circuit.',
    body: [
      'A diagram is easier to check if you stop looking at it as a picture and start saying it out loud. Put a ' +
        'finger on one terminal of the source and walk, naming everything you cross, until you are back where you ' +
        'began: _out of the +, through this, through that, in at the −._ If the walk gets round without a choice ' +
        'of turning, the circuit is a single series loop and the same current is in every word of the sentence. If ' +
        'you reach a junction where the path divides, everything after it until the paths meet again is in ' +
        'parallel, and the current divides there too. Anything that does not appear in the sentence at all is not ' +
        'in the loop — which is exactly where a voltmeter belongs, bridged across two points the walk passed ' +
        'between, close enough to the loop to compare them and far enough out of it to leave the current alone. ' +
        'Two habits follow from saying it: a lead you cannot fit into the sentence is a lead going nowhere, and a ' +
        'lead that lets you get home two different ways is a short circuit.',
    ],
  },
  {
    heading: 'Where does the emf go, once round the loop?',
    kind: 'why',
    lead:
      'The whole of it is shared out among the things in the loop, one step down for each, and how big a step ' +
      'each takes is the one current times that element’s own resistance.',
    // The staircase belongs under this paragraph, where it belonged in the
    // component: the prose builds it rung by rung, and the section after this
    // one is about how to read what it draws.
    figure: 'ladder',
    body: [
      'The cells lift every bit of charge by a fixed amount. Taken once round the loop that charge spends all of ' +
        'it and arrives back where it started — the potential difference between a point and itself is zero — so ' +
        'the whole of the emf is shared out among the things in the loop, one step down for each. How big a step ' +
        'each takes follows from the same current passing through all of them: the drop across an element is that ' +
        'current times the element’s own resistance, so the bigger the resistance the bigger its share. One of ' +
        'those steps is inside the battery, which has a small resistance of its own, and that is why what can be ' +
        'measured at the terminals is always a little under the emf, and sags further the more current is drawn.',
    ],
  },
  {
    heading: 'How do you read that staircase?',
    kind: 'why',
    lead:
      'Every step is the same current multiplied by that element’s own resistance, so a voltmeter put across one ' +
      'element is measuring the height of one step — and the ratio of the resistor’s step to the current, the ' +
      'same at every current, is the resistance you are after.',
    body: [
      'Its shape is the whole of Ohm’s law for this circuit in one picture. Every step is the same current ' +
        'multiplied by that element’s own resistance, so the steps are in the same ratio as the resistances and ' +
        'nothing else: the resistor under test takes nearly the whole fall because it is nearly the whole ' +
        'resistance, and the ammeter’s step is invisible because its resistance is. A voltmeter put across one ' +
        'element is measuring the HEIGHT of that one step. Change the control and every step in the picture grows ' +
        'or shrinks together, because the one current runs through all of them — which is why the ratio of the ' +
        'resistor’s step to the current can come out the same at four different currents, and that constant ratio ' +
        'is the resistance you are after.',
    ],
  },
  {
    heading: 'Why does the key come out between readings?',
    kind: 'watch',
    lead:
      'Current heats the coil at I²R watts, and nichrome’s resistance climbs by about ' +
      `${(P.alpha * 100).toFixed(2)}% for every degree it warms, so a wire left carrying current is no longer ` +
      'the wire the law was about.',
    body: [
      'Charge driven through a resistance gives up energy in it, at I²R watts, and that energy comes out as heat. ' +
        'Nichrome does not ignore its own temperature: its resistance climbs by about ' +
        `${(P.alpha * 100).toFixed(2)}% for every degree it warms, so a coil that has been carrying current for a ` +
        'while is genuinely no longer the coil it was cold. Ohm’s law only ever claimed V ∝ I at constant ' +
        'temperature, so the plug key is taken out between readings and the wire is given nothing to heat it with.',
    ],
  },
  {
    heading: 'Why are the wire ends sanded first?',
    kind: 'watch',
    lead:
      'Enamel and oxide sit between the copper and the terminal screw exactly where the current has to cross, ' +
      'adding a resistance that appears nowhere in the circuit diagram and pushes every reading the same way.',
    body: [
      'Copper does not stay bare. New connecting wire carries a thin insulating enamel, and wire that has lain in ' +
        'a drawer grows an oxide film of its own; either one sits between the copper and the terminal screw ' +
        'exactly where the current has to cross. A film like that is a resistance in series with everything — one ' +
        'that appears nowhere in the circuit diagram, is different at every joint, and is different again when a ' +
        'screw is nudged. It does not average out over repeated readings, because it is not random: it pushes ' +
        'every measurement the same way. Rubbing the ends bright and tightening the screws is the cheapest ' +
        'accuracy in the whole experiment, which is why it is step 2 of the procedure and why this bench will not ' +
        'let a wire be laid until it is done.',
    ],
  },
];

/**
 * The panel's contents.
 *
 * It takes no argument, and that is the point: there is no bench state it could
 * be handed, so there is none it could print.
 */
export function ohmsLawTeach(): readonly TeachSection[] {
  return SECTIONS;
}

export type { TeachSection };
