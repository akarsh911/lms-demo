import * as React from 'react';
import { notFound } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { IdentitiesPanel } from '@/components/account/identities-panel';
import { TotpPanel } from '@/components/account/totp-panel';
import { TwoFactorPanel } from '@/components/account/two-factor-panel';
import { loadAccountSecurity } from '@/server/account/security';
import { paths } from '@/paths';
import { requirePersona } from '@/server/dal';
import { googleLinkUrl, isSsoEnabled } from '@/server/sso/config';

type SecuritySearchParams = { linked?: string | string[]; link_error?: string | string[] };

function single(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : null;
}

export default async function AccountSecurityPage({
  params,
  searchParams,
}: {
  params: Promise<{ persona: string }>;
  searchParams: Promise<SecuritySearchParams>;
}): Promise<React.ReactElement> {
  const { persona: slug } = await params;
  if (!isSsoEnabled()) notFound();
  const query = await searchParams;
  const { session } = await requirePersona(slug);
  const load = await loadAccountSecurity(session);
  const linkReturn = { linked: single(query.linked), linkError: single(query.link_error) };

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <div>
        <Typography variant="h2" component="h1">
          Account security
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Two-step verification and the accounts you sign in with.
        </Typography>
      </div>
      {load.status === 'ok' ? (
        <React.Fragment>
          {load.view.twoFactor ? <TwoFactorPanel view={load.view.twoFactor} /> : null}
          <TotpPanel enrolled={load.view.totpEnrolled} recoveryCodesRemaining={load.view.recoveryCodesRemaining} />
          <IdentitiesPanel
            identities={load.view.identities}
            googleLinkUrl={googleLinkUrl(paths.accountSecurity(slug))}
            linked={linkReturn.linked}
            linkError={linkReturn.linkError}
          />
        </React.Fragment>
      ) : (
        <Alert severity="warning">Account security settings could not be loaded. Try again shortly.</Alert>
      )}
    </Stack>
  );
}
