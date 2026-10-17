import type { TeachSection } from '@labs/components/teach-sections';

import {
  METAL,
  METALS,
  SALT,
  SALT_OF,
  TRUE_ORDER,
  VIS,
  minutesToVisible,
  shouldReact,
  type Metal,
} from './chemistry';

/**
 * The charge each of these four metals carries once it is in solution.
 *
 * It is not in `chemistry.ts` because the bench has no use for it: that module
 * works in millilitres and in colour and never writes a formula down. A charge
 * only matters where an equation has to be balanced, which is here — and
 * aluminium's 3+ against everybody else's 2+ is the whole reason three of the
 * six lines below carry coefficients at all.
 */
const CHARGE: Readonly<Record<Metal, number>> = { Zn: 2, Fe: 2, Cu: 2, Al: 3 };

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

/**
 * Metal atoms in one formula unit of that metal's sulphate.
 *
 * It follows from the charges rather than being typed out: sulphate is 2−, so a
 * 2+ metal needs one of itself per sulphate and Al³⁺ needs two per three. Doing
 * it this way is what keeps the formulae in an equation and the labels on the
 * bottles from ever disagreeing.
 */
const perUnit = (m: Metal): number => lcm(CHARGE[m], 2) / CHARGE[m];

/** A coefficient of one is never written. */
const coef = (x: number): string => (x === 1 ? '' : String(x));

/**
 * One displacement, balanced: `left` dissolving into its own sulphate while
 * `right` is laid down on the strip as metal.
 *
 * The same builder writes both forms of every line. Before the marks are in it
 * is handed a double head and the reader is told plainly that the panel is the
 * thing declining to choose; afterwards it is handed a real arrow. One
 * function, so the redacted line and the answered one cannot drift into two
 * different equations — the same reason the acetic-acid panel writes its
 * carbonate reaction once.
 */
function displacement(left: Metal, right: Metal, arrow: string): string {
  // Electrons exchanged: the first count that both charges divide into.
  const e = lcm(CHARGE[left], CHARGE[right]);
  const takes = SALT[SALT_OF[right]].label;
  const leaves = SALT[SALT_OF[left]].label;
  return (
    `${coef(e / CHARGE[left])}${left} + ${coef(e / CHARGE[right] / perUnit(right))}${takes} ${arrow} ` +
    `${coef(e / CHARGE[left] / perUnit(left))}${leaves} + ${coef(e / CHARGE[right])}${right}`
  );
}

/**
 * The four metals taken two at a time: six pairs.
 *
 * The order of the six, and which metal of a pair is written on the left, are
 * the RACK's own row order and nothing else. Sorting them by reactivity — or
 * putting the metal that wins on the left — would print the conclusion in the
 * shape of the list while the prose was still refusing to say it.
 */
function pairs(): readonly (readonly [Metal, Metal])[] {
  const out: [Metal, Metal][] = [];
  METALS.forEach((metal, i) => {
    METALS.slice(i + 1).forEach((other) => out.push([metal, other]));
  });
  return out;
}

const ASKING: TeachSection = {
  heading: 'What is this bench actually asking?',
  lead:
    'Which metal can push which other metal out of its solution — and the one that gives up its electrons is the ' +
    '**more reactive** of the pair.',
  kind: 'why',
  equations: ['M → Mⁿ⁺ + ne⁻', 'Nⁿ⁺ + ne⁻ → N'],
  body: [
    'Four metals, four of their salts in solution, and one question: **which metal can push which other metal ' +
      'out of its solution?**',
    'A metal atom can only leave the strip by **giving up electrons**, and an ion can only plate out as metal by ' +
      '**taking them**. Those are the two half-reactions above, and between any two metals the exchange can run ' +
      'in one direction or the other — never in both, because the electrons cannot go both ways at once. The ' +
      'metal that gives is the **more reactive** of the pair.',
    'Ordering the four by who displaces whom is the reactivity series, and building that order out of your own ' +
      'sixteen tubes is the whole experiment.',
    'Which of the two directions runs in any particular tube, this panel does not say and cannot say. **The ' +
      'tube says it.** That is what you are watching for.',
  ],
};

