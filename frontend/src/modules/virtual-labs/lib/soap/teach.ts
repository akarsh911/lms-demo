import type { TeachSection } from '@labs/components/teach-sections';

import { LEAST_COUNT } from './chemistry';

const ALWAYS: readonly TeachSection[] = [
  {
    heading: 'What is soap, molecule by molecule?',
    lead:
      'The **sodium salt of a long-chain fatty acid**: an oily tail that will not mix with water, and a –COO⁻ ' +
      'head that dissolves happily.',
    kind: 'why',
    equations: ['C₁₇H₃₅COONa — sodium stearate'],
    body: [
      'Soap is the **sodium salt of a long-chain fatty acid**. One end of the molecule is a long oily hydrocarbon ' +
        'tail that will not mix with water; the other is the **–COO⁻** head with its Na⁺ beside it, which ' +
        'dissolves happily.',
      'That split personality is the whole of cleaning. The tails bury themselves in grease and the heads stay out ' +
        'in the water, so the dirt ends up wrapped in a ball of soap molecules — a **micelle** — that the rinse ' +
        'can carry away with it.',
      'It is also why soap foams. A soap molecule sitting in the skin of a bubble, tail out of the water and head ' +
        'in it, is what holds that skin together. **Lather is soap that is still dissolved.**',
    ],
  },
  {
    heading: 'What is hard water actually carrying?',
    lead:
      'Dissolved **calcium and magnesium salts** picked up from the rock the water ran over — and they are ' +
      'invisible, so hard water looks exactly like distilled.',
    kind: 'why',
    equations: ['Ca(HCO₃)₂ —boil→ CaCO₃↓ + H₂O + CO₂'],
    body: [
      'Hard water carries dissolved **calcium and magnesium salts**, picked up from the rock the water ran over — ' +
        'bicarbonates, chlorides and sulphates. They are invisible. Hard water looks exactly like distilled water ' +
        'in a tube, which is the reason this experiment has to be done rather than looked at.',
      'Distilled water has been boiled and condensed, so nothing dissolved came across with it: **no Ca²⁺, no ' +
        'Mg²⁺**, and nothing in it for soap to react with.',
      'Boiling breaks the bicarbonates down and the chalk can then be filtered off, which removes the ' +
        '**temporary** hardness. Chloride and sulphate hardness is **permanent** — boiling does nothing whatever ' +
        'to it — so boiled hard water is softer than it was without being as soft as distilled.',
    ],
  },
  {
    heading: 'What happens when soap meets those ions?',
    lead:
      'Ca²⁺ and Mg²⁺ **swap in for the sodium**, and their stearates will not dissolve, so the soap is thrown ' +
      'back out as an insoluble white **scum**.',
    kind: 'why',
    equations: ['2C₁₇H₃₅COONa + Ca²⁺ → (C₁₇H₃₅COO)₂Ca↓ + 2Na⁺'],
    body: [
      'Put soap into water carrying Ca²⁺ or Mg²⁺ and those ions **swap in for the sodium**. Sodium stearate ' +
        'dissolves; calcium and magnesium stearate do not. The soap is thrown straight back out of solution as an ' +
        'insoluble, white, curdy solid — the **scum**.',
      'That soap is then gone. It is no longer in solution, so it can neither clean nor hold up a bubble: **every ' +
        'ion present takes its share of the soap out of play before any lather can form at all.**',
    ],
  },
  {
    heading: 'Why must the two tubes be treated identically?',
    lead:
      'Because only the soap **still dissolved** can lather, and both the shaking and the soap saturate — change ' +
      'two things at once and a difference in froth says nothing about the water.',
    kind: 'watch',
    body: [
      'Only the soap **still dissolved once the ions are used up** can foam. Shaking is what turns that leftover ' +
        'soap into froth: it drags air down into the liquid, and the dissolved soap wraps each pocket of air in a ' +
        'skin strong enough to stand.',
      'Both of those saturate. Past a point more shaking mixes in nothing new, and past a concentration the ' +
        'column will not stand any taller however much soap is added. That is exactly why the two tubes must be ' +
        'given the **same volume of water, the same soap and the same shaking**: change two things at once and a ' +
        'difference in froth says nothing at all about the water.',
      'Four facts, then: soap is a sodium salt, those ions replace the sodium, the replacement will not dissolve, ' +
        'and only dissolved soap lathers. What follows from them — which water lathers sooner, and why — is the ' +
        'conclusion you are asked for, so **this panel stops one step short of it.**',
    ],
  },
  {
    heading: 'Where do I look, and where is zero?',
    lead:
      'White curdy specks in the water and a domed head of froth above it — read from the **zero at the water ' +
      'line** to the **top of the froth**.',
    kind: 'how',
    body: [
      '**In the water.** A precipitate shows as white curdy specks: some drifting, some clinging to the glass, ' +
        'some settled on the bottom. Give it a moment to settle before deciding.',
      `**Above the water.** Froth stands as a domed head of bubbles. Pick up the scale, tap the tube, and read ` +
        `from the **zero at the water line** to the **top of the froth** — not to the scummy layer down in the ` +
        `water. Each small division is ${LEAST_COUNT.toFixed(1)} cm.`,
      'Use the close-up for the reading. The bench view is too small for millimetres, and a millimetre is exactly ' +
        'what the marks are given to.',
    ],
  },
  {
    heading: 'What will this panel not tell you?',
    lead:
      'No froth height, no verdict on scum, no count of drops and no conclusion — those four things are the marks.',
    kind: 'how',
    body: [
      'It will not give you a froth height in centimetres, it will not say whether a tube showed scum, it will ' +
        'not tell you how many drops the extension takes, and it will not draw the conclusion. Those four things ' +
        'are the marks.',
      'Go and look at the tube.',
    ],
  },
];

