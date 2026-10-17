'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { apiFailureKind, SESSION_ENDED } from '@/lib/api-failure';

/**
 * The four states every widget must render. Shared so they look identical
 * everywhere and so nobody reinvents "loading" per widget.
 */

export function WidgetLoading({ rows = 3 }: { rows?: number }): React.ReactElement {
  return (
    <Stack spacing={1}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={32} />
      ))}
    </Stack>
  );
}

export function WidgetEmpty({ message }: { message: string }): React.ReactElement {
  return (
    <Typography variant="body2" color="text.secondary">
      {message}
    </Typography>
  );
}

/**
 * A failed widget.
 *
 * A 403 is separated out on purpose. It is not a malfunction: it is CAS
 * declining the request, which is the authorization answer that actually
 * matters. The UI gate decided this panel was worth OFFERING; CAS decides
 * whether the data may be READ. Showing "something went wrong, retry" for a
 * denial invites the user to hammer an endpoint that will keep refusing.
 */
export function WidgetError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): React.ReactElement {
  const kind = apiFailureKind(error);

  if (kind === 'denied') {
    return (
      <Alert severity="info" variant="outlined">
        You do not have access to this data.
      </Alert>
    );
  }

  if (kind === 'signed_out') {
    return (
      <Alert severity="warning" variant="outlined">
        {SESSION_ENDED}
      </Alert>
    );
  }

  return (
    <Alert
      severity="warning"
      variant="outlined"
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      This panel could not be loaded.
    </Alert>
  );
}

export function WidgetDegraded({
  error,
  denied,
  unavailable,
}: {
  error: unknown;
  denied: string;
  unavailable: string;
}): React.ReactElement {
  const kind = apiFailureKind(error);

  if (kind === 'denied') {
    return (
      <Alert severity="info" variant="outlined">
        {denied}
      </Alert>
    );
  }

  return (
    <Alert severity="warning" variant="outlined">
      {kind === 'signed_out' ? SESSION_ENDED : unavailable}
    </Alert>
  );
}
