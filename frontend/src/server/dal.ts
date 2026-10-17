import 'server-only';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { SESSION_COOKIE } from '@/constants/session';
import type { FeatureKey } from '@/constants/features';
import { isReachable } from '@/types/entitlement';
import { resolveFeature } from '@/lib/entitlement/resolve-key';
import { buildNav } from '@/lib/nav/build-nav';
import { isHeldPersona, selectPersonas } from '@/lib/persona/select';
import { paths } from '@/paths';
import { devSession, devUserId, isDevBypass } from '@/server/dev/bypass';
import { unseal, type SessionPayload } from '@/server/session/cookie';

import { getEntitlements } from '@/server/entitlement/resolve';
import type { EntitlementSnapshot } from '@/types/entitlement';
import type { NavItem } from '@/types/nav';
import type { Persona } from '@/types/persona';

/**
 * The Data Access Layer — every gate in the application.
 *
 * This is where "the user must not even see it" is actually delivered. These
 * functions run on the server, decide what exists, and return only what the
 * user holds. A component that is not rendered produces no markup, so there is
 * nothing in the RSC payload for a browser to un-hide, and no client-side flag
 * whose value could be edited.
 *
 * A NOTE ON WHAT THIS IS AND IS NOT. All of this is presentation. It decides
 * what is OFFERED. It authorizes nothing, and it must never be the only thing
 * standing between a user and data: every resource API is independently
 * authorized by CAS rules. A gate here that were the sole protection would be a
 * hidden button, which protects nothing.
 */

/**
 * Read and open the session cookie. Null when there is no usable session.
 *
 * THIS FUNCTION DELIBERATELY DOES NOT REFRESH, and that is a correctness
 * requirement rather than a division of labour.
 *
 * CAS rotates the refresh token on every refresh and treats reuse of a spent
 * one as theft, revoking the entire session. A Server Component cannot write a
 * cookie, so a refresh performed here could not be persisted — the browser
 * would keep the old, now-spent token and present it on the next request, and
 * CAS would silently destroy the session. A refresh that cannot be persisted is
 * worse than no refresh at all.
 *
 * Rotation therefore happens in exactly one place, `proxy.ts`, which can write
 * the cookie. By the time this runs the token is already fresh.
 */
export async function getSession(): Promise<SessionPayload | null> {
  // Dev bypass: a fixture session, no cookie. Never true in a production build.
  if (isDevBypass()) {
    const user = await devUserId();
    return user ? devSession(user) : null;
  }

  const jar = await cookies();
  const session = await unseal(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  // Past expiry despite the proxy — a request that escaped the matcher, or a
  // token that aged out mid-flight. Treat as signed out and let the next
  // request through the proxy establish a fresh one.
  if (session.accessExpiresAt <= Date.now()) return null;

  return session;
}

/** Require a session, or send the user to sign in. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect(paths.auth.signIn);
  return session;
}

export async function requireEntitlements(): Promise<{
  session: SessionPayload;
  snapshot: EntitlementSnapshot;
}> {
  const session = await requireSession();
  const snapshot = await getEntitlements(session);
  return { session, snapshot };
}

export async function getPersonas(snapshot: EntitlementSnapshot): Promise<Persona[]> {
  return selectPersonas(snapshot.groups, snapshot.superAdmin);
}

/**
 * Verify a persona segment taken from the URL.
 *
 * The segment is user input. It is checked against the personas this user
 * actually holds, and an unheld one is a 404 rather than a redirect — a
 * redirect would confirm that the persona exists, which is a small disclosure
 * for no benefit.
 *
 * Worth being precise about the stakes: even an unverified persona could not
 * grant anything, because the lens intersects with real entitlements and can
 * only narrow. This check exists so the UI is coherent, not to hold a security
 * boundary that the intersection already holds.
 */
export async function requirePersona(slug: string): Promise<{
  session: SessionPayload;
  snapshot: EntitlementSnapshot;
  persona: Persona;
  personas: Persona[];
  nav: NavItem[];
}> {
  const { session, snapshot } = await requireEntitlements();
  const personas = await getPersonas(snapshot);

  if (!isHeldPersona(personas, slug)) notFound();

  const persona = personas.find((p) => p.slug === slug);
  if (!persona) notFound();

  return { session, snapshot, persona, personas, nav: buildNav(snapshot, slug) };
}

/**
 * The route gate. Call this at the top of every feature page.
 *
 * A feature the user cannot reach is `notFound()` — deliberately the same
 * response as a URL that does not exist, so the route table is not enumerable
 * by probing.
 */
export async function requireFeature(
  personaSlug: string,
  feature: FeatureKey,
): Promise<{ snapshot: EntitlementSnapshot; persona: Persona; nav: NavItem[] }> {
  const { snapshot, persona, nav } = await requirePersona(personaSlug);

  /**
   * A superadmin holds ZERO feature keys — CAS declines to special-case them,
   * on the deliberate grounds that break-glass access says nothing about what a
   * tenant has bought. Applied literally that means every route 404s and the
   * operator view is unreachable, which is how FR16 was being failed.
   *
   * So the exception is made here, locally and visibly, rather than pretended
   * away. It costs nothing in safety: this gate only decides what is OFFERED,
   * and every resource API still authorizes independently through CAS rules. A
   * superadmin who cannot read a record still cannot read it — they can simply
   * reach the page that says so.
   */
  if (snapshot.superAdmin) return { snapshot, persona, nav };

  // RESOLVED, not looked up. A nested key CAS has no row for is never
  // evaluated, so it has no entry of its own; it inherits its nearest
  // registered ancestor, the same rule `WidgetGrid` and `buildNav` apply. A raw
  // `entries.get` here 404'd every unregistered nested page that the sidebar
  // (had it resolved) would have offered.
  if (!isReachable(resolveFeature(snapshot, feature).state)) notFound();

  return { snapshot, persona, nav };
}

/** Where to send someone who lands on `/`. */
export async function defaultPersonaSlug(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const snapshot = await getEntitlements(session);
  const personas = selectPersonas(snapshot.groups, snapshot.superAdmin);
  return personas[0]?.slug ?? null;
}
