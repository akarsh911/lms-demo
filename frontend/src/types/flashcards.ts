/**
 * `lms-flashcard-engine` wire types, transcribed from `docs/API.md` and
 * `flashcard_engine/api.py`.
 *
 * # Two fields a consumer is REQUIRED to read, and the reason for each
 *
 * `grounding.no_good_match` arrives **with** a populated `cards` array. It means
 * the library found nothing that grounds this selection. A UI that renders the
 * deck and ignores the flag shows a student cards built from irrelevant
 * material, confidently.
 *
 * `judged_by` says which instrument marked an answer, and they are not equally
 * strong. `lexical` is word overlap with no judge available: it may say correct,
 * it never says incorrect. Presenting a `lexical` verdict with the same weight
 * as a `gemini` one tells a student they failed a coin-flip.
 */

export type RevisionStyle =
  | 'mixed'
  | 'conceptual'
  | 'definitions'
  | 'formulas'
  | 'application'
  | 'exam';

export type FocusMode = 'all' | 'important' | 'weak';

export type CardStyle =
  | 'definition'
  | 'recall'
  | 'concept'
  | 'process'
  | 'formula'
  | 'application'
  | 'compare'
  | 'cause_effect'
  | 'reasoning'
  | 'exam';

export type CardDifficulty = 'easy' | 'medium' | 'hard';

export type CardImportance = 'high' | 'medium' | 'normal';

/**
 * The student's options. Everything is optional, so a caller written against the
 * original contract keeps working.
 *
 * `chapter` accepts a section id or a chapter title. Naming a `topic` turns the
 * request into a SEARCH within that chapter rather than a sweep of it.
 */
export interface FlashcardSpec {
  title?: string;
  subject?: string;
  grade?: number;
  language?: string;
  /** Null falls back to the engine's own default. */
  count?: number;
  chapter?: string;
  topic?: string;
  revision_style?: RevisionStyle;
  /** `important` means what past papers actually asked. */
  focus?: FocusMode;
  use_notes?: boolean;
  /** Past papers are read as EVIDENCE of what gets examined, never as content. */
  use_pyq?: boolean;
  /** Caller-supplied. This service tracks no learner. */
  weak_concepts?: string[];
  styles?: CardStyle[];
  difficulty?: CardDifficulty | null;
  difficulty_mix?: Partial<Record<CardDifficulty, number>> | null;
  include_explanations?: boolean;
  allow_images?: boolean;
  use_vision?: boolean;
  must_cover_concepts?: string[];
  seed?: number;
}

/** Where the deck should be built from, when the engine runs retrieval itself. */
export interface FlashcardLocator {
  mode?: 'FETCH' | 'SEARCH';
  document_id?: string;
  chapter?: string;
  concept_ids?: string[];
  query?: string;
  subject?: string;
  grade?: number;
  grade_fallback?: boolean;
  top_k?: number;
  budget_tokens?: number;
}

export interface FlashcardCitation {
  document_title: string;
  document_id: string | null;
  chunk_id: string;
  page_range: [number, number] | null;
  paragraph_range: [number, number] | null;
  time_range: [number, number] | null;
  render: string | null;
  confidence: number;
  support_score: number | null;
}

/**
 * A diagram on a card. Null when none is available.
 *
 * `reference` is fetched by the BROWSER straight from the retrieval engine: the
 * image never passes through the flashcard service. It is populated only after a
 * blob-existence check, so a card carrying a visual is one whose picture loads.
 */
export interface FlashcardVisual {
  type: string;
  reference: string;
  alt_text: string;
  chunk_id: string;
}

export interface Flashcard {
  id: string;
  style: CardStyle;
  difficulty: CardDifficulty;
  front: string;
  back: string;
  explanation: string | null;
  hint: string | null;
  citations: FlashcardCitation[];
  visual: FlashcardVisual | null;
  figure_refs: string[];
  subject: string | null;
  chapter: string | null;
  section_id: string | null;
  topic: string | null;
  /** `high` means a previous-year paper examined this. Evidence, not a label a model chose. */
  importance: CardImportance;
  source_role: string | null;
  source_excerpt: string;
  pyq_backed: boolean;
  concept_ids: string[];
}

/** How well the deck is anchored in the corpus. Reported, never targeted. */
export interface DeckGrounding {
  checked: number;
  dropped: number;
  avg_support: number;
  /** READ THIS. See the header. Arrives alongside populated `cards`. */
  no_good_match: boolean;
  /** Null means the engine reported none, which differs from zero. */
  retrieval_confidence: number | null;
  passages_used: number;
  passages_dropped_ungroundable: number;
  dropped_quality: number;
}

