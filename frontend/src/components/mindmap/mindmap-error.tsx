'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';

import { WidgetError } from '@/components/widgets/widget-states';
import { mindmapFailure } from '@/lib/mindmap/failure';

export function MindmapError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): React.ReactElement {
  const failure = mindmapFailure(error);
  if (!failure) return <WidgetError error={error} onRetry={onRetry} />;

  const outage = failure.kind === 'outage';

  return (
    <Alert
      severity={outage ? 'warning' : 'info'}
      variant="outlined"
      action={
        outage && onRetry ? (
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      {failure.message}
    </Alert>
  );
}
