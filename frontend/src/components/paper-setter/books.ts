import type { ComposeBook } from './contract';

export type BookSetState = 'not_reported' | 'none_needed' | 'reported';

export interface BookSet {
  state: BookSetState;
  books: ComposeBook[];
  unresolved: ComposeBook[];
  sentence: string;
}

export const BOOKS_NOT_REPORTED =
  'The paper service has not yet reported which books this paper would draw from. That ' +
  'is a step nothing writes yet rather than a finding about your library: a unit stands ' +
  'for a book, and the books are worked out from the units your chapters sit in. The ' +
  'units themselves are listed on the previous step.';

export const BOOKS_NONE_NEEDED =
  'This curriculum has no units, so there is one book behind it and the paper draws ' +
  'from that. Nothing has to be chosen.';

export function listSentence(titles: readonly string[]): string {
  if (titles.length === 0) return '';
  if (titles.length === 1) return titles[0]!;
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`;
}

export function bookSetOf(
  books: readonly ComposeBook[] | undefined,
  hasUnits: boolean,
): BookSet {
  if (books === undefined) {
    return { state: 'not_reported', books: [], unresolved: [], sentence: BOOKS_NOT_REPORTED };
  }

  if (books.length === 0) {
    return {
      state: hasUnits ? 'not_reported' : 'none_needed',
      books: [],
      unresolved: [],
      sentence: hasUnits ? BOOKS_NOT_REPORTED : BOOKS_NONE_NEEDED,
    };
  }

  const unresolved = books.filter((book) => !book.resolved);
  const titles = books.map((book) => book.title);

  return {
    state: 'reported',
    books: [...books],
    unresolved,
    sentence:
      books.length === 1
        ? `This paper draws from ${titles[0]}.`
        : `This paper draws from ${listSentence(titles)} — one book per unit you selected.`,
  };
}

export type BookTroubleCode =
  | 'not_in_library'
  | 'index_deferred'
  | 'no_document_identity'
  | 'not_stated';

export interface BookTrouble {
  code: string;
  label: string;
  sentence: string;
  whose: 'teacher' | 'school' | 'platform' | 'nobody';
}

const BOOK_TROUBLES: Record<string, BookTrouble> = {
  not_in_library: {
    code: 'not_in_library',
    label: 'Not held here',
    sentence:
      'This curriculum names a book your school does not hold, so there is nothing to take questions from. Somebody has to add it to the library, or map these chapters to a book you do hold.',
    whose: 'school',
  },
  index_deferred: {
    code: 'index_deferred',
    label: 'Held, but not matchable yet',
    sentence:
      'Your school holds this book and it is fully ingested. What is missing is its search index, and without that the paper service has no id to match it by — so it cannot be used to set a paper even though nothing about it is lost. This is not yours to fix; ask for that book to be indexed.',
    whose: 'platform',
  },
  no_document_identity: {
    code: 'no_document_identity',
    label: 'The mapping names no book',
    sentence:
      'The mapping for these chapters records no identifier for a book at all — neither a library item nor a search id — so there is nothing to look up. Your library may well hold the right book; what is missing is the mapping that says which one. Somebody has to point these chapters at it.',
    whose: 'school',
  },
  not_stated: {
    code: 'not_stated',
    label: 'Could not be matched',
    sentence:
      'The paper service could not match this book and did not say why. It may be absent from your library, it may be held with its index still pending, or these chapters may never have been mapped to a book at all — those are three different problems and only some of them are anybody at your school’s to solve, so it is worth asking before acting.',
    whose: 'nobody',
  },
};

export function bookTroubleFor(reason: string | undefined): BookTrouble {
  if (reason === undefined || reason === '') return BOOK_TROUBLES.not_stated!;
  return BOOK_TROUBLES[reason] ?? { ...BOOK_TROUBLES.not_stated!, code: reason };
}

export function bookTroubleOf(book: ComposeBook): BookTrouble {
  return bookTroubleFor(book.reason);
}

export function bookTroublesFor(reasons: readonly string[] | undefined): BookTrouble[] {
  if (!reasons || reasons.length === 0) return [];
  const seen = new Map<string, BookTrouble>();
  for (const reason of reasons) {
    const trouble = bookTroubleFor(reason);
    if (!seen.has(trouble.code)) seen.set(trouble.code, trouble);
  }
  return [...seen.values()];
}

export function bookTroubles(unresolved: readonly ComposeBook[]): BookTrouble[] {
  const seen = new Map<string, BookTrouble>();
  for (const book of unresolved) {
    const trouble = bookTroubleOf(book);
    if (!seen.has(trouble.code)) seen.set(trouble.code, trouble);
  }
  return [...seen.values()];
}

export function bookLabel(book: ComposeBook): string {
  return book.title || book.unit_title || bookKey(book);
}

export function bookKey(book: ComposeBook): string {
  const itemId = book.content_item_id ?? '';
  if (itemId !== '') return itemId;
  if (book.id !== '') return book.id;
  if (book.unit_id !== '') return book.unit_id;
  return book.unit_title;
}

export function unresolvedBookSentence(unresolved: readonly ComposeBook[]): string | null {
  if (unresolved.length === 0) return null;
  const titles = unresolved.map(bookLabel);

  const missing = unresolved.filter(
    (book) => bookTroubleOf(book).code === 'not_in_library',
  );

  if (missing.length === unresolved.length) {
    return unresolved.length === 1
      ? `${titles[0]} is not held by your school, so the paper service will refuse to set this paper rather than compose one missing everything from it.`
      : `${listSentence(titles)} are not held by your school, so the paper service will refuse to set this paper rather than compose one missing everything from them.`;
  }

  return unresolved.length === 1
    ? `${titles[0]} could not be matched, so the paper service will refuse to set this paper rather than compose one missing everything from it. The reason is below, and it may not be anything your school has done.`
    : `${listSentence(titles)} could not be matched, so the paper service will refuse to set this paper rather than compose one missing everything from them. The reasons are below, and they may not be anything your school has done.`;
}
