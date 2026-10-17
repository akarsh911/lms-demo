import * as React from 'react';
import type { Metadata } from 'next';

import { AuthShell } from '@/components/auth/auth-shell';
import { SignInForm } from '@/components/auth/sign-in-form';
import { config } from '@/config';
import { NEXT_PARAM, safeNextPath } from '@/lib/auth/next-path';
import { SSO_ERROR_PARAM, ssoErrorKindOf, ssoErrorText } from '@/lib/auth/sso-errors';
import { paths } from '@/paths';
import { isSsoEnabled, ssoMode, ssoProviderButtons } from '@/server/sso/config';

export const metadata: Metadata = { title: 'Sign in' };

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const query = await searchParams;
  const kind = ssoErrorKindOf(first(query[SSO_ERROR_PARAM]));
  const appName = config.site.name;

  return (
    <AuthShell>
      <SignInForm
        options={{
          appName,
          next: safeNextPath(first(query[NEXT_PARAM]), paths.root),
          notice: kind ? { text: ssoErrorText(kind, appName), severity: kind === 'signed_out' ? 'info' : 'error' } : null,
          sso: isSsoEnabled() ? { popup: ssoMode() === 'popup', providers: ssoProviderButtons() } : null,
        }}
      />
    </AuthShell>
  );
}
