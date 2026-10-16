import type { PageInfo } from './roster';

/**
 * `lms-mind-map` wire types, transcribed from `mindmap_engine/models.py` and
 * `recall.py` rather than from prose.
 *
 * # The one thing to know before rendering any of this
 *
 * The spine is CONTAINMENT, and typed relations are cross-links laid over it.
 * Measured on the Class-10 NCERT Science corpus: containment reaches 1,195 of
 * 1,195 atoms, typed relations touch 541 (45%), leaving 654 atoms (55%) with no
 * relation at all. So `relation_count: 0` is the COMMON case and is not a
 * defect. A renderer must not hide, dim or de-rank a node for it, and must not
 * build a view that discovers nodes by walking relations, which would silently
 * lose most of the book.
 *
 * # Positions come from the server, and a client may still lay out its own
 *
 * Every node carries a `position`, a deterministic radial sunburst. The engine
 * computes it because a force simulation is non-deterministic: the same chapter
 * would draw differently on every load and the spatial memory a mind map exists
 * to build would be gone.
 *
 * The engine's OWN web UI does not use it for the map view, and neither does the
 * Atlas here: both lay out a two-level tree instead, deterministically. What is
 * forbidden is a SIMULATION, not a second deterministic layout.
 *
 * # These types were verified against a running engine
 *
 * Reading the Python was not enough and produced four wrong guesses: the root
 * node's kind is `chapter` (not `section`), `position` carries `angle` and
 * `radius` too, `bounds` carries `width` and `height`, and `relation_grammar`
 * is glyph-and-verb rather than stroke-and-dash.
 */

/** Where in the book a node's characters came from. Not resolved here. */
export interface MindMapCitation {
  page: number | null;
  block_refs: string[];
  /**
   * The grounding number, carried verbatim from the upstream extractor. `1.0`
   * means the atom is the book's sentence character for character.
   *
   * **Show it when it is below 1.0.** A quotation mark around 0.886 of a
   * sentence is a claim the corpus does not support.
   */
  match_ratio: number;
  document_id: string;
  section_id: string;
}

/**
 * How likely this node is to be examined, and always on what basis.
 *
 * `basis` is the load-bearing half. `score` alone is the number every ed-tech
 * product ships and nobody can audit. `atom_type_prior` is a guess from the kind
 * of thing this is; `observed:<source>` is a measurement. Draw them differently,
 * dotted versus solid, because they are different claims.
 */
export interface Examinability {
  score: number;
  basis: string;
}

/**
 * Verified against a running engine, not guessed from the compiler. The root is
 * `chapter`; there is no `section` or `document` kind on the wire. A `cluster`
 * is a fold over a topic's overflow atoms, never a level of its own: its id is
 * its topic's id prefixed `clu_`.
 */
export type MapNodeKind = 'chapter' | 'topic' | 'subtopic' | 'cluster' | 'atom';

export interface MapPosition {
  x: number;
  y: number;
  /** The sunburst's own polar pair, served alongside the cartesian one. */
  angle: number;
  radius: number;
}

export interface MapNode {
  /** The upstream id, unchanged. */
  id: string;
  kind: MapNodeKind;
  /** What to draw. */
  label: string;
  /** The book's own characters. Empty for every kind but `atom`. */
  text: string;
  parent_id: string | null;
  depth: number;
  atom_type: string | null;
  citation: MindMapCitation | null;
  examinability: Examinability;
  /** Children in the compiled map, so a collapsed node can show its weight. */
  child_count: number;
  /** Typed relations touching this node. Zero is common. See the header. */
  relation_count: number;
  /** Reading position, straight off the book's order. */
  order: number;
  page: number | null;
  /** Server-computed. Absent only if the engine could not place it. */
  position: MapPosition | null;
  sources?: MapSource[];
}

export type MapSourceKind = 'textbook' | 'teacher_note' | 'notes' | 'pyq' | 'exemplar';

export interface MapSource {
  kind: MapSourceKind;
  quote: string;
  title: string;
  page?: number | null;
  author?: string;
  date?: string;
  board?: string;
  year?: number;
  marks?: number;
  sample?: boolean;
}