/** The books, opened once the practical is over and nothing is left to mark. */
const TRUTH: readonly TeachSection[] = [
  {
    heading: 'Your table is in — why does hard water cost more?',
    lead:
      'Every ion in it has to be satisfied with soap before the next drop is free to lather, so the soap that ' +
      'went into the scum is soap the wash never had.',
    kind: 'after',
    body: [
      'Your marks are recorded, so the step this panel was stopping short of can be taken. Water carrying those ' +
        'ions has to be given enough soap to satisfy **every one of them** before the next drop is free to ' +
        'lather. So the same washing costs far more soap in hard water, and the soap that was spent went into ' +
        'the scum rather than into the wash — wasteful twice over, and it leaves a ring on the basin besides.',
      'That is also what the extension measures. Keep adding soap and the ions are precipitated one by one; once ' +
        'the last of them has gone, the very next drop stays in solution and hard water lathers like any other. ' +
        'The number of drops it took is therefore a measure of the **hardness itself**, which is how water ' +
        'hardness was measured for a century — by titrating it against soap until a lather stood.',
    ],
  },
  {
    heading: 'Why did detergents replace soap?',
    lead:
      'A detergent’s head is a **sulphonate**, and calcium and magnesium sulphonates _are_ soluble — so nothing ' +
      'is thrown out of solution and no scum forms.',
    kind: 'after',
    body: [
      'A detergent is built the same way — an oily tail and a water-loving head — but the head is a **sulphonate** ' +
        'rather than a carboxylate, and the calcium and magnesium salts of a sulphonate **are** soluble.',
      'Nothing is thrown out of solution, so a detergent lathers and cleans in hard water exactly as it does in ' +
        'soft, and leaves no scum on the basin. That single difference is why detergents took over the laundry, ' +
        'and it is a direct consequence of the swap you have just watched soap lose.',
    ],
  },
];

/**
 * The panel's contents.
 *
 * @param revealed true once the practical is finished and the marks are settled.
 */
export function soapTeach(revealed: boolean): readonly TeachSection[] {
  return revealed ? [...ALWAYS.slice(0, -1), ...TRUTH] : ALWAYS;
}

export type { TeachSection };