/**
 * The six pairs as equations, with the arrows left unpointed.
 *
 * Printing the formulae gives nothing away: every bottle on the bench is
 * labelled with its salt and every strip with its metal, so both halves of
 * every line are already in front of the student. The DIRECTION is another
 * matter entirely — it is what each tube is worth two marks for showing, and
 * the six directions together are the order the conclusion is worth eleven
 * for — so the direction is the one thing this section holds back.
 */
const OPEN: TeachSection = {
  heading: 'Why do these six equations have double arrows?',
  lead:
    'Because the panel is declining to choose a direction, not because the chemistry sits on the fence — between ' +
    'two metals exactly one direction is a reaction at all.',
  kind: 'why',
  equations: pairs().map(([metal, other]) => displacement(metal, other, '⇄')),
  body: [
    'Four metals taken two at a time make **six pairs**, and the rack holds every one of them twice over: the ' +
      'first metal standing in the second’s solution, and the second standing in the first’s. One line covers ' +
      'both tubes of a pair, because those two tubes are the same equation read in opposite directions, and an ' +
      'equation that balances one way balances the other way just as well.',
    'So the six lines below are written out in full with **one thing left out of them** — which way the arrow ' +
      'points. That double head is not an equilibrium. A weak acid genuinely does run both ways at once and ' +
      'settles somewhere in between; this does not. Between two different metals exactly one of the two ' +
      'directions is a reaction at all and the other is impossible, so the double head is this panel declining ' +
      'to choose rather than the chemistry sitting on the fence.',
    'The numbers in front of the formulae come from the charges and from nothing else. Zinc, iron and copper all ' +
      'go into solution as **2+** ions, so one atom of any of them settles exactly one ion of any other and ' +
      'those lines need no coefficients. Aluminium goes as **Al³⁺**, and three and two first meet at six, so ' +
      'every aluminium line is written for six electrons: two aluminium atoms against three of the other metal. ' +
      'The sulphate is in the tube at the start and in the tube at the end, hung on whichever metal happens to ' +
      'be dissolved at the time and altered at no point in between, which is exactly what is meant by a ' +
      '**spectator ion**.',
    'Read any of the lines in whichever direction is the real one and it comes apart into the two ' +
      'half-reactions at the top of this panel. The metal written on that side is handing over electrons and ' +
      'leaving the strip as ions, which is **oxidation**; the ion written beside it is taking those same ' +
      'electrons and settling out as metal, which is **reduction**. Neither half can happen without the other, ' +
      'and both of them happen on the face of the strip, because the strip is the only road the electrons have.',
    'Which of the two is doing the giving is the whole of what **more reactive** means. A metal higher in the ' +
      'series holds its outer electrons loosely and parts with them readily, and its ion, having already parted ' +
      'with them, is correspondingly unwilling to take them back. Turn a line round and you are asking a metal ' +
      'that holds its electrons more tightly to hand them to an ion that is holding on tighter still, and there ' +
      'is nothing in a tube of cold solution that can pay the difference. The reverse of a displacement is not a ' +
      'slow reaction. It is not a reaction.',
    'Which head is the real one, on any of the six, is not written here and cannot be. **The tubes say it**, one ' +
      'comparison at a time, and the six answers together are the order you are being asked to build.',
  ],
};

