import { resolveFeature } from '@/lib/entitlement/resolve-key';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import { isReachable, type EntitlementSnapshot } from '@/types/entitlement';

export interface TrailCrumb {
  key: string;
  title: string;
  href: string | null;
}

export const PEOPLE_ROUTE_KEY = 'people';

function hrefFor(slug: string, path: string): string {
  return path === '' ? paths.persona(slug) : paths.personaSection(slug, path);
}

export function peopleTrail(slug: string, snapshot: EntitlementSnapshot, list?: 'people-students' | 'people-teachers'): TrailCrumb[] {
  const people = ROUTE_INDEX.get(PEOPLE_ROUTE_KEY);
  if (!people) return [];

  const crumbFor = (key: string): TrailCrumb | null => {
    const record = ROUTE_INDEX.get(key);
    if (!record) return null;
    const reachable = isReachable(resolveFeature(snapshot, record.node.feature).state);
    return {
      key,
      title: record.node.title,
      href: record.hasPage && reachable ? hrefFor(slug, record.path) : null,
    };
  };

  return [...people.trail, PEOPLE_ROUTE_KEY, ...(list ? [list] : [])]
    .map(crumbFor)
    .filter((crumb): crumb is TrailCrumb => crumb !== null);
}
