import 'server-only';

import { config } from '@/config';
import { NEXT_PARAM } from '@/lib/auth/next-path';
import { logger } from '@/lib/logger';
import { paths } from '@/paths';
import { casClient } from '@/server/cas/client';
import { appUrl, configuredClientId, isSsoEnabled } from '@/server/sso/config';

function sameOrigin(candidate: string, base: string): boolean {
  try {
    return new URL(candidate).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export async function ssoAdoptUrl(accessToken: string, next: string): Promise<string | null> {
  if (!isSsoEnabled()) return null;
  const clientId = configuredClientId();
  if (!clientId) return null;
  const returnTo = `${appUrl()}${paths.auth.ssoReturn}?${new URLSearchParams({ [NEXT_PARAM]: next }).toString()}`;
  try {
    const answer = await casClient.ssoTicket(accessToken, clientId, returnTo);
    if (!answer.adopt_url) return null;
    if (!sameOrigin(answer.adopt_url, config.casUrl)) {
      logger.warn('CAS returned an SSO adopt URL off its own origin; staying signed in locally');
      return null;
    }
    return answer.adopt_url;
  } catch (cause) {
    logger.info('SSO hand-off unavailable; staying signed in locally', { cause });
    return null;
  }
}
