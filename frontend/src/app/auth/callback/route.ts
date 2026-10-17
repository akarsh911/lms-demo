import { NextResponse, type NextRequest } from 'next/server';

import { COOKIE_OPTIONS, PENDING_SESSION_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/constants/session';
import { withNext } from '@/lib/auth/next-path';
import { signInPathWithError, type SsoErrorKind } from '@/lib/auth/sso-errors';
import { logger } from '@/lib/logger';
import { paths } from '@/paths';
import { casClient } from '@/server/cas/client';
import { CasError } from '@/server/cas/errors';
import { expiryFromSeconds, readTokenClaims, seal } from '@/server/session/cookie';
import { isSsoEnabled, ssoClientId, ssoRedirectUri } from '@/server/sso/config';
import { SSO_FLOW_COOKIE, SSO_FLOW_COOKIE_PATH, unsealFlow, type SsoFlow } from '@/server/sso/flow';
import { popupResultPage } from '@/server/sso/popup-page';

function toSignIn(request: NextRequest, kind: SsoErrorKind | null, flow: SsoFlow | null): NextResponse {
  const next = flow?.next ?? paths.root;
  const target = kind ? withNext(signInPathWithError(paths.auth.signIn, kind), next) : next;
  const response = flow?.popup ? popupResultPage(kind, target) : NextResponse.redirect(new URL(target, request.nextUrl.origin));
  response.cookies.set(SSO_FLOW_COOKIE, '', { ...COOKIE_OPTIONS, path: SSO_FLOW_COOKIE_PATH, maxAge: 0 });
  return response;
}

function kindForAuthorizeError(error: string, description: string | null): SsoErrorKind {
  switch (error) {
    case 'access_denied':
      return description?.includes('identity_not_linked') ? 'not_linked' : 'access_denied';
    case 'login_required':
    case 'interaction_required':
      return 'sign_in_required';
    default:
      return 'exchange_failed';
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isSsoEnabled()) return toSignIn(request, null, null);

  const params = request.nextUrl.searchParams;
  const flow = await unsealFlow(request.cookies.get(SSO_FLOW_COOKIE)?.value);
  const state = params.get('state');
  if (!flow || !state || state !== flow.state) return toSignIn(request, 'state_mismatch', flow);

  const error = params.get('error');
  if (error) {
    logger.warn('CAS sign-in returned an error', { error, description: params.get('error_description') });
    return toSignIn(request, kindForAuthorizeError(error, params.get('error_description')), flow);
  }

  const code = params.get('code');
  if (!code) return toSignIn(request, 'exchange_failed', flow);

  let sealed: string;
  try {
    const tokens = await casClient.exchangeCode(code, ssoRedirectUri(), ssoClientId(), flow.verifier);
    const claims = readTokenClaims(tokens.access_token);
    if (!claims || !tokens.refresh_token) {
      logger.error('CAS code exchange returned an unusable token pair');
      return toSignIn(request, 'exchange_failed', flow);
    }
    sealed = await seal({
      uid: claims.sub,
      sid: claims.sid,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessExpiresAt: expiryFromSeconds(tokens.expires_in),
      browserOnly: false,
      origin: 'sso',
    });
  } catch (cause) {
    const unavailable = cause instanceof CasError && (cause.failure.kind === 'unavailable' || cause.failure.kind === 'throttled');
    logger.warn('CAS code exchange failed', { cause });
    return toSignIn(request, unavailable ? 'unavailable' : 'exchange_failed', flow);
  }

  const response = toSignIn(request, null, flow);
  response.cookies.set(SESSION_COOKIE, sealed, { ...COOKIE_OPTIONS, maxAge: SESSION_MAX_AGE_SECONDS });
  response.cookies.delete(PENDING_SESSION_COOKIE);
  return response;
}
