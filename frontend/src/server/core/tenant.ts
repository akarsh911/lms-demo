import 'server-only';

import { serviceBaseUrl, serviceEnvVar } from '@/constants/services';
import { logger } from '@/lib/logger';
import { recordExchange } from '@/server/dev/record';
import type { SessionPayload } from '@/server/session/cookie';
import type { CoreIdentity } from '@/types/core';

/**
 * WHICH SCHOOL THIS SESSION IS, and why the browser can never decide it.
 *
 * emerge-core is database-per-tenant. `X-School-Id` is not a filter it applies
 * to a shared table — it selects the DATABASE the request runs against
 * (`internal/transport/http/middleware/tenant.go`, via `postgres.Registry`). A
 * caller who could choose that header would be choosing which school's records
 * to read, so a client-supplied one is a cross-tenant read by construction.
 * Every tenant route refuses a request without the header with a 400; none of
 * them defaults.
 *
 * ## Where the value comes from, and the three things that make it unforgeable
 *
 * 1. **The browser cannot state it.** The proxy handler rebuilds the outbound
 *    header set from scratch and drops `x-school-id` from whatever arrived, so
 *    a fetch that sets the header reaches the service without it. That was
 *    already true before this file existed.
 *
 * 2. **The candidate is server-side configuration.** `CORE_SCHOOL_ID` is a
 *    server env var, read in this module, which is `server-only` and so cannot
 *    be imported into a client bundle. It never appears in an RSC payload.
 *
 * 3. **emerge-core confirms it against the session's own token, and only what
 *    it confirmed is ever sent back.** This asks `GET /auth/me` with the
 *    configured school and the session's bearer. `RequireTenant` resolves that
 *    school and compares its `cas_tenant_id` with the `tenant_id` claim in the
 *    access token — which it verified by RS256 against CAS's JWKS — and answers
 *    **403 "token tenant does not match X-School-Id"** when they disagree. What
 *    this module caches, and the proxy then sends, is the `school_id` UUID out
 *    of that confirmed response: a value emerge-core itself produced for this
 *    session, not one this application composed.
 *
 * So the header is not merely "not from the client". It is a value the backend
 * agreed belongs to this token before any data request carried it.
 *
 * ## The gap, stated rather than papered over
 *
 * The token's tenant claim is optional in the verifier. When it is absent,
 * `RequireTenant` skips the comparison in step 3 and the configured school
 * stands on its own — still unforgeable by a client, but no longer confirmed
 * against the session. Point 3 is worth exactly what the CAS token carries;
 * points 1 and 2 hold regardless.
 *
 * ## What this is NOT
 *
 * `/auth/me` is mounted behind `OptionalTenant`, so it is the one tenant-aware
 * route that answers without the header — but then it answers with the token's
 * claims ALONE: no `school`, no `person`, no `roles`. And the `tenant_id` it
 * returns is the CAS tenant SLUG, which `RequireTenant` cannot resolve: it
 * parses the header as a UUID and otherwise looks it up by school `code`.
 * `Registry.GetByCASTenant` exists and the middleware does not call it. So
 * there is no bootstrap in which the session alone names a school emerge-core
 * would accept, which is why a configured candidate is the starting point
 * rather than the finish.
 */

/**
 * The school this deployment serves, as emerge-core will accept it: the
 * school's `code` (`DPS-NGP`) or its `school_id` UUID.
 *
 * One value, because this front end is a one-school application — "One school,
 * one brand" is the reason the theme rotates everything except colour. A
 * deployment serving several would resolve the school per session instead, and
 * this is the function that would change.
 */
export function configuredSchool(): string | null {
  return process.env.CORE_SCHOOL_ID?.trim() || null;
}

/**
 * `unconfigured` is separated from `unavailable` because they need different
 * answers from the proxy and different fixes from whoever reads the log: one is
 * a missing env var on this server, the other is emerge-core being down.
 * `refused` is neither — it is emerge-core declining this session for this
 * school, which is the boundary working rather than failing.
 */
export type TenantResolution =
  | { kind: 'resolved'; schoolId: string }
  | { kind: 'unconfigured'; detail: string }
  | { kind: 'refused'; status: number; detail: string }
  | { kind: 'unavailable' };

interface CachedTenant {
  schoolId: string;
  identity: CoreIdentity;
  /** The user the confirmation was made for. */
  uid: string;
  expiresAt: number;
}

// Survives hot-reload in dev, where module state is otherwise discarded.
const globalStore = globalThis as unknown as {
  __emergeCoreTenants?: Map<string, CachedTenant>;
};

const tenants: Map<string, CachedTenant> =
  globalStore.__emergeCoreTenants ?? (globalStore.__emergeCoreTenants = new Map());

