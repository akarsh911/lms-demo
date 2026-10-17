import type { Refusal } from './contract';
import { unplaceableReasons } from './availability';
import { bookTroublesFor } from './books';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function c6RefusalFrom(payload: unknown): Refusal | null {
  const body = asRecord(payload);
  if (!body) return null;
  const envelope = asRecord(body.error);
  if (!envelope) return null;

  const code = envelope.code;
  const message = envelope.message;
  if (typeof code !== 'string' || code === '') return null;
  if (typeof message !== 'string' || message.trim() === '') return null;

  return { code, message, detail: asRecord(envelope.detail), signedOut: false };
}

export const NOT_SIGNED_IN_CODE = 'not-signed-in';

export const SIGN_IN_AGAIN =
  'Your sign-in has expired, so the paper service would not answer. Nothing you have ' +
  'chosen has been lost. Sign in again and come back to this step.';

export function middlewareRefusalFrom(status: number, payload: unknown): Refusal | null {
  if (status !== 401) return null;
  const body = asRecord(payload);
  const code = body?.code;
  const detail = body?.detail;

  return {
    code: typeof code === 'string' && code !== '' ? code : NOT_SIGNED_IN_CODE,
    message: SIGN_IN_AGAIN,
    detail: typeof detail === 'string' ? { detail } : asRecord(detail),
    signedOut: true,
  };
}

export function refusalFrom(status: number, payload: unknown): Refusal | null {
  const signedOut = status === 401;
  const envelope = c6RefusalFrom(payload);

  if (signedOut) {
    const middleware = middlewareRefusalFrom(status, payload);
    if (!middleware) return null;
    return envelope
      ? { ...envelope, signedOut: true }
      : middleware;
  }

  return envelope;
}

export function reasonsFrom(refusal: Refusal | null): string[] {
  const reasons = refusal?.detail?.reasons;
  if (!Array.isArray(reasons)) return [];
  return reasons.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
}

function namesAnIdentifier(key: string): boolean {
  return key.endsWith('_id') || key.endsWith('_ids');
}

export function offendingIds(refusal: Refusal | null): string[] {
  if (!refusal?.detail) return [];
  return Object.entries(refusal.detail).flatMap(([key, value]) => {
    if (!namesAnIdentifier(key)) return [];
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string');
    }
    return [];
  });
}

export const BOOK_NOT_HERE = 'book_not_here';
export const BOOK_INDEX_DEFERRED = 'book_index_deferred';
export const WEIGHTS_REACH_NO_CHAPTER = 'weights_reach_no_chapter';

export const BOOK_REFUSAL_CODES: readonly string[] = [BOOK_NOT_HERE, BOOK_INDEX_DEFERRED];

const REFUSAL_HEADLINE: Record<string, string> = {
  book_not_here: 'A book this curriculum points at is not held here',
  book_index_deferred: 'The book behind this paper is waiting to be indexed',
  no_class: 'This paper needs a class',
  no_paper_shape: 'Nothing says what shape this paper is',
  several_paper_shapes: 'Two things are describing the shape of this paper',
  curriculum_unreachable: 'Your school records could not be reached',
  curriculum_node_inactive: 'A retired topic is still in this selection',
  curriculum_has_no_nodes: 'This curriculum has nothing in it',
  curriculum_not_found: 'That curriculum could not be found',
  curriculum_ambiguous: 'More than one curriculum answers to that',
  curriculum_field_withheld: 'Part of this curriculum is being withheld',
  unknown_kind: 'That is not a kind of paper this school sets',
  unknown_preset: 'That pattern is not one this school has',
  no_curriculum: 'No curriculum was named',
  no_material: 'Nothing you selected has material behind it',
  curriculum_node_malformed: 'A chapter or topic is not shaped the way a curriculum should be',
  node_not_in_curriculum: 'A chapter is not part of this curriculum',
  all_zero_weights: 'Every share is zero',
  foreign_weight_node: 'A share names something that is not selected',
  negative_weight: 'A share cannot be negative',
  weights_reach_no_chapter: 'This weighting reaches no chapter',
  cannot_set_this_paper: 'This paper cannot be set',
  forbidden: 'Your school does not permit this',
  'not-signed-in': 'Your sign-in has expired',
};

export function headlineFor(refusal: Refusal, fallback: string): string {
  return REFUSAL_HEADLINE[refusal.code] ?? fallback;
}

export interface NamedReason {
  code: string;
  label: string;
  sentence: string;
}

export function namedReasonsOf(refusal: Refusal): NamedReason[] {
  const reasons = reasonsFrom(refusal);
  if (reasons.length === 0) return [];
  if (BOOK_REFUSAL_CODES.includes(refusal.code)) return bookTroublesFor(reasons);
  if (refusal.code === WEIGHTS_REACH_NO_CHAPTER) return unplaceableReasons(reasons);
  return [];
}
