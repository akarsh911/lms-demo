import type { MasteryMap, MasteryResponse, MasteryState } from '@/types/mastery';
import { READ_STATE, raise } from '@/types/mastery';
import type {
  ChaptersResponse,
  CurriculumMindmap,
  CurriculumMindmapSection,
  CurriculumMindmapsResponse,
  Drill,
  DrillItem,
  DrillGrade,
  DrillGradeRequest,
  DrillKind,
  DrillResult,
  MapEdge,
  MapNeighbour,
  MapNode,
  MapNodeDetail,
  MapPosition,
  MapSource,
  MindMapCitation,
  MindMapResponse,
  MindmapBook,
  MindmapBooksPage,
  TracePath,
} from '@/types/mindmap';

import { CONTENT_ITEMS, CURRICULUM_NODES } from './data/library';
import { CHEMICAL_REACTIONS } from './data/mindmap-chemical-reactions';
import { CONTROL_AND_COORDINATION } from './data/mindmap-control';
import { LIFE_PROCESSES } from './data/mindmap-life-processes';
import { LIGHT } from './data/mindmap-light';
import { ATOM_TYPES, type AtomCode, type AtomSeed, type ChapterSeed, type TopicSeed } from './data/mindmap-seed';
import { capabilities, identity } from './identity';
import { seedId } from './ids';
import { fail, notFound } from './rows';

/**
 * Dev-bypass fixtures for mind maps, as emerge-core serves them under
 * `learning/mindmaps`. Mind maps are wired for real mode, through emerge-core;
 * these are here so the bypass still demonstrates the whole flow with nothing
 * else up. The flashcard engine's fixtures live in `./flashcards`.
 *
 * They are modelled on the engines' real contracts rather than invented, and the
 * properties the UI is built to respect are all represented on purpose:
 *
 *   - containment reaches every atom. Unlike the real corpus, where 55% of atoms
 *     carry no typed relation, these chapters are densely cross-linked so a
 *     trace has far apart concepts to connect; a canvas that spines on relations
 *     would still look correct here, so check one against a real engine.
 *   - atoms asked in a past paper have examinability `observed:pyq` and the rest
 *     are priors, so the solid-versus-dotted distinction has something to show.
 *   - one atom has `match_ratio` below 1.0, so the "close paraphrase" warning is
 *     exercised rather than dead code.
 */

// --------------------------------------------------------------- the fixture chapter

const DOC = 'doc_dev_science_10';
const BOOK_TITLE = 'NCERT Science, Class 10';
const TEXTBOOK_TITLE = 'Science Textbook, Class 10';
const EXEMPLAR_TITLE = 'Science Exemplar Problems, Class 10';
const ROOT_SECTION = 'sec_dev_science_10';
const SECTION = 'sec_dev_life_processes';
const NUTRITION_SECTION = 'sec_dev_nutrition';
const CONTROL_SECTION = 'sec_dev_control';
const LIGHT_SECTION = 'sec_dev_light';
const REACTIONS_SECTION = 'sec_dev_chemical_reactions';

interface SectionSeed {
  id: string;
  parentId: string | null;
  title: string;
  number: string;
  order: number;
  pages: [number, number] | null;
}

interface ChapterVoices {
  teacher: string;
  taught: string;
  notesTitle: string;
  notesAuthor: string;
}

interface MapSeed {
  sectionId: string;
  chapter: ChapterSeed;
  voices: ChapterVoices;
  span?: readonly [first: string, last: string];
}

const LIFE_PROCESSES_VOICES: ChapterVoices = {
  teacher: 'Diya Das',
  taught: '2026-07-21',
  notesTitle: 'Life Processes, chapter notes',
  notesAuthor: 'A. Das',
};

const NUTRITION_SPAN = ['Nutrition and Energy Sources', 'Human Digestion'] as const;

const MAP_SEEDS: MapSeed[] = [
  { sectionId: SECTION, chapter: LIFE_PROCESSES, voices: LIFE_PROCESSES_VOICES },
  { sectionId: NUTRITION_SECTION, chapter: LIFE_PROCESSES, voices: LIFE_PROCESSES_VOICES, span: NUTRITION_SPAN },
  {
    sectionId: CONTROL_SECTION,
    chapter: CONTROL_AND_COORDINATION,
    voices: { teacher: 'Diya Das', taught: '2026-08-19', notesTitle: 'Control and Coordination, class notes', notesAuthor: 'Diya Das' },
  },
  {
    sectionId: LIGHT_SECTION,
    chapter: LIGHT,
    voices: { teacher: 'Diya Das', taught: '2026-09-03', notesTitle: 'Light: Reflection and Refraction, notes', notesAuthor: 'S. Menon' },
  },
  {
    sectionId: REACTIONS_SECTION,
    chapter: CHEMICAL_REACTIONS,
    voices: { teacher: 'Diya Das', taught: '2026-04-15', notesTitle: 'Chemical Reactions, chapter notes', notesAuthor: 'S. Menon' },
  },
];

const topicsOf = (seed: MapSeed): readonly TopicSeed[] => {
  if (!seed.span) return seed.chapter.topics;
  const labels = seed.chapter.topics.map((topic) => topic.label);
  return seed.chapter.topics.slice(labels.indexOf(seed.span[0]), labels.indexOf(seed.span[1]) + 1);
};

const pageSpan = (topics: readonly TopicSeed[]): [number, number] => {
  const pages = topics.map((topic) => topic.page);
  return [Math.min(...pages), Math.max(...pages)];
};

const seedOf = (sectionId: string): MapSeed => MAP_SEEDS.find((seed) => seed.sectionId === sectionId)!;