const DECIDES: TeachSection = {
  heading: 'Why might a tube show nothing at all?',
  lead:
    'Three reasons: the pairing has nothing to displace, the strip went in with its oxide skin still on, or the ' +
    'tray was read before the slow pairs had time.',
  kind: 'watch',
  body: [
    '**The pairing.** A strip standing in a solution of its own salt has nothing to displace: its atoms dissolve ' +
      'and its ions plate out at exactly the same rate, so nothing in the tube changes. Four of the sixteen are ' +
      'like that, and they are the controls — they are not wasted tubes, they are the ones that show you what ' +
      '"no change" looks like.',
    '**The surface.** Metal left in air grows a thin, tough skin of its own oxide, and a solution that meets ' +
      'that skin never reaches the metal beneath. Sandpaper takes it off. A strip that goes in uncleaned may ' +
      'react slowly, or for some metals not at all — and **a reaction that was hidden looks exactly like a ' +
      'reaction that never happened.**',
    '**The clock.** None of these is instant. Some pairs show inside a couple of minutes; the slowest take the ' +
      'better part of a quarter of an hour. Reading the tray too early is the commonest way there is of getting ' +
      'the order wrong, which is what the lab clock is for.',
  ],
};

const LOOK: TeachSection = {
  heading: 'Where in the tube should I be looking?',
  lead:
    'At the colour of the solution and at the face of the strip — they are one event, so a tube shows **both or ' +
    'neither**, and the deposit shows first.',
  kind: 'how',
  body: [
    'A solution takes its colour from the **ions dissolved in it**: Cu²⁺ is blue, Fe²⁺ is pale green, and Zn²⁺ ' +
      'and Al³⁺ are both colourless. If one salt is turning into another, the colour has to move from the first ' +
      'towards the second — and it **drifts**, it does not switch, because what you are looking at is the two ' +
      'salts blended in whatever proportion is actually left.',
    'On the strip, metal plating out is the other half of the same exchange: copper settles **reddish-brown**, ' +
      'zinc and iron **grey-black**. The two halves are one event, so a tube shows **both or neither** — a ' +
      'deposit with no colour change, or the reverse, is worth a second look.',
    'The deposit is the earlier of the two signs. A little of it is visible long before enough of the solution ' +
      'has been converted for the colour to have plainly moved, so a tube that looks unchanged in the liquid may ' +
      'not be unchanged on the metal.',
  ],
};

const HELD_BACK: TeachSection = {
  heading: 'What will this panel not tell you?',
  lead:
    'Which way the exchange ran in any tube — every one of the sixteen gets this same page, whatever is in it.',
  kind: 'how',
  body: [
    'Every one of the sixteen tubes gets this same page. It reads the same for zinc in copper sulphate as for ' +
      'copper in zinc sulphate — which is exactly the pair where the answer differs — and the same again ' +
      'whatever the clock says and whether or not a strip was sandpapered. **The equations are written that way ' +
      'on purpose**: one line serves both tubes of a pair, and it would be the very same line if the answer ' +
      'were the other way about.',
    'That is deliberate. Which way the exchange ran in a tube is the **observation**, and the order you build ' +
      'from sixteen of them is the **conclusion**. Both are the marks. Reading a tube’s progress off a panel is ' +
      'not observing it.',
  ],
};

/** Every mixed pair, read out of the rate table rather than typed. */
function pairRows(): readonly (readonly string[])[] {
  const rows: string[][] = [];
  for (const metal of METALS) {
    for (const other of METALS) {
      if (other === metal) continue;
      const salt = SALT_OF[other];
      const minutes = minutesToVisible(metal, salt);
      rows.push([
        `${METAL[metal].name} strip`,
        SALT[salt].label,
        shouldReact(metal, salt) ? 'displaces it' : 'no reaction',
        minutes === null ? '—' : `about ${Math.round(minutes)} min`,
      ]);
    }
  }
  return rows;
}

const order = (list: readonly Metal[]): string => list.map((m) => METAL[m].name).join(' > ');

