'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { ScopeChoice, ScopePick } from './scope-model';

export const SCOPE_PARAMS = { grade: 'grade', sections: 'sections', learner: 'child', pick: 'pick', mine: 'mine' } as const;

const MINE_ON = '1';

const parsePick = (raw: string | null): ScopePick | undefined => (raw === 'grade' || raw === 'sections' ? raw : undefined);

const SECTION_SEPARATOR = ',';

function parseGrade(raw: string | null): number | null {
  if (!raw || !/^\d{1,2}$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

const parseSections = (raw: string | null): string[] =>
  (raw ?? '')
    .split(SECTION_SEPARATOR)
    .map((name) => name.trim())
    .filter((name, index, all) => name !== '' && all.indexOf(name) === index);

export function useScopeUrl(retired: readonly string[] = []): { choice: ScopeChoice; go: (next: ScopeChoice, how?: 'push' | 'replace') => void; carries: (key: string) => boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const gradeRaw = params.get(SCOPE_PARAMS.grade);
  const sectionsRaw = params.get(SCOPE_PARAMS.sections);
  const learner = params.get(SCOPE_PARAMS.learner);
  const pickRaw = params.get(SCOPE_PARAMS.pick);
  const mine = params.get(SCOPE_PARAMS.mine) === MINE_ON;

  const choice = React.useMemo<ScopeChoice>(() => {
    const pick = parsePick(pickRaw);
    return { grade: parseGrade(gradeRaw), sections: parseSections(sectionsRaw), learner: learner || null, ...(pick ? { pick } : {}), ...(mine ? { mine } : {}) };
  }, [gradeRaw, sectionsRaw, learner, pickRaw, mine]);

  const retiredKey = retired.join(',');
  const go = React.useCallback(
    (next: ScopeChoice, how: 'push' | 'replace' = 'push') => {
      const query = new URLSearchParams(window.location.search);
      const values: Record<string, string> = {
        [SCOPE_PARAMS.grade]: next.grade === null ? '' : String(next.grade),
        [SCOPE_PARAMS.sections]: next.sections.join(SECTION_SEPARATOR),
        [SCOPE_PARAMS.learner]: next.learner ?? '',
        [SCOPE_PARAMS.pick]: next.pick ?? '',
        [SCOPE_PARAMS.mine]: next.mine ? MINE_ON : '',
      };
      for (const [key, value] of Object.entries(values)) {
        if (value === '') query.delete(key);
        else query.set(key, value);
      }
      for (const key of retiredKey.split(',')) if (key) query.delete(key);
      const search = query.toString().replace(/%2C/gi, SECTION_SEPARATOR);
      const href = search ? `${pathname}?${search}` : pathname;
      if (how === 'replace') router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [pathname, router, retiredKey],
  );

  const carries = React.useCallback((key: string) => params.has(key), [params]);

  return { choice, go, carries };
}