const SECTIONS: SectionSeed[] = [
  { id: ROOT_SECTION, parentId: null, title: BOOK_TITLE, number: '', order: 0, pages: null },
  {
    id: REACTIONS_SECTION,
    parentId: ROOT_SECTION,
    title: 'Chemical Reactions and Equations',
    number: '1',
    order: 1,
    pages: [1, 14],
  },
  {
    id: SECTION,
    parentId: ROOT_SECTION,
    title: 'Life Processes',
    number: '6',
    order: 2,
    pages: [93, 110],
  },
  {
    id: NUTRITION_SECTION,
    parentId: SECTION,
    title: 'Nutrition',
    number: '6.1',
    order: 3,
    pages: pageSpan(topicsOf(seedOf(NUTRITION_SECTION))),
  },
  {
    id: CONTROL_SECTION,
    parentId: ROOT_SECTION,
    title: 'Control and Coordination',
    number: '7',
    order: 4,
    pages: [111, 124],
  },
  {
    id: LIGHT_SECTION,
    parentId: ROOT_SECTION,
    title: 'Light: Reflection and Refraction',
    number: '10',
    order: 5,
    pages: [160, 186],
  },
];

const displayOf = (section: SectionSeed): string =>
  section.number ? `${section.number}. ${section.title}` : section.title;

function sectionOf(id: string): SectionSeed {
  return SECTIONS.find((section) => section.id === id)!;
}

const RELATION_GRAMMAR = {
  part_of: { glyph: '◈', verb: 'is part of', symmetric: false, spine_like: true },
  kind_of: { glyph: '△', verb: 'is a kind of', symmetric: false, spine_like: true },
  causes: { glyph: '→', verb: 'causes', symmetric: false, spine_like: false },
  requires: { glyph: '⊣', verb: 'requires', symmetric: false, spine_like: false },
  follows: { glyph: '⇢', verb: 'follows', symmetric: false, spine_like: false },
  defined_by: { glyph: '≡', verb: 'is defined by', symmetric: false, spine_like: false },
  contrasts_with: { glyph: '⇄', verb: 'contrasts with', symmetric: true, spine_like: false },
};

const RELATION_TYPES = Object.keys(RELATION_GRAMMAR);

const TYPE_PRIOR: Readonly<Record<AtomCode, number>> = {
  d: 0.6,
  p: 0.55,
  f: 0.6,
  x: 0.5,
  l: 0.5,
  e: 0.45,
  g: 0.45,
  c: 0.4,
  w: 0.4,
  a: 0.35,
  n: 0.3,
};

const REVISION_LINE: Readonly<Record<AtomCode, (label: string) => string>> = {
  d: (label) => `Learn the definition of ${label.toLowerCase()} word for word; it comes up as a one-mark question.`,
  p: (label) => `Write ${label.toLowerCase()} as numbered steps in order; a flow diagram earns the method marks.`,
  c: (label) => `Revise ${label.toLowerCase()} as a list of types, with one example of each.`,
  x: (label) => `Revise ${label.toLowerCase()} as a two-column comparison: what is the same, what differs.`,
  e: (label) => `For ${label.toLowerCase()}, state the cause and the effect in one sentence each.`,
  a: (label) => `Keep ${label.toLowerCase()} as the real-life example for this topic in long answers.`,
  g: (label) => `Practise drawing and labelling ${label.toLowerCase()} until it takes under two minutes.`,
  f: (label) => `Write out ${label.toLowerCase()} from memory and check every symbol and unit.`,
  l: (label) => `State ${label.toLowerCase()} and one observation from the book that supports it.`,
  n: (label) => `Memorise the figure in ${label.toLowerCase()}; one-mark questions ask for it directly.`,
  w: (label) => `Work through ${label.toLowerCase()} again without looking at the steps.`,
};

const slugOf = (label: string): string => label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const topicIdOf = (topic: TopicSeed): string => topic.id ?? `top_dev_${slugOf(topic.label)}`;
const subtopicIdOf = (topicId: string, label: string): string => `sub_${topicId.slice(4)}_${slugOf(label)}`;
const atomIdOf = (label: string): string => `atm_dev_${slugOf(label)}`;

function sourcesOf(atom: AtomSeed, page: number, voices: ChapterVoices): MapSource[] {
  const { note, pyq = [], ex } = atom.extras;
  return [
    { kind: 'textbook', quote: atom.text, title: TEXTBOOK_TITLE, page, sample: true },
    ...(note ? [{ kind: 'teacher_note' as const, quote: note, title: 'Teacher note', author: voices.teacher, date: voices.taught }] : []),
    ...pyq.map(([year, marks, question]) => ({
      kind: 'pyq' as const,
      quote: question,
      title: `CBSE board exam ${year}`,
      board: 'CBSE',
      year,
      marks,
      sample: true,
    })),
    ...(ex ? [{ kind: 'exemplar' as const, quote: ex, title: EXEMPLAR_TITLE, sample: true }] : []),
    { kind: 'notes', quote: REVISION_LINE[atom.code](atom.label), title: voices.notesTitle, author: voices.notesAuthor },
  ];
}

function examinabilityOf(atom: AtomSeed): MapNode['examinability'] {
  const asked = atom.extras.pyq?.length ?? 0;
  return asked > 0
    ? { score: Math.min(0.95, 0.6 + asked * 0.15), basis: 'observed:pyq' }
    : { score: TYPE_PRIOR[atom.code], basis: 'atom_type_prior' };
}

const polar = (angle: number, radius: number): MapPosition => ({
  x: Math.cos(angle) * radius,
  y: Math.sin(angle) * radius,
  angle,
  radius,
});

