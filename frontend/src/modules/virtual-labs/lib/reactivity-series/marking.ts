import type { ColourCode, DepositCode } from './chemistry';

/**
 * The procedure, the marks and the viva.
 *
 * Every part carries the rule it was marked by, and that rule travels with the
 * attempt record, so a teacher can audit a grade without reading this code.
 */

export const STAGE = {
  fill: 0,
  metals: 1,
  watch: 2,
  record: 3,
  conclude: 4,
  viva: 5,
} as const;

export interface ProcedureStep {
  title: string;
  prompt: string;
}

export const STEPS: readonly ProcedureStep[] = [
  { title: 'Pour the solutions', prompt: '5 mL of each solution into its four tubes' },
  { title: 'Add the metal strips', prompt: 'Clean with sandpaper, then one strip per tube' },
  { title: 'Wait and watch', prompt: 'Check the tubes every few minutes' },
  { title: 'Record observations', prompt: 'What each tube actually shows' },
  { title: 'Conclude', prompt: 'Arrange the metals by reactivity' },
  { title: 'Viva voce', prompt: 'Five questions' },
];

export type PartKey = 'setup' | 'metals' | 'observe' | 'conclude' | 'viva';

export const PART_KEYS: readonly PartKey[] = ['setup', 'metals', 'observe', 'conclude', 'viva'];

export const MAX: Readonly<Record<PartKey, number>> = {
  setup: 12,
  metals: 14,
  observe: 32,
  conclude: 22,
  viva: 20,
};

export const PART_NAMES: Readonly<Record<PartKey, string>> = {
  setup: 'Solutions',
  metals: 'Metal strips',
  observe: 'Observations (16 tubes)',
  conclude: 'Conclusion',
  viva: 'Viva voce',
};

/** Kept word for word from the standalone bench: the marks mean what they said. */
export const BASIS: Readonly<Record<PartKey, string>> = {
  setup: '12 − 3 for each tube filled with the wrong solution',
  metals:
    '2 per metal cleaned with sandpaper before its first strip went in, plus 6 − 1.5 per wrong strip',
  observe:
    '2 per tube, marked against what that tube showed when you submitted: 1 for change/no change, 1 for the colour and deposit',
  conclude: '11 if your order follows from your own observations, 11 if it is the true order Al > Zn > Fe > Cu',
  viva: '4 per question, first answer counts',
};

/** Marks lost per slip, so the reducer and the log agree on one number. */
export const PENALTY = { contaminated: 3, wrongStrip: 1.5 } as const;
export const CLEAN_POINTS = 2;
export const STRIP_POINTS = 6;
export const CONCLUDE_HALF = 11;
export const VIVA_POINTS = 4;

/** The reactions are slow; below this the assistant asks whether you are sure. */
export const PATIENT_MINUTES = 15;

export const COLOUR_OPTS: readonly { value: ColourCode; label: string }[] = [
  { value: 'none', label: 'No change' },
  { value: 'b2c', label: 'Blue → colourless' },
  { value: 'b2g', label: 'Blue → pale green' },
  { value: 'g2c', label: 'Pale green → colourless' },
];

export const DEPOSIT_OPTS: readonly { value: DepositCode; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'rb', label: 'Reddish-brown' },
  { value: 'gb', label: 'Grey-black' },
];

/** Table-sized descriptions, for a cell 60px wide. */
export const C_SHORT: Readonly<Record<ColourCode, string>> = {
  none: 'no colour change',
  b2c: 'blue → colourless',
  b2g: 'blue → pale green',
  g2c: 'green → colourless',
};

export const D_SHORT: Readonly<Record<DepositCode, string>> = {
  none: '',
  rb: 'reddish-brown deposit',
  gb: 'grey-black deposit',
};

/** One tube in words: what a student wrote, or what the tube actually showed. */
export function describe(o: { c?: ColourCode | ''; cMaybe?: ColourCode | null; d?: DepositCode | '' } | null | undefined): string {
  if (!o || !o.c || !o.d) return o && (o.c || o.d) ? '…' : '—';
  if (o.c === 'none' && o.d === 'none' && !o.cMaybe) return 'No change';
  return (
    [
      o.c !== 'none' ? C_SHORT[o.c] : o.cMaybe ? `${C_SHORT[o.cMaybe]} (just starting)` : '',
      D_SHORT[o.d],
    ]
      .filter(Boolean)
      .join(', ') || 'No change'
  );
}

export interface VivaQuestion {
  q: string;
  a: number;
  o: readonly string[];
  why: string;
  textbookQuery: string;
}

export const VIVA: readonly VivaQuestion[] = [
  {
    q: 'Why are the metal strips rubbed with sandpaper before use?',
    a: 1,
    o: [
      'To make them shiny so the colours are easier to see',
      'To remove the oxide layer, so the metal itself touches the solution',
      'To make them thinner so they react faster',
      'To weigh them accurately',
    ],
    why: 'Metals like aluminium carry a thin, tough oxide layer. Until it is rubbed off, the solution cannot reach the metal — an uncleaned aluminium strip can show no reaction at all.',
    textbookQuery: 'metals react with oxygen to form oxide layer on the surface aluminium oxide',
  },
  {
    q: 'A zinc strip is placed in copper sulphate solution. Why does the blue colour fade?',
    a: 2,
    o: [
      'Zinc absorbs the blue colour',
      'The solution evaporates',
      'Zinc displaces copper, forming colourless zinc sulphate',
      'Copper displaces zinc',
    ],
    why: 'Zn + CuSO₄ → ZnSO₄ + Cu. The blue copper ions are replaced by colourless zinc ions, and copper is deposited as a reddish-brown layer.',
    textbookQuery: 'zinc displaces copper from copper sulphate solution displacement reaction',
  },
  {
    q: 'Copper showed no change in any of the four solutions. This means copper is…',
    a: 0,
    o: [
      'the least reactive of the four metals',
      'the most reactive of the four metals',
      'not a metal',
      'reacting too slowly to measure',
    ],
    why: 'Copper cannot displace zinc, iron or aluminium from their salts, so it is below all three in the reactivity series.',
    textbookQuery: 'reactivity series arrangement of metals in decreasing order of reactivity',
  },
  {
    q: 'An iron strip is placed in copper sulphate. The solution turns pale green because…',
    a: 3,
    o: [
      'copper sulphate turns green on standing',
      'iron rusts in water',
      'copper is dissolving',
      'iron(II) sulphate is formed',
    ],
    why: 'Fe + CuSO₄ → FeSO₄ + Cu. Iron(II) sulphate solution is pale green.',
    textbookQuery: 'iron nail copper sulphate solution turns green iron sulphate',
  },
  {
    q: 'Which of these is a displacement reaction?',
    a: 1,
    o: [
      'CaO + H₂O → Ca(OH)₂',
      'Fe + CuSO₄ → FeSO₄ + Cu',
      '2FeSO₄ → Fe₂O₃ + SO₂ + SO₃',
      'Na₂SO₄ + BaCl₂ → BaSO₄ + 2NaCl',
    ],
    why: 'A more reactive element (iron) takes the place of a less reactive one (copper) in a compound. The others are combination, decomposition and double displacement.',
    textbookQuery: 'displacement reaction more reactive element displaces less reactive element',
  },
];

/** What the Aim and Theory card grounds itself on in the NCERT chapter. */
export const THEORY_QUERY =
  'a more reactive metal displaces a less reactive metal from its salt solution reactivity series';