export type MapEdgeKind = 'contains' | 'relation';

export interface MapEdge {
  id: string;
  kind: MapEdgeKind;
  source: string;
  target: string;
  /** Set for a relation edge. Containment is unlabelled: the book did not state it. */
  relation_type: string | null;
  /** The sentence the book states the relation in, verbatim. */
  text: string;
  citation: MindMapCitation | null;
}

/**
 * What the caller must know to read the map honestly. Every field is measured or
 * counted, none is a target.
 */
export interface MapMeta {
  document_id: string;
  section_id: string;
  section_display: string;
  subject: string | null;
  grade: number | null;
  topics: number;
  atoms: number;
  relations: number;
  /** Counted, not estimated. Decides whether cross-links deserve a legend here. */
  orphan_atoms: number;
  clusters: number;
  /** The upstream capped the graph. A map of a truncated graph is still valid, and saying so is the difference. */
  truncated: boolean;
  /** Forwarded verbatim. Not paraphrased: a paraphrase is a second spelling that can drift. */
  graph_basis: string;
  exam_prior_basis: string;
  compile_basis: string;
  extraction_report: Record<string, unknown> | null;
}

export interface MapBounds {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
  width: number;
  height: number;
}

/**
 * How to SAY each of the seven relation types. Captured from a running engine.
 *
 * It carries NO colours, which is worth knowing before building a legend from
 * it: a client picks those itself, and the Atlas has a `--r-<type>` variable per
 * type. What it does carry is `spine_like`, separating the two relations that
 * read as structure (`part_of`, `kind_of`) from the five that are genuine
 * cross-links, and `symmetric`, which says when an arrowhead would mislead.
 */
export interface RelationGrammarEntry {
  /** One character, e.g. `◈` for `part_of`, `⇄` for `contrasts_with`. */
  glyph: string;
  /** How a student would say it: "is part of", "is the opposite of". */
  verb: string;
  /** Direction does not matter, so do not draw an arrowhead. */
  symmetric: boolean;
  /** Reads as structure rather than as a cross-link. */
  spine_like: boolean;
}

export type RelationGrammar = Record<string, RelationGrammarEntry>;

/** `GET /map/{section_id}`. Everything needed for a first paint. */
export interface MindMapResponse {
  meta: MapMeta;
  nodes: MapNode[];
  edges: MapEdge[];
  bounds: MapBounds;
  relation_grammar: RelationGrammar;
  layout_basis: string;
}

/** `GET /map/{section_id}/node/{node_id}`. */
export interface MapNodeDetail {
  node: MapNode;
  neighbours: MapNeighbour[];
}

export interface MapNeighbour {
  node_id: string;
  label: string;
  relation_type: string;
  verb: string;
  glyph: string;
  /** Which way the book states it. */
  outgoing: boolean;
  sentence: string;
  citation: MindMapCitation | null;
}

/** One hop of a trace. `sentence` is the BOOK'S, not the service's. */
export interface TraceStep {
  from_id: string;
  to_id: string;
  from_label: string;
  to_label: string;
  relation_type: string;
  verb: string;
  sentence: string;
  citation: MindMapCitation | null;
}

/**
 * How two concepts connect, as a chain of the book's own sentences.
 *
 * `found: false` is a 200 and a real answer about the corpus, not an error:
 * most pairs genuinely have no stated link. No prose is manufactured to cover
 * it, and the UI must not either.
 */
export interface TracePath {
  found: boolean;
  steps: TraceStep[];
  note: string;
}

export type DrillKind = 'label' | 'relation' | 'placement';

export interface DrillItem {
  id: string;
  kind: DrillKind;
  node_id: string;
  /**
   * Always the book's characters. Fetched without answers, a `label` or
   * `placement` prompt arrives already masked; a `relation` prompt is the
   * sentence that states the link, and is meant to be read.
   */
  prompt: string;
  /**
   * The sentence with a gap, as it should be rendered. For a `relation` item it
   * is the pair instead, `Glucose  ____  Pyruvate`.
   */
  masked_prompt: string;
  /**
   * Multiple choice when supplied; empty means free recall, which is what a
   * `label` drill is. A `placement` item's distractors are real labels from
   * this chapter, so a wrong option is still true of the book somewhere, which
   * is what makes the discrimination worth making. A `relation` item's options
   * are the raw relation types, to be said with `relation_grammar`.
   */
  options: string[];
  /** Empty when the drill was fetched with `with_answers=false`. */
  answer: string;
  topic_id: string;
  topic_label: string;
  atom_type: string | null;
  citation: MindMapCitation | null;
  examinability: number;
}