function buildMap(seed: MapSeed): MindMapResponse {
  const section = sectionOf(seed.sectionId);
  const topics = topicsOf(seed);
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  const cite = (page: number | null, blockRefs: string[], matchRatio = 1): MindMapCitation => ({
    page,
    block_refs: blockRefs,
    match_ratio: matchRatio,
    document_id: DOC,
    section_id: section.id,
  });

  const contain = (source: string, target: string): void => {
    edges.push({
      id: `con:${source}:${target}`,
      kind: 'contains',
      source,
      target,
      relation_type: null,
      text: '',
      citation: null,
    });
  };

  const node = (partial: Partial<MapNode> & Pick<MapNode, 'id' | 'kind' | 'label'>): MapNode => ({
    text: '',
    parent_id: null,
    depth: 0,
    atom_type: null,
    citation: null,
    examinability: { score: 0, basis: 'atom_type_prior' },
    child_count: 0,
    relation_count: 0,
    order: 0,
    page: null,
    position: { x: 0, y: 0, angle: 0, radius: 0 },
    ...partial,
  });

  const firstPage = section.pages ? section.pages[0] : null;
  nodes.push(
    node({
      id: section.id,
      kind: 'chapter',
      label: displayOf(section),
      child_count: topics.length,
      citation: cite(firstPage, []),
      page: firstPage,
    }),
  );

  const atomsIn = (topic: TopicSeed): number => topic.subs.reduce((sum, sub) => sum + sub.atoms.length, 0);
  const totalWeight = topics.reduce((sum, topic) => sum + atomsIn(topic) + 2, 0);
  const step = (Math.PI * 2) / totalWeight;
  let cursor = 0;

  topics.forEach((topic, t) => {
    const weight = atomsIn(topic) + 2;
    const theta = -Math.PI / 2 + (cursor + weight / 2) * step;
    const topicId = topicIdOf(topic);
    let atomIndex = 0;
    cursor += weight;

    nodes.push(
      node({
        id: topicId,
        kind: 'topic',
        label: topic.label,
        parent_id: section.id,
        depth: 1,
        order: t,
        child_count: topic.subs.length,
        citation: cite(topic.page, []),
        page: topic.page,
        position: polar(theta, 320),
      }),
    );
    contain(section.id, topicId);

    topic.subs.forEach((sub, s) => {
      const subId = subtopicIdOf(topicId, sub.label);
      const firstAtom = atomIndex;
      const angleOf = (a: number): number => theta + (a - (atomsIn(topic) - 1) / 2) * step * 0.9;
      const subAngle = angleOf(firstAtom + (sub.atoms.length - 1) / 2);
      const folded = sub.atoms.filter((atom) => atom.label === seed.chapter.folded);
      const clusterId = `clu_${subId}`;

      nodes.push(
        node({
          id: subId,
          kind: 'subtopic',
          label: sub.label,
          text: sub.note ?? '',
          parent_id: topicId,
          depth: 2,
          order: s,
          child_count: sub.atoms.length,
          citation: cite(topic.page, []),
          page: topic.page,
          position: polar(subAngle, 440),
        }),
      );
      contain(topicId, subId);

      if (folded.length > 0) {
        nodes.push(
          node({
            id: clusterId,
            kind: 'cluster',
            label: `${folded.length} more`,
            parent_id: subId,
            depth: 3,
            order: 10000,
            child_count: folded.length,
            position: polar(subAngle, 560),
          }),
        );
        contain(subId, clusterId);
      }

      sub.atoms.forEach((atom, a) => {
        const atomId = atomIdOf(atom.label);
        const inCluster = atom.label === seed.chapter.folded;
        const parentId = inCluster ? clusterId : subId;
        const page = topic.page;
        nodes.push(
          node({
            id: atomId,
            kind: 'atom',
            label: atom.label,
            text: atom.text,
            parent_id: parentId,
            depth: inCluster ? 4 : 3,
            order: a,
            atom_type: ATOM_TYPES[atom.code],
            page,
            examinability: examinabilityOf(atom),
            citation: cite(page, [`${DOC}_b${page}`], atom.label === seed.chapter.paraphrased ? 0.886 : 1),
            position: polar(angleOf(firstAtom + a), 560),
            sources: sourcesOf(atom, page, seed.voices),
          }),
        );
        contain(parentId, atomId);
      });
      atomIndex += sub.atoms.length;
    });
  });

  const present = new Set(nodes.filter((n) => n.kind === 'atom').map((n) => n.id));
  const edgeIds = new Set<string>();
  const relations = seed.chapter.relations.filter(
    ([from, , to]) => present.has(atomIdOf(from)) && present.has(atomIdOf(to)),
  );

  relations.forEach(([from, type, to, sentence]) => {
    const source = atomIdOf(from);
    const target = atomIdOf(to);
    const page = nodes.find((n) => n.id === source)?.page ?? null;
    const plain = `rel_dev_${slugOf(from)}_${slugOf(to)}`;
    const id = edgeIds.has(plain) ? `${plain}_${type}` : plain;
    edgeIds.add(id);
    edges.push({
      id,
      kind: 'relation',
      source,
      target,
      relation_type: type,
      text: sentence,
      citation: cite(page, [`${DOC}_b${page}`], 0.93),
    });
    for (const endpoint of [source, target]) {
      const n = nodes.find((x) => x.id === endpoint);
      if (n) n.relation_count += 1;
    }
  });

  const xs = nodes.map((n) => n.position!.x);
  const ys = nodes.map((n) => n.position!.y);
  const atoms = nodes.filter((n) => n.kind === 'atom');

  return {
    meta: {
      document_id: DOC,
      section_id: section.id,
      section_display: displayOf(section),
      subject: null,
      grade: null,
      topics: topics.length,
      atoms: atoms.length,
      relations: relations.length,
      orphan_atoms: atoms.filter((a) => a.relation_count === 0).length,
      clusters: nodes.filter((n) => n.kind === 'cluster').length,
      truncated: false,
      graph_basis: 'containment is total; typed relations are sparse cross-links',
      exam_prior_basis: 'atom_type_prior unless stated observed',
      compile_basis: 'dev fixture, not a compiled corpus',
      extraction_report: {
        document_id: DOC,
        complete: true,
        sections_total: SECTIONS.length - 1,
        sections_extracted: SECTIONS.length - 1,
        model: 'dev-fixture',
      },
    },
    nodes,
    edges,
    bounds: {
      min_x: Math.min(...xs),
      min_y: Math.min(...ys),
      max_x: Math.max(...xs),
      max_y: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
    relation_grammar: RELATION_GRAMMAR,
    layout_basis: 'dev fixture: radial sunburst in reading order',
  };
}

const MAPS: ReadonlyMap<string, MindMapResponse> = new Map(
  [
    { sectionId: ROOT_SECTION, chapter: { topics: [], relations: [] }, voices: LIFE_PROCESSES_VOICES },
    ...MAP_SEEDS,
  ].map((seed) => [seed.sectionId, buildMap(seed)]),
);

interface TopicGroupSeed {
  id: string;
  title: string;
  sectionId: string;
  span: readonly [first: string, last: string];
}

const TOPIC_GROUPS: readonly TopicGroupSeed[] = [
  { id: 'top_dev_modes_of_nutrition', title: 'Modes of nutrition', sectionId: NUTRITION_SECTION, span: NUTRITION_SPAN },
  { id: 'top_dev_respiration', title: 'Respiration', sectionId: SECTION, span: ['Respiration and Oxygen Use', 'Respiratory Pigments'] },
  {
    id: 'top_dev_transportation',
    title: 'Transportation',
    sectionId: SECTION,
    span: ['Transportation and Excretion', 'Phloem Transport and Translocation'],
  },
  { id: 'top_dev_excretion', title: 'Excretion', sectionId: SECTION, span: ['Excretion in General', 'Organ Donation'] },
  {
    id: 'top_dev_nervous_system',
    title: 'Nervous system',
    sectionId: CONTROL_SECTION,
    span: ['Need for control and coordination', 'How nervous tissue causes action'],
  },
  { id: 'top_dev_hormones', title: 'Hormones', sectionId: CONTROL_SECTION, span: ['Coordination in plants', 'Feedback mechanism'] },
];

export interface MindmapTopicGroup {
  id: string;
  title: string;
  chapter_title: string;
  item_id: string;
  section_id: string;
  section_title: string;
  page_start: number | null;
  page_end: number | null;
  atoms: readonly { id: string; label: string }[];
}

function groupTopics(group: TopicGroupSeed): readonly TopicSeed[] {
  const seed = seedOf(group.sectionId);
  return topicsOf({ ...seed, span: group.span });
}

function chapterTitleOf(section: SectionSeed): string {
  const parent = section.parentId ? sectionOf(section.parentId) : null;
  return parent?.parentId ? chapterTitleOf(parent) : section.title;
}

const groupPages = (title: string): [number, number] =>
  pageSpan(groupTopics(TOPIC_GROUPS.find((group) => group.title === title)!));

// ------------------------------------------------------------------ mind map handlers

const CHAPTER_PAGES: [number, number] = [93, 110];

const TOPIC_PLACEMENTS: Record<string, [number, number]> = {
  Nutrition: groupPages('Modes of nutrition'),
  'Modes of nutrition': groupPages('Modes of nutrition'),
  Respiration: groupPages('Respiration'),
};

const libraryItemId = (title: string): string =>
  CONTENT_ITEMS.find((item) => item.title === title)?.id ?? seedId('mindmap-book', title);

const GRADE_10 = seedId('grade', 10);

const TEXTBOOK_ID = libraryItemId('Science Textbook, Class 10');
const EXEMPLAR_ID = libraryItemId('Science Exemplar Problems, Class 10');
const LAB_MANUAL_ID = libraryItemId('Science Lab Manual, Class 10');

interface FixtureBook extends MindmapBook {
  placements: Record<string, [number, number] | null>;
}

const BOOKS: FixtureBook[] = [
  {
    id: TEXTBOOK_ID,
    title: 'Science Textbook, Class 10',
    kind: 'book',
    subject_id: 'subject-sci',
    grade_level_id: GRADE_10,
    index_status: 'indexed',
    mindmap_state: 'available',
    placements: {
      'Life Processes': CHAPTER_PAGES,
      'Control and Coordination': [111, 124],
      'Light: Reflection and Refraction': [160, 186],
      'Chemical Reactions and Equations': [1, 14],
    },
  },
  {
    id: EXEMPLAR_ID,
    title: 'Science Exemplar Problems, Class 10',
    kind: 'document',
    subject_id: 'subject-sci',
    grade_level_id: GRADE_10,
    index_status: 'indexed',
    mindmap_state: 'available',
    placements: { 'Life Processes': null },
  },
  {
    id: LAB_MANUAL_ID,
    title: 'Science Lab Manual, Class 10',
    kind: 'book',
    subject_id: 'subject-sci',
    grade_level_id: GRADE_10,
    index_status: 'held',
    mindmap_state: 'held',
    placements: { 'Chemical Reactions and Equations': [1, 14] },
  },
  {
    id: libraryItemId('Contemporary India II'),
    title: 'Contemporary India II',
    kind: 'book',
    subject_id: 'subject-soc',
    grade_level_id: GRADE_10,
    index_status: 'parked',
    mindmap_state: 'parked',
    placements: {},
  },
  {
    id: libraryItemId('First Flight'),
    title: 'First Flight',
    kind: 'book',
    subject_id: 'subject-eng',
    grade_level_id: GRADE_10,
    index_status: 'pending',
    mindmap_state: 'pending',
    placements: {},
  },
  {
    id: libraryItemId('Mathematics Textbook, Class 10'),
    title: 'Mathematics Textbook, Class 10',
    kind: 'book',
    subject_id: 'subject-math',
    grade_level_id: GRADE_10,
    index_status: 'failed',
    mindmap_state: 'failed',
    placements: {},
  },
  {
    id: libraryItemId('Life Processes, chapter notes'),
    title: 'Life Processes, chapter notes',
    kind: 'note',
    subject_id: 'subject-sci',
    grade_level_id: GRADE_10,
    index_status: 'none',
    mindmap_state: 'not_indexed',
    placements: {},
  },
];

const NOT_INDEXED_REASON: Record<string, string> = {
  held:
    "this item's material has been uploaded and is held for a GPU build that has not been " +
    'published yet; the material exists and its map can be drawn once that build is published',
  parked:
    "the retrieval engine parked this item's upload until its chapters are confirmed, so " +
    'there is no map to draw until they are',
  pending: 'this item is queued for indexing, so there is no map to draw until that finishes',
  failed: 'indexing this item failed, so there is no map to draw until it is indexed again',
  not_indexed:
    'this item has not been indexed by the retrieval engine, so there is no map to draw',
};

function pathOf(section: SectionSeed): string {
  const own = `${section.number} ${section.title}`.trim();
  return section.parentId ? `${pathOf(sectionOf(section.parentId))} > ${own}` : own;
}

const chapters: ChaptersResponse = {
  documents: [
    {
      document_id: DOC,
      title: BOOK_TITLE,
      source_type: 'book',
      subject: 'science',
      grade: 10,
      scope: 'school',
      structure: 'toc',
      structure_reason: 'chaptered',
      structure_note: "chapter tree from the document's table of contents",
      sections: SECTIONS.map((section) => ({
        id: section.id,
        parent_id: section.parentId,
        title: section.title,
        order: section.order,
        path: pathOf(section),
        page_range: section.pages,
        chunks: section.pages ? section.pages[1] - section.pages[0] + 1 : 0,
        blocks: section.pages ? section.pages[1] - section.pages[0] + 1 : 0,
        children: SECTIONS.filter((child) => child.parentId === section.id).length,
        number: section.number,
        page_start: section.pages ? section.pages[0] : null,
        page_end: section.pages ? section.pages[1] : null,
        detection_method: section.pages ? 'toc' : '',
        label: '',
        display_label: displayOf(section),
        tags: [],
      })),
    },
  ],
  total_sections: SECTIONS.length,
};

/**
 * Deterministic pseudo-random, so a drill built from a seed is the same drill
 * every time. That is not a nicety: the engine rebuilds the drill from the seed
 * to grade it, and a fixture that shuffled differently would mark a student's
 * answers against questions they never saw.
 */
function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const DRILL_KINDS: readonly string[] = ['label', 'relation', 'placement'];
const GAP = '____';

function maskLabel(sentence: string, label: string): string {
  const at = sentence.toLowerCase().indexOf(label.toLowerCase());
  if (at < 0) return sentence;
  return `${sentence.slice(0, at)} ${GAP} ${sentence.slice(at + label.length)}`;
}

function topicOf(map: MindMapResponse, node: MapNode | undefined): MapNode | undefined {
  let current = node;
  while (current && current.kind !== 'topic') {
    const parentId = current.parent_id;
    current = parentId ? map.nodes.find((x) => x.id === parentId) : undefined;
  }
  return current;
}

function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const inTopic = (map: MindMapResponse, node: MapNode | undefined, topicId: string | undefined): boolean =>
  !topicId || topicOf(map, node)?.id === topicId;

function labelItems(
  map: MindMapResponse,
  kind: DrillKind,
  n: number,
  rand: () => number,
  withAnswers: boolean,
  topicId?: string,
): DrillItem[] {
  const atoms = map.nodes.filter((x) => x.kind === 'atom');
  const pool = atoms.filter((atom) => inTopic(map, atom, topicId));
  const picked = shuffled(pool, rand).slice(0, Math.min(n, pool.length));

  return picked.map((atom) => {
    const masked = maskLabel(atom.text, atom.label);
    const distractors = atoms.filter((a) => a.id !== atom.id).slice(0, 3);
    const topic = topicOf(map, atom);
    return {
      id: `itm_${atom.id.slice(4)}`,
      kind,
      node_id: atom.id,
      prompt: withAnswers ? atom.text : masked,
      masked_prompt: masked,
      options: kind === 'placement' ? shuffled([atom.label, ...distractors.map((a) => a.label)], rand) : [],
      answer: withAnswers ? atom.label : '',
      topic_id: topic?.id ?? '',
      topic_label: topic?.label ?? '',
      atom_type: atom.atom_type,
      citation: atom.citation,
      examinability: atom.examinability.score,
    };
  });
}

function relationItems(
  map: MindMapResponse,
  n: number,
  rand: () => number,
  withAnswers: boolean,
  topicId?: string,
): DrillItem[] {
  const stated = map.edges.filter(
    (e) => e.kind === 'relation' && inTopic(map, map.nodes.find((x) => x.id === e.source), topicId),
  );
  const picked = shuffled(stated, rand).slice(0, Math.min(n, stated.length));

  return picked.map((edge) => {
    const source = map.nodes.find((x) => x.id === edge.source);
    const target = map.nodes.find((x) => x.id === edge.target);
    const topic = topicOf(map, source);
    return {
      id: `itm_${edge.id.slice(4)}`,
      kind: 'relation',
      node_id: edge.source,
      prompt: edge.text,
      masked_prompt: `${source?.label ?? ''}  ${GAP}  ${target?.label ?? ''}`,
      options: shuffled(RELATION_TYPES, rand),
      answer: withAnswers ? (edge.relation_type ?? '') : '',
      topic_id: topic?.id ?? '',
      topic_label: topic?.label ?? '',
      atom_type: null,
      citation: edge.citation,
      examinability: 1,
    };
  });
}

const GRADING_BASIS =
  'dev fixture, using the engine rule: folded texts that are equal are correct; otherwise a ' +
  'similarity ratio of at least 0.82 or at least 75% of the answer words given is partial';

function buildDrill(
  map: MindMapResponse,
  kind: DrillKind,
  n: number,
  seed: number,
  withAnswers: boolean,
  topicId?: string,
): Drill {
  const rand = seeded(seed);
  return {
    section_id: map.meta.section_id,
    seed,
    kind,
    items:
      kind === 'relation'
        ? relationItems(map, n, rand, withAnswers, topicId)
        : labelItems(map, kind, n, rand, withAnswers, topicId),
    selection_basis: topicId ? 'dev fixture: seeded shuffle over one topic' : 'dev fixture: seeded shuffle over all atoms',
    grading_basis: GRADING_BASIS,
    with_answers: withAnswers,
  };
}

function folded(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchingCharacters(a: string, b: string): number {
  if (!a || !b) return 0;
  let best = 0;
  let atA = 0;
  let atB = 0;
  const run = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const above = run[j]!;
      run[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
      if (run[j]! > best) {
        best = run[j]!;
        atA = i - best;
        atB = j - best;
      }
      diagonal = above;
    }
  }
  if (best === 0) return 0;
  return (
    best +
    matchingCharacters(a.slice(0, atA), b.slice(0, atB)) +
    matchingCharacters(a.slice(atA + best), b.slice(atB + best))
  );
}

const MIN_SIMILARITY = 0.82;
const MIN_CONTAINMENT = 0.75;

type Verdict = DrillResult['results'][number]['verdict'];

function verdictOf(given: string, expected: string): { verdict: Verdict; similarity: number } {
  const g = folded(given);
  const e = folded(expected);
  if (!e) return { verdict: 'incorrect', similarity: 0 };
  if (g === e) return { verdict: 'correct', similarity: 1 };
  if (!g) return { verdict: 'incorrect', similarity: 0 };
  const similarity = (2 * matchingCharacters(g, e)) / (g.length + e.length);
  const expectedWords = new Set(e.split(' '));
  const givenWords = new Set(g.split(' '));
  const containment = [...expectedWords].filter((word) => givenWords.has(word)).length / expectedWords.size;
  return {
    verdict: similarity >= MIN_SIMILARITY || containment >= MIN_CONTAINMENT ? 'partial' : 'incorrect',
    similarity: Math.round(Math.max(similarity, containment) * 10000) / 10000,
  };
}

function gradeDrill(map: MindMapResponse, body: Record<string, unknown>): DrillResult {
  const kind = String(body.kind ?? 'label') as DrillKind;
  const n = Number(body.n ?? 10);
  const seed = Number(body.seed ?? 0);
  const topicId = typeof body.topic_id === 'string' && body.topic_id ? body.topic_id : undefined;
  const answers = (body.answers ?? {}) as Record<string, string>;
  // Rebuilt from the seed, exactly as the real engine does, rather than looked
  // up. That is what lets a stateless service mark an attempt it never stored.
  const drill = buildDrill(map, kind, n, seed, true, topicId);

  const results = drill.items.map((item) => {
    const given = (answers[item.id] ?? '').trim();
    const expected = item.answer;
    const { verdict, similarity } = verdictOf(given, expected);
    return {
      item_id: item.id,
      node_id: item.node_id,
      verdict,
      similarity,
      given,
      expected,
      citation: item.citation,
      evidence: kind === 'relation' ? item.prompt : (map.nodes.find((x) => x.id === item.node_id)?.text ?? ''),
    };
  });

  const correct = results.filter((r) => r.verdict === 'correct').length;
  const partial = results.filter((r) => r.verdict === 'partial').length;

  return {
    section_id: map.meta.section_id,
    kind: drill.kind,
    scored: results.length,
    correct,
    partial,
    incorrect: results.length - correct - partial,
    score: results.length === 0 ? 0 : (correct + partial * 0.5) / results.length,
    results,
    node_scores: Object.fromEntries(
      results.map((r) => [r.node_id, r.verdict === 'correct' ? 1 : r.verdict === 'partial' ? 0.5 : 0]),
    ),
    grading_basis: drill.grading_basis,
  };
}

function trace(map: MindMapResponse, from: string, to: string, maxHops: number): TracePath {
  const labelOf = (id: string): string => map.nodes.find((n) => n.id === id)?.label ?? id;
  const absent = (note: string): TracePath => ({ found: false, steps: [], note });

  if (!map.nodes.some((n) => n.id === from) || !map.nodes.some((n) => n.id === to)) {
    return absent('unknown node id in this map');
  }
  if (from === to) return absent('source and target are the same node');

  // Breadth-first over typed relations only, which is what a trace is: the
  // containment spine is this compiler's, not the book's, so walking it would
  // "explain" a connection the text never states.
  const adjacency = new Map<string, { to: string; edge: MapEdge }[]>();
  for (const e of map.edges) {
    if (e.kind !== 'relation') continue;
    const pairs: [string, string][] = [
      [e.source, e.target],
      [e.target, e.source],
    ];
    for (const [a, b] of pairs) {
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a)!.push({ to: b, edge: e });
    }
  }

  if (!adjacency.has(from)) {
    return absent(
      `'${labelOf(from)}' carries no typed relation in this chapter — the book states no link from it`,
    );
  }
  if (!adjacency.has(to)) {
    return absent(
      `'${labelOf(to)}' carries no typed relation in this chapter — the book states no link to it`,
    );
  }

  const queue: { id: string; path: MapEdge[] }[] = [{ id: from, path: [] }];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === to) {
      let cursor = from;
      const steps = current.path.map((edge) => {
        const next = edge.source === cursor ? edge.target : edge.source;
        const step = {
          from_id: cursor,
          to_id: next,
          from_label: labelOf(cursor),
          to_label: labelOf(next),
          relation_type: edge.relation_type ?? '',
          verb: RELATION_GRAMMAR[edge.relation_type as keyof typeof RELATION_GRAMMAR]?.verb ?? '',
          sentence: edge.text,
          citation: edge.citation,
        };
        cursor = next;
        return step;
      });
      return { found: true, steps, note: '' };
    }
    if (current.path.length >= maxHops) continue;
    for (const next of adjacency.get(current.id) ?? []) {
      if (seen.has(next.to)) continue;
      seen.add(next.to);
      queue.push({ id: next.to, path: [...current.path, next.edge] });
    }
  }
  // Not found is a real answer about the corpus, not a 404.
  return absent(
    `no chain of stated relations connects these two within ${maxHops} hops in this chapter`,
  );
}

