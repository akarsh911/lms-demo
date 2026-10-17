import { NextResponse, type NextRequest } from 'next/server';

import { COOKIE_OPTIONS } from '@/constants/session';
import { SSO_POPUP_PARAM, SSO_PROVIDER_PARAM, ssoProviderOf } from '@/lib/auth/sso-popup';
import { NEXT_PARAM, safeNextPath } from '@/lib/auth/next-path';
import { paths } from '@/paths';
import { authorizeUrl, isSsoEnabled } from '@/server/sso/config';
import { SSO_FLOW_COOKIE, SSO_FLOW_COOKIE_PATH, SSO_FLOW_MAX_AGE_SECONDS, codeChallenge, newFlow, sealFlow } from '@/server/sso/flow';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isSsoEnabled()) {
    return NextResponse.redirect(Object.assign(request.nextUrl.clone(), { pathname: paths.auth.signIn, search: '' }));
  }

  const params = request.nextUrl.searchParams;
  const flow = newFlow(params.get(SSO_POPUP_PARAM) === '1', safeNextPath(params.get(NEXT_PARAM), paths.root));
  const provider = ssoProviderOf(params.get(SSO_PROVIDER_PARAM));
  const response = NextResponse.redirect(authorizeUrl(flow.state, codeChallenge(flow.verifier), flow.popup, provider));
  response.cookies.set(SSO_FLOW_COOKIE, await sealFlow(flow), {
    ...COOKIE_OPTIONS,
    path: SSO_FLOW_COOKIE_PATH,
    maxAge: SSO_FLOW_MAX_AGE_SECONDS,
  });
  return response;
}
