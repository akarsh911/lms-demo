import type { FeatureKey } from '@/constants/features';
import type { UiState } from './entitlement';

/**
 * A node in the route registry — the single source of truth binding a URL to a
 * CAS feature key. Every post-auth route has one, and `feature` is REQUIRED:
 * a route with no key would be reachable by anyone, and an optional field makes
 * that an easy accident.
 *
 * Every node in this registry has `placement: 'sidebar'` by definition. A
 * `widget` placement has no URL and lives in the widget registry instead.
 */
export interface RouteNode {
  /** Stable id, unique across the registry. */
  key: string;
  /** The CAS feature key gating this route. Required, and a closed union. */
  feature: FeatureKey;
  /** Display title in navigation. */
  title: string;
  /** The same place named for one persona, e.g. Learning read as AI plugins by a teacher. */
  titles?: Readonly<Partial<Record<string, string>>>;
  /**
   * ONE path segment, relative to the PARENT node. No slashes.
   *
   * The full URL is assembled by the registry: a child of `learning` declaring
   * `mindmap` is served at `/p/{persona}/learning/mindmap`. Declaring the full
   * path on each child instead was the obvious alternative and is worse: it
   * lets a child claim a path outside its parent, which produces a nav item
   * nested under one thing and a URL nested under another.
   *
   * Empty string is legal for exactly one node: the persona root.
   */
  path: string;
  /** Icon name, resolved through `components/navbars/nav-icons.tsx`. */
  icon: string;
  /** Whether it appears in the sidebar. Some routes are reachable but unlisted. */
  inNav: boolean;
  // One line under the page title saying what the page is for, optionally worded per persona.
  description?: string;
  descriptions?: Readonly<Partial<Record<string, string>>>;
  /**
   * Nested sidebar entries. A child is a place in its own right with its own
   * URL and its own CAS key, not a panel. Panels are widgets.
   */
  children?: RouteNode[];
}

/**
 * A registry node with everything derived from its position resolved once, at
 * module load, rather than re-walked by each consumer.
 */
export interface RouteRecord {
  node: RouteNode;
  /** Full path below the persona root, e.g. `learning/mindmap`. `''` is Home. */
  path: string;
  /** Keys of every ancestor, outermost first. Empty at the top level. */
  trail: readonly string[];
  /** 0 for a top-level entry. */
  depth: number;
  /**
   * Whether this node is a place you can open, or only a group you can expand.
   *
   * DERIVED, never declared. A node has a page when it is a leaf, or when it
   * owns at least one widget key. A node whose every child is itself a sidebar
   * route owns no content of its own, so there would be nothing on its page but
   * a list of links the sidebar is already showing. Those nodes are pure
   * disclosure controls: no URL, no route, and the whole row toggles.
   */
  hasPage: boolean;
}

/** A registry node resolved against a user's entitlements, ready to render. */
export interface NavItem {
  key: string;
  title: string;
  /**
   * `null` for a group with no page of its own, which is then a disclosure
   * control and nothing else. Nullable rather than optional so every call site
   * has to decide what a group does.
   */
  href: string | null;
  icon: string;
  state: UiState;
  /** 0 for a top-level entry. Drives indentation, nothing else. */
  depth: number;
  children: NavItem[];
}