// ---------------------------------------------------------------- mastery (emerge-core)

/**
 * Mastery lives on `globalThis` so it survives hot reload and dies with the
 * process. It is a stand-in for a table, not one, which is exactly what the
 * engine refuses to hold and Emerge is supposed to.
 */
const masteryStore = globalThis as unknown as { __emergeMastery?: Map<string, MasteryMap> };
const mastery: Map<string, MasteryMap> = (masteryStore.__emergeMastery ??= new Map());

const masteryKey = (studentId: string, itemId: string, sectionId: string): string =>
  `${studentId}|${itemId}|${sectionId}`;

const trackedStudent = (): string | null => identity().roles?.student_ids?.[0] ?? null;

function masteryOf(itemId: string, sectionId: string): MasteryResponse {
  const studentId = trackedStudent();
  return {
    section_id: sectionId,
    content_item_id: itemId,
    student_id: studentId,
    tracked: studentId !== null,
    states: studentId ? (mastery.get(masteryKey(studentId, itemId, sectionId)) ?? {}) : {},
  };
}

function storeMastery(itemId: string, sectionId: string, incoming: MasteryMap): MasteryResponse {
  const studentId = trackedStudent();
  if (!studentId) return masteryOf(itemId, sectionId);
  const key = masteryKey(studentId, itemId, sectionId);
  const current = mastery.get(key) ?? {};
  // The ladder is enforced HERE as well as in the hook. A client that forgot it
  // must not be able to demote a concept the student has already learned.
  for (const [id, next] of Object.entries(incoming)) {
    current[id] = raise(current[id], next as MasteryState);
  }
  mastery.set(key, current);
  return masteryOf(itemId, sectionId);
}

