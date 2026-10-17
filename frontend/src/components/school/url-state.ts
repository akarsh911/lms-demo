'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Screen state that belongs in the URL.
 *
 * Which branch, which scheme, which class, which week: all of it is where a
 * user IS, not what they have typed, so it goes in the query string. That makes
 * a half-built timetable a link somebody can send to the colleague who knows
 * the answer, and it survives the back button.
 *
 * `router.replace` rather than `push`, for the same reason the roster does it:
 * changing a filter is not a navigation, and a history stack of thirty filter
 * states makes Back useless.
 */
export function useUrlState(): {
  get: (key: string) => string | null;
  put: (changes: Record<string, string | null>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const put = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const get = React.useCallback((key: string) => params.get(key), [params]);

  return { get, put };
}
