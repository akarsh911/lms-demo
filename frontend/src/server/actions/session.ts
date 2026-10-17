'use server';

import { cookies } from 'next/headers';

import { CAS_ERROR_CODES } from '@/constants/cas';
import { PENDING_SESSION_COOKIE, SESSION_COOKIE } from '@/constants/session';
import { logger } from '@/lib/logger';
import { currentCasSession } from '@/server/account/cas-session';
import { casClient } from '@/server/cas/client';
import { CasError } from '@/server/cas/errors';
import { forgetTenant } from '@/server/core/tenant';
import { dropSession } from '@/server/session/store';

export type Liveness = 'active' | 'signed_out' | 'unknown';

export async function checkSessionLiveness(): Promise<Liveness> {
  const session = await currentCasSession();
  if (!session) return 'unknown';
  try {
    await casClient.sessionStatus(session.accessToken);
    return 'active';
  } catch (cause) {
    if (!(cause instanceof CasError) || cause.failure.code !== CAS_ERROR_CODES.sessionInvalid) return 'unknown';
    logger.info('CAS reports the session ended; clearing it here');
    dropSession(session.sid);
    forgetTenant(session.sid);
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
    jar.delete(PENDING_SESSION_COOKIE);
    return 'signed_out';
  }
}