function stateForScore(score: number): MasteryState {
  if (score >= 1) return 'known';
  if (score >= 0.5) return 'shaky';
  return 'missed';
}

function recordGrades(itemId: string, sectionId: string, result: DrillResult): void {
  const graded: MasteryMap = {};
  for (const answered of result.results.filter((r) => r.given.trim() !== '')) {
    graded[answered.node_id] = stateForScore(result.node_scores[answered.node_id] ?? 0);
  }
  storeMastery(itemId, sectionId, graded);
}

function pagesOverlapping(a: [number, number], b: [number, number]): number {
  return Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]) + 1);
}

const spanOf = (pages: [number, number]): number => pages[1] - pages[0] + 1;

function wholeBookSections(placedOn: string): CurriculumMindmapSection[] {
  const placed = (section: SectionSeed): number => (chapterTitleOf(section) === placedOn ? 0 : 1);
  const paged = SECTIONS.filter((section) => section.pages !== null).sort(
    (a, b) => placed(a) - placed(b) || a.pages![0] - b.pages![0],
  );
  const unpaged = SECTIONS.filter((section) => section.pages === null);
  return [...paged, ...unpaged].map((section) => ({
    section_id: section.id,
    display: displayOf(section),
    page_start: section.pages ? section.pages[0] : null,
    page_end: section.pages ? section.pages[1] : null,
    overlap_pages: section.pages ? spanOf(section.pages) : null,
  }));
}

