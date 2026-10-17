'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { SESSION_ENDED } from '@/lib/api-failure';
import { ApiError } from '@/services/api';

export interface PanelProps {
  title: string;
  note?: React.ReactNode;
  blocked?: string;
  isPending?: boolean;
  error?: ApiError | null;
  isEmpty?: boolean;
  empty?: string;
  denied: string;
  unavailable?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
}

export function Panel({
  title,
  note,
  blocked,
  isPending = false,
  error = null,
  isEmpty = false,
  empty,
  denied,
  unavailable,
  onRetry,
  children,
}: PanelProps): React.ReactElement {
  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title={title}
        subheader={note}
        slotProps={{ title: { variant: 'h4', component: 'h2' } }}
      />
      <CardContent>
        {blocked ? (
          <Alert severity="info" variant="outlined">
            {blocked}
          </Alert>
        ) : error ? (
          <PanelProblem
            error={error}
            denied={denied}
            unavailable={unavailable}
            onRetry={onRetry}
          />
        ) : isPending ? (
          <Stack spacing={1}>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} variant="rounded" height={30} />
            ))}
          </Stack>
        ) : isEmpty ? (
          <Typography variant="body2" color="text.secondary">
            {empty}
          </Typography>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function PanelProblem({
  error,
  denied,
  unavailable,
  onRetry,
}: {
  error: ApiError;
  denied: string;
  unavailable?: string;
  onRetry?: () => void;
}): React.ReactElement {
  if (error.isForbidden) {
    return (
      <Alert severity="info" variant="outlined">
        {denied}
      </Alert>
    );
  }

  if (error.status === 404 && unavailable) {
    return (
      <Alert severity="info" variant="outlined">
        {unavailable}
      </Alert>
    );
  }

  if (error.status === 401) {
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
      This could not be loaded.
    </Alert>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
      {children}
    </Typography>
  );
}

export function PanelList({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Stack component="ul" spacing={0} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {children}
    </Stack>
  );
}