const TENANT_TTL_MS = 5 * 60 * 1000;
const MAX_TRACKED_TENANTS = 5000;

function remember(
  session: SessionPayload,
  schoolId: string,
  identity: CoreIdentity,
): void {
  if (tenants.size > MAX_TRACKED_TENANTS) {
    // Insertion-ordered, so the oldest go first. Dropping one costs one extra
    // `/auth/me`, never a wrong tenant: the next request re-confirms.
    const excess = tenants.size - MAX_TRACKED_TENANTS;
    let dropped = 0;
    for (const key of tenants.keys()) {
      if (dropped >= excess) break;
      dropped += 1;
      tenants.delete(key);
    }
  }
  tenants.set(session.sid, {
    schoolId,
    identity,
    uid: session.uid,
    // Bounded by the credential it was confirmed under, so a tenant decision
    // can never outlive the token that earned it.
    expiresAt: Math.min(Date.now() + TENANT_TTL_MS, session.accessExpiresAt),
  });
}

export function forgetTenant(sid: string): void {
  tenants.delete(sid);
}

interface Confirmation {
  resolution: TenantResolution;
  identity: CoreIdentity | null;
}

/**
 * The `X-School-Id` value for this session, confirming it first if need be.
 *
 * Cached on `sid` AND `uid` together. `sid` alone would be one absent claim
 * away from serving one user's tenant to another: `readTokenClaims` defaults a
 * missing `sid` to the empty string, so every such session collides on one key.
 * That is the trap `getEntitlements` already documents, and it costs more here —
 * the value being cached decides which database a write lands in.
 */
export async function resolveSchoolId(
  session: SessionPayload,
  now = Date.now(),
): Promise<TenantResolution> {
  return (await confirmTenant(session, now)).resolution;
}

export async function coreIdentity(
  session: SessionPayload,
  now = Date.now(),
): Promise<CoreIdentity | null> {
  return (await confirmTenant(session, now)).identity;
}

async function confirmTenant(
  session: SessionPayload,
  now: number,
): Promise<Confirmation> {
  const base = serviceBaseUrl('core');
  if (!base) {
    return {
      identity: null,
      resolution: {
        kind: 'unconfigured',
        detail: `${serviceEnvVar('core')} is not set, so there is no emerge-core to ask.`,
      },
    };
  }

  const configured = configuredSchool();
  if (!configured) {
    return {
      identity: null,
      resolution: {
        kind: 'unconfigured',
        detail:
          'CORE_SCHOOL_ID is not set. emerge-core selects a tenant DATABASE from ' +
          'this header and refuses a request without one, so there is no safe default.',
      },
    };
  }

  const cached = tenants.get(session.sid);
  if (cached && cached.uid === session.uid && now < cached.expiresAt) {
    return {
      identity: cached.identity,
      resolution: { kind: 'resolved', schoolId: cached.schoolId },
    };
  }

  let res: Response;
  try {
    res = await fetch(`${base}/auth/me`, {
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'x-school-id': configured,
      },
      cache: 'no-store',
    });
  } catch (cause) {
    logger.error('emerge-core is unreachable while confirming the tenant', { cause });
    return { identity: null, resolution: { kind: 'unavailable' } };
  }

  void recordExchange('core', 'GET', 'auth/me', '', res.clone());

  if (res.status === 401 || res.status === 403 || res.status === 404) {
    // 403 is the interesting one: emerge-core compared the school's
    // `cas_tenant_id` against the token's `tenant_id` claim and they disagree.
    // This session does not belong to the configured school, so no request of
    // its may carry that tenant.
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    const detail = body?.message ?? `emerge-core answered ${res.status}`;
    logger.warn('emerge-core refused the configured tenant for this session', {
      status: res.status,
      detail,
      school: configured,
    });
    return {
      identity: null,
      resolution: { kind: 'refused', status: res.status, detail },
    };
  }

  if (!res.ok) {
    logger.error('emerge-core could not confirm the tenant', { status: res.status });
    return { identity: null, resolution: { kind: 'unavailable' } };
  }

  const identity = (await res.json().catch(() => null)) as CoreIdentity | null;
  const schoolId = identity?.school?.school_id;
  if (!schoolId) {
    // A 200 with no `school` means the header did not resolve to a tenant.
    // `/auth/me` is the one route behind `OptionalTenant`, so it degrades to
    // the token's claims instead of erroring; every OTHER route would 400.
    logger.error(
      `emerge-core resolved no school for "${configured}". CORE_SCHOOL_ID must be ` +
        'a school code or school_id that the control plane knows.',
    );
    return { identity: null, resolution: { kind: 'unavailable' } };
  }

  remember(session, schoolId, identity);
  return { identity, resolution: { kind: 'resolved', schoolId } };
}