function overlappingSections(pages: [number, number]): CurriculumMindmapSection[] {
  return SECTIONS.flatMap((section) => {
    if (!section.pages) return [];
    const overlap = pagesOverlapping(pages, section.pages);
    return overlap > 0 ? [{ section, own: section.pages, overlap }] : [];
  })
    .sort((a, b) => b.overlap - a.overlap || spanOf(a.own) - spanOf(b.own) || a.own[0] - b.own[0])
    .map(({ section, own, overlap }) => ({
      section_id: section.id,
      display: displayOf(section),
      page_start: own[0],
      page_end: own[1],
      overlap_pages: overlap,
    }));
}

function linkOf(
  book: FixtureBook,
  nodeId: string,
  pages: [number, number] | null,
  inherited: boolean,
  placedOn: string,
): CurriculumMindmap {
  const available = book.mindmap_state === 'available';
  const matched = pages ? overlappingSections(pages) : wholeBookSections(placedOn);
  const basis = pages === null ? 'whole_item' : matched.length > 0 ? 'page_overlap' : 'none';
  return {
    content_item_id: book.id,
    title: book.title,
    placement_id: `placement-${nodeId}-${book.id.slice(-2)}`,
    inherited,
    page_start: pages ? pages[0] : null,
    page_end: pages ? pages[1] : null,
    mindmap_state: book.mindmap_state,
    match_basis: available ? basis : 'none',
    sections: available ? matched : [],
  };
}

