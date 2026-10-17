import { ROUTE_BY_FEATURE, ROUTE_INDEX, ROUTES } from '@/routes/registry';
import { resolveFeature } from '@/lib/entitlement/resolve-key';
import { personaLens } from '@/lib/persona/select';
import { hiddenFor } from '@/lib/nav/persona-hidden';
import { titleFor } from '@/lib/nav/title';
import { paths } from '@/paths';
import type { FeatureKey } from '@/constants/features';
import type { EntitlementSnapshot, UiState } from '@/types/entitlement';
import type { NavItem, RouteNode } from '@/types/nav';

/**
 * Build the navigation from `registry ∩ entitlements`, ordered by the persona.
 *
 * The critical property: a route the user does not hold produces NO NavItem at
 * all, so it never reaches the DOM. It is not hidden with CSS and not rendered
 * disabled — a disabled control still discloses that a feature exists.
 *
 * `disabled` and `needs_scope` items ARE emitted, because both mean the user
 * genuinely holds the feature and is better served by seeing it. That now
 * covers four CAS reasons rather than one: `kill_switch`, `disabled`,
 * `grant_off` and `feature_group_off` all mean "yours, currently inert". No
 * explanatory text rides along: a disabled row already reads as disabled, and a
 * second line of prose per row is noise in a menu.
 *
 * Ordering comes from the persona lens, which lists everything held with the
 * persona's priorities first. It decides sequence, never existence — see
 * `personaLens` for why that distinction is load-bearing.
 *
 * # What decides that something belongs in the sidebar
 *
 * Membership of THIS registry, and nothing else. The previous version tested
 * `key.split('.').length === 2`, inferring "is a section" from key depth, which
 * silently made a nested sidebar entry impossible to express: `emerge.learning`
 * qualified and `emerge.learning.mindmap` was assumed to be a widget. Placement
 * is now declared, sidebar keys in the route registry and widget keys in the
 * widget registry, and depth means only depth.
 */
export function buildNav(snapshot: EntitlementSnapshot, personaSlug: string): NavItem[] {
  // Every route's state is RESOLVED, not looked up. A nested sidebar key CAS
  // has no row for is never evaluated and so has no entry of its own; it
  // inherits its nearest registered ancestor, exactly as a widget does. Reading
  // `snapshot.entries` directly made such a row vanish, which contradicted the
  // documented inheritance and was invisible only because every nested key
  // happened to be registered.
  const stateOf = (feature: FeatureKey): UiState => (hiddenFor(personaSlug, feature) ? 'hidden' : resolveFeature(snapshot, feature).state);

  // Every SIDEBAR key the user holds, at any depth. Widget keys are excluded
  // because the lens orders the sidebar and a panel has no row to order: this
  // is what the old `key.split('.').length === 2` test was really reaching for,
  // said in terms of placement instead of depth.
  const held = new Set<FeatureKey>();
  for (const { node } of ROUTE_BY_FEATURE.values()) {
    if (stateOf(node.feature) !== 'hidden') held.add(node.feature);
  }

  const lens = personaLens(personaSlug, held);
  const order = new Map(lens.map((key, index) => [key, index]));
  const rank = (feature: FeatureKey): number =>
    order.get(feature) ?? Number.MAX_SAFE_INTEGER;

  const build = (
    nodes: readonly RouteNode[],
    parentPath: string,
    depth: number,
  ): { item: NavItem; feature: FeatureKey }[] => {
    const out: { item: NavItem; feature: FeatureKey }[] = [];

    for (const node of nodes) {
      const state = stateOf(node.feature);
      const path = [parentPath, node.path].filter(Boolean).join('/');

      // Not held, or not surfaced here: contribute nothing of our own, but do
      // not orphan visible children — revoking a section header should not take
      // working routes down with it. The children are rebuilt at THIS depth so
      // they render as top-level rows rather than as orphans indented under
      // nothing.
      if (state === 'hidden' || !node.inNav) {
        out.push(...(node.children ? build(node.children, path, depth) : []));
        continue;
      }

      const children = node.children ? build(node.children, path, depth + 1) : [];
      const hasPage = ROUTE_INDEX.get(node.key)?.hasPage ?? true;

      // A group with no page and nothing left to disclose is not a control, it
      // is an empty box. Drop it rather than render a chevron that opens onto
      // nothing, which is what a revoked branch would otherwise leave behind.
      if (!hasPage && children.length === 0) continue;

      out.push({
        feature: node.feature,
        item: {
          key: node.key,
          title: titleFor(node, personaSlug),
          href: hasPage
            ? path
              ? paths.personaSection(personaSlug, path)
              : paths.persona(personaSlug)
            : null,
          icon: node.icon,
          state,
          depth,
          // Children are already sorted by the recursive call.
          children: children.map((c) => c.item),
        },
      });
    }

    // Sorted here, where each item's feature key is still in hand. The previous
    // version re-derived it with a recursive search of the whole registry from
    // inside the comparator — O(n²) with a tree walk per comparison, for a
    // value that was available three lines earlier.
    return out.sort((a, b) => rank(a.feature) - rank(b.feature));
  };

  return build(ROUTES, '', 0).map((entry) => entry.item);
}

/**
 * The keys of every nav item on the branch leading to `href`, plus the item at
 * it. The sidebar opens exactly these groups on first paint.
 *
 * Computed from the nav rather than from the URL string so a path that happens
 * to prefix another (`/p/x/learning` and `/p/x/learning-lab`) cannot open the
 * wrong branch: the comparison is per item, on whole hrefs. A pageless group
 * has a null href and so never matches directly; it is on the trail only by way
 * of the child that does.
 */
// The row a page belongs to: its own, or for a page below a row (a class, a room, a year) the deepest row above it.
export function activeHref(items: readonly NavItem[], pathname: string): string {
  let best = '';
  const walk = (nodes: readonly NavItem[]): void => {
    for (const node of nodes) {
      const href = node.href;
      if (href && (pathname === href || pathname.startsWith(`${href}/`)) && href.length > best.length) best = href;
      walk(node.children);
    }
  };
  walk(items);
  return best || pathname;
}

export function navTrail(items: readonly NavItem[], pathname: string): string[] {
  const walk = (nodes: readonly NavItem[]): string[] | null => {
    for (const node of nodes) {
      if (node.href === pathname) return [node.key];
      const below = walk(node.children);
      if (below) return [node.key, ...below];
    }
    return null;
  };
  return walk(items) ?? [];
}
