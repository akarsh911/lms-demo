'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { ROSTER_PAGE_SIZE, isRosterKind, type RosterKind } from '@/constants/roster';

/**
 * Which slice of the roster is on screen: kind, search, page offset, and which
 * row is open.
 *
 * All four live in the URL, for the reasons `use-active-class.ts` sets out —
 * shareable, Back works, a refresh keeps the view. The roster adds one of its
 * own: emerge-core pages by OFFSET and reports no total, so "where am I" is a
 * number that cannot be recovered from anything else. Holding it in component
 * state would make the second page unlinkable.
 *
 * An unknown `kind` falls back to the first rather than erroring. It is a view
 * selector, not a resource: a stale link should open the roster, not a 404.
 */
export interface RosterParams {
  kind: RosterKind;
  q: string;
  offset: number;
  /** The row whose detail is open, or null. */
  selectedId: string | null;
}

export function useRosterParams(): RosterParams & {
  setKind: (kind: RosterKind) => void;
  setQuery: (q: string) => void;
  setOffset: (offset: number) => void;
  select: (id: string | null) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const rawKind = params.get('kind');
  const kind: RosterKind = isRosterKind(rawKind) ? rawKind : 'students';
  const q = params.get('q') ?? '';
  const rawOffset = Number.parseInt(params.get('offset') ?? '', 10);
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
  const selectedId = params.get('id');

  const put = React.useCallback(
    (changes: Record<string, string | null>): void => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      // `replace`, not `push`: typing in the search box would otherwise put one
      // history entry per keystroke and Back would walk the word backwards.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return {
    kind,
    q,
    offset,
    selectedId,
    // Changing the kind or the search resets the offset and closes the open
    // row. Keeping either would leave the user on page 4 of a list that may
    // have one page, looking at an empty result they did not cause.
    setKind: (next) => put({ kind: next, offset: null, id: null }),
    setQuery: (next) => put({ q: next, offset: null, id: null }),
    setOffset: (next) => put({ offset: next > 0 ? String(next) : null, id: null }),
    select: (id) => put({ id }),
  };
}

export { ROSTER_PAGE_SIZE };
