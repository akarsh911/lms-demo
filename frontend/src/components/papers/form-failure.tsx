'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { IdentifierList } from '@/components/people/copy-id';
import { WidgetError } from '@/components/widgets/widget-states';
import { NOT_A_PERSON_HERE, SESSION_ENDED, isNotAPersonHere } from '@/lib/api-failure';
import { deniedFieldsFrom } from '@/lib/core/fields';
import { PUBLISHED_PAPER_IS_SETTLED } from '@/lib/papers/paper';
import { ApiError } from '@/services/api';
import { unlinkedIdentity } from '@/services/papersetter';

export const PAPER_SETTLED_CODE = 'paper_is_published';

export function isSettledPaperRefusal(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const details = error.details;
  if (typeof details !== 'object' || details === null) return false;
  return (details as { error?: unknown }).error === PAPER_SETTLED_CODE;
}

export function PaperFormError({ error }: { error: unknown }): React.ReactElement | null {
  if (!error) return null;

  if (isNotAPersonHere(error)) {
    return (
      <Alert severity="warning" variant="outlined">
        <AlertTitle>Your account is not a person at this school yet</AlertTitle>
        {NOT_A_PERSON_HERE}
      </Alert>
    );
  }

  if (isSettledPaperRefusal(error)) {
    return (
      <Alert severity="info" variant="outlined">
        <AlertTitle>This paper is published</AlertTitle>
        {PUBLISHED_PAPER_IS_SETTLED}
      </Alert>
    );
  }

  if (error instanceof ApiError && error.status === 401) {
    return (
      <Alert severity="warning" variant="outlined">
        {SESSION_ENDED}
      </Alert>
    );
  }

  const denied = error instanceof ApiError ? deniedFieldsFrom(error.message) : [];
  if (denied.length > 0) {
    return (
      <Alert severity="error" variant="outlined">
        <AlertTitle>Some of these fields are not yours to write</AlertTitle>
        <Typography variant="body2">
          Your school does not permit you to set {denied.join(', ')}. Nothing was
          saved. Clear those and save again.
        </Typography>
      </Alert>
    );
  }

  return (
    <Alert severity="error" variant="outlined">
      {error instanceof ApiError && error.message.trim() !== ''
        ? error.message
        : 'That could not be saved. Try again in a moment.'}
    </Alert>
  );
}

export function PaperReadFailure({
  error,
  onRetry,
  missing,
}: {
  error: unknown;
  onRetry?: () => void;
  missing?: string;
}): React.ReactElement {
  if (error instanceof ApiError && error.code === 'service_unconfigured') {
    return (
      <Alert severity="info" variant="outlined">
        <AlertTitle>The paper bank is not switched on here</AlertTitle>
        This deployment has no paper service behind it yet, so there is nothing to
        show. Nothing has been lost and nothing is broken.
      </Alert>
    );
  }

  const unlinked = unlinkedIdentity(error);
  if (unlinked) {
    return (
      <Alert severity="info" variant="outlined">
        <AlertTitle>Your account is not linked on the paper service yet</AlertTitle>
        <Stack spacing={1}>
          <Typography variant="body2">
            Some of this comes from paper-setter, which keeps its own list of staff. It
            has nobody on that list against your sign-in, so it will not answer until
            somebody puts you there.
          </Typography>
          <Typography variant="body2">
            An administrator can link you on the paper service&rsquo;s{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>
              /admin/school
            </Box>{' '}
            page, against this id:
          </Typography>
          <IdentifierList entries={[{ label: 'CAS user id', value: unlinked.casSubject }]} />
        </Stack>
      </Alert>
    );
  }

  if (isNotAPersonHere(error)) {
    return (
      <Alert severity="warning" variant="outlined">
        <AlertTitle>Your account is not a person at this school yet</AlertTitle>
        {NOT_A_PERSON_HERE}
      </Alert>
    );
  }

  if (missing && error instanceof ApiError && error.status === 404) {
    return (
      <Alert severity="info" variant="outlined">
        {missing}
      </Alert>
    );
  }

  return <WidgetError error={error} onRetry={onRetry} />;
}