/** How the student's options became a retrieval request. Auditable on purpose. */
export interface DeckRetrievalPlan {
  mode: 'FETCH' | 'SEARCH';
  document_id: string | null;
  section_ids: string[];
  query: string | null;
  source_types: string[];
  concept_ids: string[];
  top_k: number;
  /** Plain-language reasons, written for a student. Worth surfacing. */
  rationale: string[];
}

export interface FlashcardDeck {
  id: string;
  title: string;
  subject: string | null;
  grade: number | null;
  language: string;
  total_cards: number;
  /** Below `total_cards` means the source was thin, reported honestly rather than padded. */
  requested_cards: number;
  chapter: string | null;
  topic: string | null;
  style_counts: Record<string, number>;
  generator: string;
  grounding: DeckGrounding;
  retrieval: DeckRetrievalPlan | null;
  cards: Flashcard[];
  warnings: string[];
  timing_ms: Record<string, number>;
}

/**
 * `needs_review` is NOT a fourth grade on the same scale. It is what the engine
 * returns when it could not decide: an inconclusive word count with no judge, or
 * nothing submitted. Rendering it as "wrong" is a lie about a coin-flip.
 */
export type AnswerVerdict = 'correct' | 'almost' | 'incorrect' | 'needs_review';

/** Which instrument marked the answer. See the header on why they differ. */
export type JudgedBy = 'gemini' | 'verbatim' | 'lexical' | 'none';

export interface AnswerEvaluation {
  verdict: AnswerVerdict;
  /** UNDERSTANDING, 0..1. Not word overlap. */
  score: number;
  /** Word overlap. A diagnostic, never the verdict. Divergence from `score` means the student answered in their own words. */
  lexical_score: number;
  answer: string;
  expected: string;
  matched_concepts: string[];
  missing_concepts: string[];
  /** Things asserted that are WRONG, as opposed to merely absent. Only a judge can populate it. */
  incorrect_claims: string[];
  feedback: string;
  judged_by: JudgedBy;
  review_recommended: boolean;
  card_id: string | null;
  deck_id: string | null;
  timing_ms: Record<string, number>;
}

/** One attempt, as `POST /decks/{id}/report` expects it. */
export interface DeckAttempt {
  card_id: string;
  verdict: AnswerVerdict;
  score?: number;
  answer?: string;
}

export interface ReportTopic {
  label: string;
  cards: number;
  correct: number;
}

export interface ReportAnswer {
  card_id: string;
  question: string;
  your_answer: string;
  correct_answer: string;
  verdict: AnswerVerdict | null;
  attempted: boolean;
}

/**
 * A pure function of one deck and one set of attempts: no model call, nothing
 * persisted, no inference about the learner.
 *
 * `accuracy` is over what was ATTEMPTED, not over the deck, and skipping is not
 * a wrong answer. A topic below the engine's minimum card count appears in
 * neither list, because missing one card is a bad minute, not a weak area.
 */
export interface DeckReport {
  deck_id: string;
  title: string;
  attempted: number;
  correct: number;
  almost: number;
  incorrect: number;
  needs_review: number;
  unanswered: number;
  unanswered_card_ids: string[];
  accuracy: number;
  strong: ReportTopic[];
  needs_practice: ReportTopic[];
  biggest_mistake: string | null;
  recommendation: string;
  retry_card_ids: string[];
  answers: ReportAnswer[];
}

/**
 * `GET /catalog`. A thin projection of the retrieval engine's syllabus tree,
 * shaped so a `chapter` here pastes straight into a `FlashcardSpec`.
 *
 * Only sections that actually hold chunks appear: a parent node with none is a
 * heading, and offering it would produce an empty deck.
 */
export interface CatalogChapter {
  id: string;
  title: string;
  document_id: string | null;
  document_title: string | null;
  source_type: string | null;
  grade: number | null;
  cards_available: number;
}

export interface CatalogSubject {
  subject: string;
  chapters: CatalogChapter[];
}

export interface CatalogResponse {
  subjects: CatalogSubject[];
}

/** `POST /generate/from-retrieval`. The engine plans and runs retrieval itself. */
export interface GenerateFromRetrievalRequest {
  spec: FlashcardSpec;
  locator: FlashcardLocator;
}

export interface FlashcardEngineError {
  error: string;
  detail: string;
}

export interface DocumentPageText {
  document_id: string;
  title: string;
  page: number;
  text: string;
  blocks: number;
  extraction_sources: string[];
  excluded_blocks: number;
  allowed_extraction_sources: string[];
}
