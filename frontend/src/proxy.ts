import { NextResponse, type NextRequest } from 'next/server';

import { DEMO_SESSION_COOKIE, demoAccountOf } from '@/constants/demo-accounts';
import { COOKIE_OPTIONS, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/constants/session';
import { NEXT_PARAM, safeNextPath, withNext } from '@/lib/auth/next-path';
import { paths } from '@/paths';
import { isDevBypass, isPublicDemo } from '@/server/dev/bypass';
import { seal, unseal } from '@/server/session/cookie';
import { needsRefresh, refreshSession } from '@/server/session/store';

/**
 * `proxy.ts` — the request-level gate. (Next 16 renamed `middleware.ts` to this;
 * having both files present is a hard build error.)
 *
 * Two jobs, and the second is the one that must not move elsewhere.
 *
 * 1. Redirect anonymous requests away from the app before any protected route
 *    renders. Cookie presence only — an optimistic check. The real gate is the
 *    DAL, which runs per page.
 *
 * 2. REFRESH AND PERSIST the token pair.
 *
 * On (2): CAS rotates the refresh token on every refresh and treats the reuse
 * of a spent one as theft, revoking the whole session. So a refresh that is not
 * written back to the cookie is actively dangerous — the next request would
 * present the old, already-spent token and CAS would silently destroy the
 * session.
 *
 * Only a proxy or a route handler can write a cookie; a Server Component
 * cannot. That is precisely why refresh lives here and why the DAL is
 * deliberately forbidden from rotating. `request.cookies.set` makes the new
 * value visible to Server Components within THIS request, while
 * `response.cookies.set` persists it to the browser for the next one. Both are
 * required: the first without the second re-refreshes forever, and the second
 * without the first makes this request use a token it has already replaced.
 */

const PUBLIC_PATHS = [paths.auth.signIn];

// A GRASP link is opened by students with no account, so the join page and its API pass with or without a session.
const OPEN_PATHS = ['/g', '/api/grasp/join', '/api/grasp/attempts', '/api/grasp/host'];

const SSO_PATHS = [paths.auth.ssoLogin, paths.auth.ssoCallback, paths.auth.ssoReturn];

/**
 * API routes stay INSIDE the matcher — they need the same proactive refresh as
 * a page, or a long-lived tab's XHRs would start failing while its pages kept
 * working. But they must not be answered with a redirect: an XHR expecting
 * JSON that receives a 307 to an HTML sign-in page reports a parse error, and
 * the real cause (the session ended) is nowhere in it.
 */
function isApiRequest(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

function unauthorized(): NextResponse {
  return NextResponse.json({ code: 'unauthorized' }, { status: 401 });
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (SSO_PATHS.some((p) => p === pathname)) return NextResponse.next();

  // Dev bypass: a demo account's sign-in stands in for the session; the public demo needs none.
  if (isDevBypass()) {
    if (isPublicDemo() || isApiRequest(pathname)) return NextResponse.next();
    const signedIn = demoAccountOf(request.cookies.get(DEMO_SESSION_COOKIE)?.value);
    if (!signedIn && !isPublic) return NextResponse.redirect(Object.assign(request.nextUrl.clone(), { pathname: paths.auth.signIn }));
    if (signedIn && isPublic) return NextResponse.redirect(Object.assign(request.nextUrl.clone(), { pathname: paths.root }));
    return NextResponse.next();
  }

  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await unseal(raw);

  if (!session) {
    if (isPublic) return NextResponse.next();
    if (isApiRequest(pathname)) {
      const res = unauthorized();
      if (raw) res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    // `next` is only ever honoured as a local path (`safeNextPath`), which is
    // what keeps it from being an open-redirect surface.
    const res = NextResponse.redirect(new URL(withNext(paths.auth.signIn, `${pathname}${request.nextUrl.search}`), request.nextUrl.origin));
    if (raw) res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // Signed in and heading for the sign-in page: send them into the app.
  if (isPublic && !isApiRequest(pathname)) {
    const next = safeNextPath(request.nextUrl.searchParams.get(NEXT_PARAM), paths.root);
    return NextResponse.redirect(new URL(next, request.nextUrl.origin));
  }

  if (!needsRefresh(session)) return NextResponse.next();

  // Deliberately NOT forwarding the client's own x-forwarded-for. See
  // `server/request-ip.ts`: once CAS trusts this app's header, echoing a
  // client-supplied one lets any caller choose the IP they are throttled and
  // audited as. Refresh is a server-initiated call, so no client IP is claimed.
  const outcome = await refreshSession(session);

  if (outcome.status === 'failed') {
    const res = isApiRequest(pathname)
      ? unauthorized()
      : NextResponse.redirect(
          Object.assign(request.nextUrl.clone(), { pathname: paths.auth.signIn }),
        );
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  if (outcome.status !== 'refreshed') {
    // `throttled` or `unchanged`: the existing session is intact and the
    // refresh token was NOT spent. Carry on with what we have rather than
    // signing the user out over a transient rate limit.
    return NextResponse.next();
  }

  const sealed = await seal(outcome.session);

  // Visible to Server Components in this same request...
  request.cookies.set(SESSION_COOKIE, sealed);
  const response = NextResponse.next({ request: { headers: request.headers } });
  // ...and persisted to the browser for the next one.
  response.cookies.set(SESSION_COOKIE, sealed, {
    ...COOKIE_OPTIONS,
    maxAge: outcome.session.browserOnly ? undefined : SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except static assets and the auth API. Keeping the refresh
     * path out of the matcher matters: refreshing inside a request that is
     * itself refreshing would recurse.
     */
    '/((?!_next/static|_next/image|favicon.ico|playground/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