export interface Drill {
  section_id: string;
  seed: number;
  kind: DrillKind;
  items: DrillItem[];
  selection_basis: string;
  grading_basis: string;
  with_answers: boolean;
}

export type DrillVerdict = 'correct' | 'partial' | 'incorrect';

export interface DrillItemResult {
  item_id: string;
  node_id: string;
  verdict: DrillVerdict;
  similarity: number;
  given: string;
  expected: string;
  /** The book's sentence and page, returned WITH the verdict: being told you are wrong and being shown where the answer lives are one interaction. */
  citation: MindMapCitation | null;
  evidence: string;
}

export interface DrillResult {
  section_id: string;
  kind: DrillKind;
  scored: number;
  correct: number;
  partial: number;
  incorrect: number;
  /** `correct + 0.5 * partial` over `scored`, stated by the server so two surfaces cannot report two scores. */
  score: number;
  results: DrillItemResult[];
  /**
   * `node_id -> 0.0 | 0.5 | 1.0`. THE MASTERY SEAM. The engine holds no learner
   * state; this is the shape an LMS persists and feeds back. emerge-core records
   * it while relaying the grade, when the viewer is tracked and may write
   * mastery. The client writes none of it.
   */
  node_scores: Record<string, number>;
  grading_basis: string;
}

export interface DrillGrade {
  result: DrillResult;
  recorded: boolean | null;
}

/** The body `POST /map/{section_id}/drill/grade` expects. */
export interface DrillGradeRequest {
  kind: DrillKind;
  n: number;
  seed: number;
  topic_id?: string;
  /** `item_id -> the student's text`. */
  answers: Record<string, string>;
}

/**
 * `GET /chapters`, a thin forward of the retrieval engine's `GET /syllabus/tree`.
 *
 * `structure` matters: the engine refuses to call a `flat` document mappable,
 * because a fallback structure is not a syllabus. Only offer chapters from a
 * document whose structure is a real one.
 */
export interface ChapterNode {
  id: string;
  parent_id?: string | null;
  title: string;
  order?: number;
  path?: string;
  page_range?: [number, number] | null;
  page_start?: number | null;
  page_end?: number | null;
  chunks?: number;
  blocks?: number;
  children?: number;
  number?: string;
  detection_method?: string;
  label?: string;
  display?: string;
  display_label?: string;
  tags?: string[];
}

export interface ChapterDocument {
  document_id: string;
  title: string;
  source_type?: string;
  subject?: string | null;
  grade?: number | null;
  scope?: string;
  structure?: string;
  structure_reason?: string;
  structure_note?: string;
  sections: ChapterNode[];
}

export interface ChaptersResponse {
  documents: ChapterDocument[];
  total_sections?: number;
}

export interface MindmapBook {
  id: string;
  title?: string;
  kind?: string;
  subject_id?: string | null;
  grade_level_id?: string | null;
  index_status?: string;
  mindmap_state: string;
}

export interface MindmapBooksPage {
  rows: MindmapBook[];
  count: number;
  page: PageInfo;
}

export interface MindmapNotIndexedDetails {
  index_status?: string;
  mindmap_state?: string;
}

export interface CurriculumMindmapSection {
  section_id: string;
  display: string;
  page_start: number | null;
  page_end: number | null;
  overlap_pages: number | null;
}

export interface CurriculumMindmap {
  content_item_id: string;
  title?: string;
  placement_id: string;
  inherited: boolean;
  page_start: number | null;
  page_end: number | null;
  mindmap_state: string;
  match_basis: string;
  sections: CurriculumMindmapSection[];
}

export interface CurriculumMindmapsResponse {
  curriculum_node_id: string;
  kind: string;
  mindmaps: CurriculumMindmap[];
  count: number;
}
