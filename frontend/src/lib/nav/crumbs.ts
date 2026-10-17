import { resolveFeature } from '@/lib/entitlement/resolve-key';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import { isReachable, type EntitlementSnapshot } from '@/types/entitlement';
import { titleFor } from '@/lib/nav/title';

export interface TrailCrumb {
  key: string;
  title: string;
  href: string | null;
}

// The breadcrumb for a page below a registry route: each ancestor is a link only if it has a page the user can reach.
export function crumbsFor(snapshot: EntitlementSnapshot, slug: string, routeKeys: readonly string[]): TrailCrumb[] {
  return routeKeys.flatMap((key) => {
    const record = ROUTE_INDEX.get(key);
    if (!record) return [];
    const reachable = isReachable(resolveFeature(snapshot, record.node.feature).state);
    const href = record.path === '' ? paths.persona(slug) : paths.personaSection(slug, record.path);
    return [{ key, title: titleFor(record.node, slug), href: record.hasPage && reachable ? href : null }];
  });
}