interface FixtureNode {
  id: string;
  kind?: string;
  title?: string;
}

function mindmapLinks(node: FixtureNode, parent?: FixtureNode): CurriculumMindmapsResponse {
  const title = node.title ?? '';
  const isTopic = node.kind === 'topic';
  const own = isTopic ? TOPIC_PLACEMENTS[title] : undefined;
  const textbook = BOOKS.find((book) => book.id === TEXTBOOK_ID);
  const holder = isTopic ? parent : node;
  const placedOn = holder?.title ?? '';

  const mindmaps =
    own && textbook
      ? [linkOf(textbook, node.id, own, false, placedOn)]
      : BOOKS.filter((book) => placedOn in book.placements).map((book) =>
          linkOf(book, holder?.id ?? node.id, book.placements[placedOn] ?? null, isTopic, placedOn),
        );

  return {
    curriculum_node_id: node.id,
    kind: node.kind ?? 'topic',
    mindmaps,
    count: mindmaps.length,
  };
}

const DEFAULT_BOOKS_PAGE = 50;
const DEFAULT_MAX_HOPS = 6;
const UPSTREAM_REFUSED = 'mindmap_upstream_refused';
const NOT_INDEXED = 'mindmap_not_indexed';
const REQUEST_FAILED = 'request_failed';
const MASTERY_WRITE = 'core.concept_mastery.write';

const refuseUpstream = (status: number, message: string): never =>
  fail(status, UPSTREAM_REFUSED, message);

function refuseDrillKind(kind: string): never {
  const expected = "'label', 'relation' or 'placement'";
  return refuseUpstream(
    422,
    JSON.stringify([
      { type: 'enum', loc: ['query', 'kind'], msg: `Input should be ${expected}`, input: kind, ctx: { expected } },
    ]),
  );
}

