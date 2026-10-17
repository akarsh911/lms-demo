export type AtomCode = 'd' | 'p' | 'c' | 'x' | 'e' | 'a' | 'g' | 'f' | 'l' | 'n' | 'w';

export type RelationType = 'part_of' | 'kind_of' | 'causes' | 'requires' | 'follows' | 'defined_by' | 'contrasts_with';

export type PyqSeed = readonly [year: number, marks: number, question: string];

export interface AtomExtras {
  note?: string;
  pyq?: readonly PyqSeed[];
  ex?: string;
}

export interface AtomSeed {
  label: string;
  code: AtomCode;
  text: string;
  extras: AtomExtras;
}

export interface SubtopicSeed {
  label: string;
  atoms: readonly AtomSeed[];
  note?: string;
}

export interface TopicSeed {
  label: string;
  page: number;
  subs: readonly SubtopicSeed[];
  id?: string;
}

export type RelationSeed = readonly [from: string, type: RelationType, to: string, sentence: string];

export interface ChapterSeed {
  topics: readonly TopicSeed[];
  relations: readonly RelationSeed[];
  folded?: string;
  paraphrased?: string;
}

export const ATOM_TYPES: Readonly<Record<AtomCode, string>> = {
  d: 'definition',
  p: 'process_or_cycle',
  c: 'classification',
  x: 'comparison_pair',
  e: 'cause_effect',
  a: 'application_case',
  g: 'diagram',
  f: 'formula',
  l: 'law_or_principle',
  n: 'numerical_data',
  w: 'worked_example',
};

export const A = (label: string, code: AtomCode, text: string, extras: AtomExtras = {}): AtomSeed => ({
  label,
  code,
  text,
  extras,
});

export const S = (label: string, atoms: readonly AtomSeed[], note?: string): SubtopicSeed => ({ label, atoms, note });

export const T = (label: string, page: number, subs: readonly SubtopicSeed[], id?: string): TopicSeed => ({
  label,
  page,
  subs,
  id,
});
