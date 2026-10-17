import {
  OPERATOR_LABEL,
  OPERATOR_SLUG,
  PERSONA_PRESETS,
  ROLE_BEARING_GROUPS,
  slugifyRole,
} from '@/constants/personas';
import type { FeatureKey } from '@/constants/features';
import type { GroupRef } from '@/types/cas';
import type { Persona } from '@/types/persona';

/**
 * ADAPTER BOUNDARY.
 *
 * Today a persona is derived from group membership using a table in
 * `constants/personas.ts`, because CAS has no role concept. When
 * `groups.role_name` lands, only the body of this function changes: it will
 * read `group.role_name` instead of consulting the table. Nothing that calls it
 * needs to know which world it is in.
 */
export function selectPersonas(groups: readonly GroupRef[], superAdmin: boolean): Persona[] {
  if (superAdmin) {
    // A superadmin holds ZERO feature keys — CAS declines to special-case them,
    // deliberately, because break-glass access says nothing about what a tenant
    // has purchased. Without an explicit persona they would see an empty app.
    //
    // They get the operator view and only that: break-glass should look like
    // break-glass, so nobody administers the system while believing they are
    // looking at an ordinary teacher's screen.
    return [{ slug: OPERATOR_SLUG, roleName: OPERATOR_LABEL, groupKey: null }];
  }

  const out: Persona[] = [];
  const seen = new Set<string>();

  for (const group of groups) {
    if (!group.key) continue;
    const roleName = ROLE_BEARING_GROUPS[group.key];
    if (!roleName) continue;

    const slug = slugifyRole(roleName);
    // A role name that slugifies to nothing would produce `/p/` — a broken URL
    // and an invisible persona. Skip it loudly rather than emit a bad route.
    if (!slug || seen.has(slug)) continue;

    seen.add(slug);
    out.push({ slug, roleName, groupKey: group.key });
  }

  // Deterministic ordering so the switcher and the default persona do not move
  // around between requests. CAS returns groups ordered by name, but that is an
  // implementation detail of a different service to depend on.
  out.sort((a, b) => a.roleName.localeCompare(b.roleName));
  return out;
}

export function isHeldPersona(personas: readonly Persona[], slug: string): boolean {
  return personas.some((p) => p.slug === slug);
}

/**
 * The lens: which feature keys this persona surfaces, in order.
 *
 * THE PRESET ORDERS. CAS DECIDES EXISTENCE. The distinction is the whole
 * requirement and it is easy to get backwards.
 *
 * An earlier version returned `preset.filter(held.has)` — a subset. That made
 * the preset an allowlist a CAS grant could not get past: `emerge.principal`
 * genuinely holds `emerge.grades` and `emerge.timetable` at `unscoped_grant`,
 * and because neither appeared in the principal preset, neither rendered
 * anywhere. An administrator could grant a feature, watch nothing happen, and
 * find no signal in any log. That is a hardcoded per-role allowlist — exactly
 * `if (role === 'teacher')` re-expressed as data, where neither the lint rule
 * nor the build gate can see it.
 *
 * So: everything held is surfaced. The preset decides what comes FIRST, which
 * is what makes a principal's dashboard read differently from a teacher's
 * without either of them losing access CAS granted. Segregation comes from
 * users genuinely holding different keys, and from emphasis — never from the
 * front end withholding a grant.
 *
 * The narrowing property that makes the URL segment safe is unaffected: this
 * still only ever returns keys drawn from `held`, so a forged persona cannot
 * add anything.
 */
export function personaLens(
  slug: string,
  held: ReadonlySet<FeatureKey>,
): FeatureKey[] {
  const preset = PERSONA_PRESETS[slug] ?? [];
  const prioritised = preset.filter((key) => held.has(key));
  const seen = new Set<FeatureKey>(prioritised);
  // Held but not prioritised by this persona: still shown, just after.
  const rest = [...held].filter((key) => !seen.has(key)).sort();
  return [...prioritised, ...rest];
}
