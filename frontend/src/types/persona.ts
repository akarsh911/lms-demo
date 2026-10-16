/**
 * A persona is a view over entitlements, never a permission. See
 * `constants/personas.ts` for why it cannot grant anything.
 */
export interface Persona {
  /** URL segment, from `slugifyRole(roleName)`. */
  slug: string;
  /** What the user is shown as their designation. */
  roleName: string;
  /** The group that conferred it. Documentation only — never matched on. */
  groupKey: string | null;
}
