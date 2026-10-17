import { NextResponse, type NextRequest } from 'next/server';

import {
  SCHOOL_TENANT_SERVICES,
  isServiceName,
  serviceBaseUrl,
  serviceEnvVar,
} from '@/constants/services';
import { logger } from '@/lib/logger';
import { SESSION_COOKIE } from '@/constants/session';
import { SESSION_INVALID } from '@/lib/auth/session-channel';
import { forgetTenant, resolveSchoolId } from '@/server/core/tenant';
import { dropSession } from '@/server/session/store';
import { getSession } from '@/server/dal';
import { isDevBypass } from '@/server/dev/bypass';
import { DEV_USER_HEADER, devForwardHeaders } from '@/server/dev/forward-headers';
import { devForwardFor, forwardedUnderBypass } from '@/server/dev/live';
import { isRecording, recordExchange } from '@/server/dev/record';

/**
 * The authenticated microservice proxy.
 *
 * One handler serves every service and every path. It exists so that the
 * browser can call backend services WITHOUT ever holding a token: the sealed
 * HttpOnly cookie arrives here, this handler opens it server-side and attaches
 * the bearer.
 *
 * ## What this is not
 *
 * It is not an authorization boundary and must never be mistaken for one. It
 * checks that you have a SESSION, not that you may perform the action. The
 * downstream service authorizes the request itself, through CAS rules — which
 * is the only reason it is safe for this to forward anything a signed-in user
 * asks for. If a service ever relied on "the proxy would not have sent this",
 * the whole model would be a hidden button again.
 *
 * ## The SSRF guard
 *
 * The service NAME is looked up in a fixed registry; the caller never supplies
 * a URL. Without that, `/api/svc/http://169.254.169.254/...` would have this
 * server fetch an internal address and helpfully attach a valid bearer token.
 *
 * ## The tenant header
 *
 * `x-school-id` is STRIPPED from whatever arrived and restated by this server,
 * in both modes. That strip is the load-bearing line: emerge-core selects a
 * tenant DATABASE from that header, so a client-supplied one is a cross-tenant
 * read rather than a preference. In real mode the value comes from
 * `resolveSchoolId`, which is a school emerge-core itself confirmed against
 * this session's token — see `server/core/tenant.ts` for why it cannot be
 * forged. When it cannot be established the request is REFUSED here rather than
 * forwarded without it: a tenant route would answer 400, which reads as a bug
 * in the caller instead of a misconfiguration on this server.
 */

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'proxy-authenticate', 'proxy-authorization', 'te', 'trailer',
]);

