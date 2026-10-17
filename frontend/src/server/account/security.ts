import 'server-only';

import { toTwoFactorView } from '@/lib/auth/two-factor';
import { logger } from '@/lib/logger';
import { casClient } from '@/server/cas/client';
import { isDevBypass } from '@/server/dev/bypass';
import type { SessionPayload } from '@/server/session/cookie';
import type { AccountSecurityView } from '@/types/account';
import type { LinkedIdentity, MfaStatus } from '@/types/cas';

export type AccountSecurityLoad = { status: 'ok'; view: AccountSecurityView } | { status: 'unavailable' };

const DEMO_VIEW: AccountSecurityView = {
  totpEnrolled: false,
  totpConfirmedAt: null,
  recoveryCodesRemaining: 0,
  email: null,
  identities: [],
  twoFactor: null,
};

function viewOf(mfa: MfaStatus, identities: LinkedIdentity[]): AccountSecurityView {
  return {
    totpEnrolled: mfa.totp.enrolled,
    totpConfirmedAt: mfa.totp.confirmed_at ?? null,
    recoveryCodesRemaining: mfa.recovery_codes_remaining,
    email: mfa.email || null,
    identities: identities.map((identity) => ({
      provider: identity.provider,
      email: identity.email,
      createdAt: identity.created_at,
      lastUsedAt: identity.last_used_at ?? null,
    })),
    twoFactor: toTwoFactorView(mfa),
  };
}

export async function loadAccountSecurity(session: SessionPayload): Promise<AccountSecurityLoad> {
  if (isDevBypass()) return { status: 'ok', view: DEMO_VIEW };
  try {
    const [mfa, identities] = await Promise.all([
      casClient.mfaStatus(session.accessToken),
      casClient.identities(session.accessToken),
    ]);
    return { status: 'ok', view: viewOf(mfa, identities) };
  } catch (cause) {
    logger.warn('account security could not be loaded from CAS', { cause });
    return { status: 'unavailable' };
  }
}