/** The books, opened once the practical is over and nothing is left to mark. */
const TRUTH: TeachSection = {
  heading: 'Your table is in — what is the order?',
  lead:
    `**${order(TRUE_ORDER)}**, most reactive first — and a strip displaces exactly those metals standing below ` +
    'it in that order.',
  kind: 'after',
  body: [
    `Your marks are recorded, so the answer can be printed. The order is **${order(TRUE_ORDER)}** — most reactive ` +
      'first — and every row below was read out of the same rate table the bench ran the tubes on, not typed out ' +
      'beside it.',
    `A strip displaces exactly those metals that stand **below** it in that order, which is why the ` +
      `${METAL[TRUE_ORDER[0] ?? 'Al'].name} strip has three tubes that change and the ` +
      `${METAL[TRUE_ORDER[3] ?? 'Cu'].name} strip has none. Twelve mixed pairs, six of them reacting and six of ` +
      'them not, is what makes the order recoverable from the tray: every pair is a single comparison, and the ' +
      'twelve together admit only one ranking.',
    `The last column is why patience mattered. The bench calls a deposit visible once ${Math.round(
      VIS.deposit * 100,
    )}% of the solution has been converted and a colour change sure at ${Math.round(
      VIS.colourSure * 100,
    )}%, and those are the same numbers your table was marked against — so a slow pair read at five minutes is a ` +
      'real reaction recorded as none.',
  ],
  table: {
    caption: 'The twelve mixed pairs, with a cleaned strip',
    columns: ['Strip', 'Solution', 'What it does', 'Deposit visible after'],
    rows: pairRows(),
  },
};

/**
 * The same six lines with the arrows pointed, which is why it follows the
 * opened books rather than sitting where the unpointed ones sat: the direction
 * IS the answer, so it belongs after the sentence that says the marks are in.
 */
const POINTED: TeachSection = {
  heading: 'Which way does each of the six really run?',
  lead:
    'The way it is written below, with the metal standing higher in the order on the left — and there is no other ' +
    'arrangement of four metals that satisfies all six at once.',
  kind: 'after',
  equations: pairs().map(([metal, other]) =>
    TRUE_ORDER.indexOf(metal) < TRUE_ORDER.indexOf(other)
      ? displacement(metal, other, '→')
      : displacement(other, metal, '→'),
  ),
  body: [
    'Here are the six pairs again with the heads taken off them. Each line now runs the way it really runs, and ' +
      'the metal written on the left of a line is the one standing higher in the order above — so these six ' +
      'lines are the reactivity series set out one comparison at a time, and there is no arrangement of four ' +
      'metals other than that one which satisfies all six at once.',
    'The electron accounting is identical in every one of them. The metal on the left dissolves, giving up two ' +
      'electrons an atom — three, for aluminium — and is **oxidised**; the ion beside it takes those electrons, ' +
      'is **reduced**, and settles on the strip as metal. The sulphate does nothing throughout, and that is ' +
      'precisely why the liquid changes colour: what a solution’s colour follows is the metal ion dissolved in ' +
      'it, and the metal ion is the thing that has just been swapped.',
    'Turn any of the six round and you have an equation that is balanced, tidy and false. It is not that those ' +
      'reverses are too slow to catch in one lesson or that something was missing from the tube; the reverse of ' +
      'a displacement asks a metal that holds its electrons tightly to hand them to an ion that holds them ' +
      'tighter still, and nothing about a cold sulphate solution can pay that difference. It is also why a metal ' +
      'in a solution of its own salt is a fair control: there the two directions are the same direction, atoms ' +
      'leave the strip exactly as fast as ions plate back onto it, and the tube has nowhere to go.',
  ],
};

/**
 * The panel's contents.
 *
 * @param revealed true once the practical is finished and the marks are settled.
 */
export function reactivityTeach(revealed: boolean): readonly TeachSection[] {
  return revealed
    ? [ASKING, DECIDES, LOOK, TRUTH, POINTED]
    : [ASKING, OPEN, DECIDES, LOOK, HELD_BACK];
}

export type { TeachSection };