function availableBook(itemId: string): FixtureBook {
  const book = BOOKS.find((candidate) => candidate.id === itemId) ?? notFound('library item');
  if (book.mindmap_state !== 'available') {
    fail(409, NOT_INDEXED, NOT_INDEXED_REASON[book.mindmap_state] ?? '', {
      index_status: book.index_status,
      mindmap_state: book.mindmap_state,
    });
  }
  return book;
}

function chapterMap(itemId: string, sectionId: string): MindMapResponse {
  availableBook(itemId);
  return MAPS.get(sectionId) ?? notFound('chapter in this book');
}

const publicBook = ({ placements: _placements, ...book }: FixtureBook): MindmapBook => book;

export function mindmapBooks(query: { limit?: number; offset?: number; kind?: string } = {}): MindmapBooksPage {
  const limit = query.limit && query.limit > 0 ? query.limit : DEFAULT_BOOKS_PAGE;
  const offset = query.offset && query.offset > 0 ? query.offset : 0;
  const rows = BOOKS.filter((book) => !query.kind || book.kind === query.kind)
    .slice(offset, offset + limit)
    .map(publicBook);
  return { rows, count: rows.length, page: { limit, offset, has_more: rows.length === limit } };
}

export function mindmapChapters(itemId: string): ChaptersResponse {
  availableBook(itemId);
  return chapters;
}

export const mindmapOf = chapterMap;

export function mindmapNode(itemId: string, sectionId: string, nodeId: string): MapNodeDetail {
  const map = chapterMap(itemId, sectionId);
  const node = map.nodes.find((n) => n.id === nodeId) ?? refuseUpstream(404, 'unknown node in this map');
  const neighbours: MapNeighbour[] = map.edges
    .filter((e) => e.kind === 'relation' && (e.source === node.id || e.target === node.id))
    .map((edge) => {
      const outgoing = edge.source === node.id;
      const otherId = outgoing ? edge.target : edge.source;
      const grammar = RELATION_GRAMMAR[edge.relation_type as keyof typeof RELATION_GRAMMAR];
      return {
        node_id: otherId,
        label: map.nodes.find((n) => n.id === otherId)?.label ?? otherId,
        relation_type: edge.relation_type ?? '',
        verb: grammar?.verb ?? '',
        glyph: grammar?.glyph ?? '',
        outgoing,
        sentence: edge.text,
        citation: edge.citation,
      };
    });
  return { node, neighbours };
}

export function mindmapTrace(
  itemId: string,
  sectionId: string,
  from: string,
  to: string,
  maxHops = DEFAULT_MAX_HOPS,
): TracePath {
  const map = chapterMap(itemId, sectionId);
  if (!from) fail(400, REQUEST_FAILED, 'from: is required');
  if (!to) fail(400, REQUEST_FAILED, 'to: is required');
  return trace(map, from, to, maxHops > 0 ? maxHops : DEFAULT_MAX_HOPS);
}

export function mindmapDrill(
  itemId: string,
  sectionId: string,
  params: { kind: string; n: number; seed: number; topic_id?: string },
): Drill {
  const map = chapterMap(itemId, sectionId);
  if (!DRILL_KINDS.includes(params.kind)) refuseDrillKind(params.kind);
  return buildDrill(map, params.kind as DrillKind, params.n, params.seed, false, params.topic_id || undefined);
}

const mayRecordMastery = (): boolean =>
  trackedStudent() !== null && capabilities().capabilities.some((held) => held.key === MASTERY_WRITE);

export function mindmapGrade(itemId: string, sectionId: string, request: DrillGradeRequest): DrillGrade {
  const map = chapterMap(itemId, sectionId);
  if (typeof request.answers !== 'object' || request.answers === null) {
    fail(400, REQUEST_FAILED, 'answers is required: an object of drill item id to the text answered');
  }
  if (!DRILL_KINDS.includes(request.kind)) {
    refuseUpstream(422, `kind must be one of ${DRILL_KINDS.join(', ')}`);
  }
  const result = gradeDrill(map, { ...request });
  const attempted = result.results.some((r) => r.given.trim() !== '') && mayRecordMastery();
  if (attempted) recordGrades(itemId, map.meta.section_id, result);
  return { result, recorded: attempted ? true : null };
}

export function readMastery(itemId: string, sectionId: string): MasteryResponse {
  chapterMap(itemId, sectionId);
  return masteryOf(itemId, sectionId);
}

export function writeMastery(itemId: string, sectionId: string, states: MasteryMap): MasteryResponse {
  chapterMap(itemId, sectionId);
  for (const [nodeId, state] of Object.entries(states)) {
    if (state !== READ_STATE) {
      fail(
        422,
        REQUEST_FAILED,
        `states.${nodeId}: a client may record only "${READ_STATE}"; graded states are ` +
          'recorded by the server from a drill result',
      );
    }
  }
  return storeMastery(itemId, sectionId, states);
}

export function mindmapTopicGroups(): MindmapTopicGroup[] {
  return TOPIC_GROUPS.map((group) => {
    const section = sectionOf(group.sectionId);
    const atoms = groupTopics(group).flatMap((topic) =>
      topic.subs.flatMap((sub) => sub.atoms.map((atom) => ({ id: atomIdOf(atom.label), label: atom.label }))),
    );
    const [pageStart, pageEnd] = pageSpan(groupTopics(group));
    return {
      id: group.id,
      title: group.title,
      chapter_title: chapterTitleOf(section),
      item_id: TEXTBOOK_ID,
      section_id: section.id,
      section_title: section.title,
      page_start: pageStart,
      page_end: pageEnd,
      atoms,
    };
  });
}

export function curriculumNodeMindmaps(nodeId: string): CurriculumMindmapsResponse {
  const node = CURRICULUM_NODES.find((candidate) => candidate.id === nodeId) ?? notFound('curriculum node');
  const parent = CURRICULUM_NODES.find((candidate) => candidate.id === node.parent_id);
  return mindmapLinks(node, parent);
}
