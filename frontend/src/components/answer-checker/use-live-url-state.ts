'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

let issued: string | null = null;

export function useLiveUrlState(): {
  get: (key: string) => string | null;
  put: (changes: Record<string, string | null>) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.toString();

  React.useEffect(() => {
    if (issued === current) issued = null;
  }, [current]);

  const put = React.useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(issued ?? window.location.search);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      issued = query;
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const get = React.useCallback((key: string) => params.get(key), [params]);

  return { get, put };
}