function codeOf(text: string): string | null {
  try {
    const code = (JSON.parse(text) as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : null;
  } catch {
    return null;
  }
}

async function handler(
  request: NextRequest,
  ctx: { params: Promise<{ service: string; path: string[] }> },
): Promise<NextResponse> {
  const { service, path } = await ctx.params;

  if (!isServiceName(service)) {
    // Deliberately 404, not 400: an unknown service name should look exactly
    // like a URL that does not exist, so the service registry is not
    // enumerable by probing.
    return NextResponse.json({ code: 'not_found' }, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ code: 'unauthorized' }, { status: 401 });
  }

  const bypass = isDevBypass();
  // Under the bypass the services answer from `src/fixtures` in the browser, so a call that reaches here is one
  // with no fixture branch yet. Only the services named in `DEV_LIVE_SERVICES` (and the hosted demo's retrieval) go out.
  if (bypass && !forwardedUnderBypass(service)) {
    const route = `${request.method} ${service}/${path.join('/')}`;
    logger.warn(`dev bypass: ${route} has no fixture branch in src/services`);
    return NextResponse.json({ code: 'dev_bypass_no_fixture', message: `the dev bypass has no fixture for ${route}` }, { status: 404 });
  }

  const base = serviceBaseUrl(service);
  if (!base) {
    // No URL and no fallback. Answered rather than thrown, and named rather
    // than generic: the fix is one env var on this server, and "service
    // unavailable" sends whoever reads it to look at the wrong machine.
    logger.error(
      `Service "${service}" has no base URL: ${serviceEnvVar(service)} is not set.`,
    );
    return NextResponse.json({ code: 'service_unconfigured' }, { status: 503 });
  }

  const target = new URL(path.join('/'), `${base}/`);
  target.search = request.nextUrl.search;

  // Rebuilt rather than forwarded wholesale: passing the incoming cookie header
  // downstream would hand the session cookie to every microservice, and
  // forwarding hop-by-hop headers corrupts the connection. `x-school-id` is
  // stripped too: a tenant is this server's to state, never the browser's.
  //
  // `content-length` is stripped because the body below is a STREAM this server
  // re-sends rather than the bytes that arrived. Forwarding the client's length
  // asserts a size this request may not deliver, and a mismatch is not a polite
  // disagreement: undici aborts with UND_ERR_REQ_CONTENT_LENGTH_MISMATCH and the
  // upload surfaces as a 502 naming the wrong service. The transfer goes out
  // chunked, which every service here tolerates -- emerge-core's upload route
  // checks the declared length only when one is present and verifies the digest
  // as the bytes pass either way.
  const headers = new Headers();
  for (const [k, v] of request.headers) {
    if (
      HOP_BY_HOP.has(k) ||
      k === 'cookie' ||
      k === 'host' ||
      k === 'authorization' ||
      k === 'x-school-id' ||
      k === DEV_USER_HEADER ||
      k === 'content-length'
    ) {
      continue;
    }
    headers.set(k, v);
  }

  if (bypass) {
    // The fixture session's token is a placeholder. Withheld rather than sent:
    // a service that verified it would answer 401, which reads as an outage.
    // The retrieval engine scopes by an explicit tenant header instead, which
    // is also how its sibling, the mind-map engine, calls it.
    for (const [k, v] of Object.entries(devForwardHeaders(devForwardFor(service, session.uid)))) {
      headers.set(k, v);
    }
  } else {
    headers.set('authorization', `Bearer ${session.accessToken}`);

    /**
     * The tenant, in real mode, for the services that speak emerge-core's
     * vocabulary of it. This is the line `CLAUDE.md` §10 called "the swap point
     * ... once CAS can say which school a session belongs to".
     *
     * It is NOT applied to the two study engines this proxy addresses, retrieval
     * and flashcards. They want the same header
     * name and a different value — `S_42`, or the CAS tenant slug their own
     * deployment compares against — and emerge-core's school UUID is neither.
     * Sending it would swap one wrong tenant for another while looking like a
     * fix. See `SCHOOL_TENANT_SERVICES`.
     */
    if (SCHOOL_TENANT_SERVICES.has(service)) {
      const tenant = await resolveSchoolId(session);
      switch (tenant.kind) {
        case 'resolved':
          headers.set('x-school-id', tenant.schoolId);
          break;
        case 'unconfigured':
          return NextResponse.json(
            { code: 'tenant_unconfigured', message: tenant.detail },
            { status: 503 },
          );
        case 'refused':
          // emerge-core declined this session for this school — most usefully,
          // because the access token's tenant claim names a different one. That
          // is the boundary holding, so it is passed through as a denial rather
          // than dressed up as an outage.
          return NextResponse.json(
            { code: 'tenant_refused', message: tenant.detail },
            { status: 403 },
          );
        case 'unavailable':
          return NextResponse.json({ code: 'service_unavailable' }, { status: 502 });
      }
    }
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      duplex: 'half',
      cache: 'no-store',
      redirect: 'manual',
    } as RequestInit & { duplex: 'half' });

    if (isRecording() && !bypass) {
      void recordExchange(service, request.method, path.join('/'), request.nextUrl.search, res.clone());
    }

    const decoded = res.headers.has('content-encoding');

    const out = new Headers();
    for (const [k, v] of res.headers) {
      // `set-cookie` from a microservice must not reach the browser on this
      // origin — it could overwrite the session cookie.
      //
      // `content-encoding` describes the body as the service sent it, but
      // `fetch` has already DECODED a compressed body. Passed through, a
      // gzipping service's JSON would reach the browser labelled gzip and fail
      // to decode — and its `content-length` would be the compressed length,
      // which is why that is dropped too WHEN the body was decoded. When the
      // service declared no encoding nothing was decoded, the length is
      // accurate, and it is kept: a browser's PDF viewer needs the total size
      // to fetch ranges rather than buffer the whole file.
      if (
        HOP_BY_HOP.has(k) ||
        k === 'set-cookie' ||
        k === 'content-encoding' ||
        (k === 'content-length' && decoded)
      ) {
        continue;
      }
      out.set(k, v);
    }

    if (res.status === 401) {
      const text = await res.text();
      const response = new NextResponse(text, { status: res.status, headers: out });
      if (codeOf(text) === SESSION_INVALID) {
        logger.info(`Service "${service}" reports the session ended; clearing it here`);
        dropSession(session.sid);
        forgetTenant(session.sid);
        response.cookies.delete(SESSION_COOKIE);
      }
      return response;
    }

    return new NextResponse(res.body, { status: res.status, headers: out });
  } catch (cause) {
    logger.error(`Service "${service}" unreachable`, { cause });
    return NextResponse.json({ code: 'service_unavailable' }, { status: 502 });
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
