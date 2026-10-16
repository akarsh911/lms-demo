/**
 * Wire types for the retrieval engine (`lms-retrieval-engine`, FastAPI).
 *
 * Shaped from live responses (`/books`, `/syllabus/sections/resolve`,
 * `/retrieve/scoped`), not from its docs, and trimmed to the fields this front
 * end reads. The engine returns more; extra fields are ignored rather than
 * modelled speculatively.
 *
 * The engine never authors content: it returns verbatim, cited passages. Always
 * branch on `no_good_match` where a response carries it, not on an empty list.
 */

export interface RetrievalBook {
  /** Document id, e.g. `doc_751e5031871a`. Changes if the book is re-ingested. */
  id: string;
  title: string;
  /** Matched exactly and case-sensitively by the engine: `Science`, not `science`. */
  subject: string;
  grade: number;
  language: string | null;
  publisher: string | null;
  sections: number;
  topics: number;
}

export interface BooksResponse {
  books: RetrievalBook[];
  subject: string | null;
  grade: number | null;
}

export interface SectionRef {
  /** Section id, e.g. `sec_80637f9b9258`. */
  id: string;
  document_id: string;
  document_title: string;
  parent_id: string | null;
  /** e.g. `11. Electricity`. */
  title: string;
  number: string | null;
  /** Often double-numbered (`11. 11. Electricity`); prefer `title` for display. */
  display: string;
  path: string;
  page_start: number | null;
  page_end: number | null;
}

export interface SectionResolveResponse {
  resolved?: SectionRef | null;
  candidates: SectionRef[];
  ambiguous: boolean;
  query: string;
}

export interface PassageCitation {
  document_title: string;
  /** Ready to show: `Science — Class 10 (NCERT), p.176 ¶4–13`. */
  render: string;
  page_range: [number, number] | null;
  paragraph_range: [number, number] | null;
  deeplink: string | null;
  confidence: number;
}

export interface EnrichedPassage {
  chunk_id: string;
  /** The text with a breadcrumb prefix. Search text, not display text. */
  text: string;
  /** Quotable text exactly as printed. What a student is shown. */
  verbatim_text: string;
  page: number | null;
  /** `exposition`, `front_matter`, `exercise`… */
  role: string;
  score: number;
  kind: 'text' | 'figure' | 'table';
  section_id: string | null;
  section_path: string | null;
  citation: PassageCitation;
}

export interface ScopedRetrieveRequest {
  document_ids?: string[];
  section_ids?: string[];
  query?: string;
  /** `['pdf']` keeps passages to text extracted from the printed page. */
  extraction_sources?: ('pdf' | 'ocr' | 'asr' | 'vlm' | 'synthetic')[];
  top_k?: number;
}

export interface ScopedRetrieveResponse {
  passages: EnrichedPassage[];
  total_in_scope: number;
  truncated: boolean;
  ranked: boolean;
}
