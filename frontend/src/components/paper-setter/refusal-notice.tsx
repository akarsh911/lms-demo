'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { IdentifierList } from '@/components/people/copy-id';
import { SESSION_ENDED, apiFailureKind } from '@/lib/api-failure';
import { ApiError } from '@/services/api';

import type { Refusal } from './contract';
import { headlineFor, namedReasonsOf, offendingIds, refusalFrom } from './refusal';

export function refusalOf(error: unknown): Refusal | null {
  if (!(error instanceof ApiError)) return null;
  return refusalFrom(error.status, error.details);
}

export function RefusalNotice({
  error,
  title,
  onRetry,
}: {
  error: unknown;
  title: string;
  onRetry?: () => void;
}): React.ReactElement | null {
  if (!error) return null;

  const refusal = refusalOf(error);
  const kind = apiFailureKind(error);

  if (refusal) {
    const ids = offendingIds(refusal);
    const troubles = namedReasonsOf(refusal);
    return (
      <Alert
        severity="warning"
        variant="outlined"
        action={
          onRetry && !refusal.signedOut ? (
            <Button size="small" onClick={onRetry}>
              Try again
            </Button>
          ) : undefined
        }
      >
        <AlertTitle>{headlineFor(refusal, title)}</AlertTitle>
        <Stack spacing={1}>
          <Typography variant="body2">{refusal.message}</Typography>
          {troubles.map((trouble) => (
            <Box key={trouble.code}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {trouble.label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {trouble.sentence}
              </Typography>
            </Box>
          ))}
          {ids.length > 0 ? (
            <IdentifierList
              entries={ids.map((value, index) => ({
                label: ids.length === 1 ? 'The id this refers to' : `Id ${index + 1}`,
                value,
              }))}
            />
          ) : null}
        </Stack>
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

  if (kind === 'denied') {
    return (
      <Alert severity="info" variant="outlined">
        <AlertTitle>{title}</AlertTitle>
        {error instanceof ApiError && error.message.trim() !== ''
          ? error.message
          : 'Your school does not permit you to set papers from this curriculum.'}
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
            Try again
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>{title}</AlertTitle>
      {error instanceof ApiError && error.message.trim() !== ''
        ? error.message
        : 'The paper service could not be reached. Nothing has been spent and nothing has been lost.'}
    </Alert>
  );
}
