/**
 * The biology.
 *
 * Six kinds of prepared slide: three organisms caught reproducing, and the same
 * three organisms doing nothing at all. The plain ones are not padding — a
 * slide with no bud on it is not a budding slide, and saying so is as much a
 * part of the practical as spotting the ones that did.
 *
 * Every slide is described by its anatomical PARTS, so the figure the renderer
 * puts on the screen and the structure the marking calls true are the same
 * object: pointer 2 sits on the constriction because the constriction is there.
 */

/** What the student may name an organism as. Three of these are distractors. */
export const ORGANISMS = ['Amoeba', 'Yeast', 'Hydra', 'Paramecium', 'Spirogyra', 'Planaria'] as const;
export type Organism = (typeof ORGANISMS)[number];

/** What the student may name the process as. Three of these are distractors. */
export const PROCESSES = [
  'binary fission',
  'budding',
  'fragmentation',
  'spore formation',
  'multiple fission',
  'not dividing',
] as const;
export type Process = (typeof PROCESSES)[number];

/** What was in the field, in the words the record book uses. */
export const FEATURES = [
  { id: 'constrict', text: 'one cell constricting into two equal halves' },
  { id: 'onecell', text: 'a single cell with one nucleus, not dividing' },
  { id: 'budcell', text: 'a small outgrowth on a larger cell' },
  { id: 'plaincells', text: 'oval cells with no outgrowths' },
  { id: 'minihydra', text: 'a miniature animal growing from the body wall' },
  { id: 'plainhydra', text: 'a cylindrical body with tentacles and no outgrowth' },
] as const;

export type FeatureId = (typeof FEATURES)[number]['id'];

export const FEATURE_TEXT: Readonly<Record<FeatureId, string>> = Object.fromEntries(
  FEATURES.map((f) => [f.id, f.text]),
) as Record<FeatureId, string>;

export type SpecimenId =
  | 'amoeba-fission'
  | 'amoeba-plain'
  | 'yeast-budding'
  | 'yeast-plain'
  | 'hydra-budding'
  | 'hydra-plain';

/** One numbered pointer on the magnified view, and the structure it sits on. */
export interface Pin {
  part: string;
  /** Where the pointer touches the specimen, in the specimen's own units. */
  x: number;
  y: number;
  /** Where its numbered disc sits. */
  lx: number;
  ly: number;
}

export interface Specimen {
  id: SpecimenId;
  organism: Organism;
  process: Process;
  feature: FeatureId;
  /** Which figure to draw. */
  kind: 'amoeba' | 'yeast' | 'hydra';
  /** Is anything reproducing on this slide? */
  dividing: boolean;
  /** Radius of the specimen on the slide, in mm — how easily it fills a field. */
  rS: number;
  title: string;
  /** The three pointers to name, in order. */
  pins: readonly [Pin, Pin, Pin];
  /** What each pointer may be named as: the real structures, plus decoys. */
  opts: readonly string[];
}

export const SPECIMENS: readonly Specimen[] = [
  {
    id: 'amoeba-fission',
    organism: 'Amoeba',
    process: 'binary fission',
    feature: 'constrict',
    kind: 'amoeba',
    dividing: true,
    rS: 0.22,
    title: 'Amoeba in binary fission',
    pins: [
      { part: 'nucleus', x: 13, y: 0, lx: 27, ly: -25 },
      { part: 'constriction', x: 0, y: -4.5, lx: -3, ly: -28 },
      { part: 'pseudopodium', x: -26, y: 0, lx: -36, ly: -19 },
    ],
    opts: ['nucleus', 'constriction', 'pseudopodium', 'bud', 'contractile vacuole', 'cell wall'],
  },
  {
    id: 'amoeba-plain',
    organism: 'Amoeba',
    process: 'not dividing',
    feature: 'onecell',
    kind: 'amoeba',
    dividing: false,
    rS: 0.22,
    title: 'Amoeba, not dividing',
    pins: [
      { part: 'nucleus', x: 3, y: -3, lx: 8, ly: -26 },
      { part: 'contractile vacuole', x: -8, y: 8, lx: -28, ly: 23 },
      { part: 'pseudopodium', x: 17, y: 6, lx: 36, ly: 6 },
    ],
    opts: ['nucleus', 'contractile vacuole', 'pseudopodium', 'constriction', 'bud', 'cell wall'],
  },
  {
    id: 'yeast-budding',
    organism: 'Yeast',
    process: 'budding',
    feature: 'budcell',
    kind: 'yeast',
    dividing: true,
    rS: 0.2,
    title: 'Yeast with buds',
    pins: [
      { part: 'parent cell', x: -8, y: -2, lx: -28, ly: -20 },
      { part: 'bud', x: -1.5, y: -6, lx: 9, ly: -26 },
      { part: 'bud scar', x: -20.5, y: 10, lx: -33, ly: 23 },
    ],
    opts: ['parent cell', 'bud', 'bud scar', 'chain of buds', 'constriction', 'pseudopodium'],
  },
  {
    id: 'yeast-plain',
    organism: 'Yeast',
    process: 'not dividing',
    feature: 'plaincells',
    kind: 'yeast',
    dividing: false,
    rS: 0.2,
    title: 'Yeast, no buds',
    pins: [
      { part: 'cell wall', x: 9.5, y: -11, lx: 24, ly: -24 },
      { part: 'nucleus', x: -8, y: 5, lx: -30, ly: 14 },
      { part: 'cytoplasm', x: 0, y: 14, lx: 4, ly: 30 },
    ],
    opts: ['cell wall', 'nucleus', 'cytoplasm', 'bud', 'bud scar', 'constriction'],
  },
  {
    id: 'hydra-budding',
    organism: 'Hydra',
    process: 'budding',
    feature: 'minihydra',
    kind: 'hydra',
    dividing: true,
    rS: 0.34,
    title: 'Hydra with a bud',
    pins: [
      { part: 'tentacle', x: -8, y: -48, lx: -26, ly: -62 },
      { part: 'hypostome', x: 0, y: -26, lx: 20, ly: -42 },
      { part: 'bud', x: 21.2, y: 18.3, lx: 49, ly: 34 },
    ],
    opts: ['tentacle', 'hypostome', 'bud', 'basal disc', 'constriction', 'pseudopodium'],
  },
  {
    id: 'hydra-plain',
    organism: 'Hydra',
    process: 'not dividing',
    feature: 'plainhydra',
    kind: 'hydra',
    dividing: false,
    rS: 0.34,
    title: 'Hydra, no bud',
    pins: [
      { part: 'tentacle', x: -8, y: -48, lx: -26, ly: -62 },
      { part: 'hypostome', x: 0, y: -26, lx: 20, ly: -42 },
      { part: 'basal disc', x: 0, y: 29, lx: 22, ly: 44 },
    ],
    opts: ['tentacle', 'hypostome', 'basal disc', 'bud', 'constriction', 'pseudopodium'],
  },
];

export const SPECIMEN_BY_ID: Readonly<Record<SpecimenId, Specimen>> = Object.fromEntries(
  SPECIMENS.map((s) => [s.id, s]),
) as Record<SpecimenId, Specimen>;

/** The three slides that carry something reproducing. */
export const DIVIDING_IDS: readonly SpecimenId[] = SPECIMENS.filter((s) => s.dividing).map((s) => s.id);
/** The three that carry the same organism doing nothing. */
export const PLAIN_IDS: readonly SpecimenId[] = SPECIMENS.filter((s) => !s.dividing).map((s) => s.id);

/** How many pointers every slide carries. The marks per slide follow from it. */
export const PINS_PER_SLIDE = 3;
