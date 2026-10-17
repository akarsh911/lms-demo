import type {
  BooksResponse,
  EnrichedPassage,
  RetrievalBook,
  ScopedRetrieveRequest,
  ScopedRetrieveResponse,
  SectionRef,
  SectionResolveResponse,
} from '@/types/retrieval';

import { CURRICULA, CURRICULUM_NODES } from './data/library';
import { GRADE_LEVELS, SUBJECTS } from './data/structure';

const DEFAULT_TOP_K = 8;
const PASSAGES_PER_SECTION = 3;

const gradeOf = (curriculumGradeId: string | undefined): number =>
  GRADE_LEVELS.find((g) => g.id === curriculumGradeId)?.sequence ?? 0;

const BOOKS: readonly RetrievalBook[] = CURRICULA.map((c) => {
  const nodes = CURRICULUM_NODES.filter((n) => n.curriculum_id === c.id);
  return {
    id: c.id,
    title: c.name ?? '',
    subject: SUBJECTS.find((s) => s.id === c.subject_id)?.name ?? '',
    grade: gradeOf(c.grade_level_id),
    language: 'English',
    publisher: 'NCERT',
    sections: nodes.filter((n) => n.kind === 'chapter').length,
    topics: nodes.filter((n) => n.kind === 'topic').length,
  };
});

const SECTIONS: readonly SectionRef[] = CURRICULUM_NODES.map((n, i) => {
  const book = BOOKS.find((b) => b.id === n.curriculum_id);
  const parent = CURRICULUM_NODES.find((p) => p.id === n.parent_id);
  const number = n.kind === 'chapter' ? String(n.sequence ?? '') : null;
  const start = 10 + (i % 40) * 8;
  return {
    id: n.id,
    document_id: n.curriculum_id ?? '',
    document_title: book?.title ?? '',
    parent_id: n.parent_id ?? null,
    title: n.title ?? '',
    number,
    display: number ? `Chapter ${number}: ${n.title}` : (n.title ?? ''),
    path: parent ? `${parent.title} > ${n.title}` : (n.title ?? ''),
    page_start: start,
    page_end: start + 7,
  };
});

const words = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function matchSections(query: string, documentId: string): SectionRef[] {
  const chapter = /chapter\s*(\d+)/i.exec(query)?.[1];
  const terms = words(query);
  return SECTIONS.filter((s) => s.document_id === documentId).filter((s) =>
    chapter ? s.number === chapter : terms.length > 0 && terms.every((t) => words(s.title).includes(t) || s.title.toLowerCase().includes(t)),
  );
}

function passagesFor(section: SectionRef): EnrichedPassage[] {
  return Array.from({ length: PASSAGES_PER_SECTION }, (_, i) => {
    const page = (section.page_start ?? 1) + i * 2;
    const text = `Fixture passage ${i + 1} for "${section.title}". This is sample text served by the dev bypass, not the book.`;
    return {
      chunk_id: `${section.id}:${i}`,
      text,
      verbatim_text: text,
      page,
      role: 'body',
      score: 0,
      kind: 'text' as const,
      section_id: section.id,
      section_path: section.path,
      citation: {
        document_title: section.document_title,
        render: `${section.document_title}, p. ${page}`,
        page_range: [page, page] as [number, number],
        paragraph_range: null,
        deeplink: null,
        confidence: 1,
      },
    };
  });
}

export function books(subject: string, grade: number): BooksResponse {
  const matched = BOOKS.filter(
    (b) => (!subject || b.subject.toLowerCase() === subject.toLowerCase()) && (!grade || b.grade === grade),
  );
  return { books: matched, subject, grade: grade || null };
}

// One match resolves; several are returned as candidates and marked ambiguous, as the engine does.
export function resolveSection(query: string, documentId: string): SectionResolveResponse {
  const candidates = matchSections(query, documentId);
  const [only] = candidates;
  return { resolved: candidates.length === 1 && only ? only : null, candidates, ambiguous: candidates.length > 1, query };
}

export function scoped(input: ScopedRetrieveRequest): ScopedRetrieveResponse {
  const bySection = new Set(input.section_ids ?? []);
  const byDocument = new Set(input.document_ids ?? []);
  const inScope = SECTIONS.filter((s) => (bySection.size > 0 ? bySection.has(s.id) : byDocument.size === 0 || byDocument.has(s.document_id)));
  const pool = inScope.flatMap(passagesFor);

  const terms = words(input.query ?? '');
  const scored = pool
    .map((p) => ({ ...p, score: terms.length === 0 ? 0 : terms.filter((t) => words(`${p.text} ${p.section_path}`).includes(t)).length / terms.length }))
    .sort((a, b) => b.score - a.score);
  const topK = input.top_k ?? DEFAULT_TOP_K;
  return { passages: scored.slice(0, topK), total_in_scope: pool.length, truncated: pool.length > topK, ranked: terms.length > 0 };
}
