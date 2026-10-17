import * as React from 'react';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

/**
 * A widget the user holds but cannot currently use.
 *
 * Shown rather than dropped: vanishing is indistinguishable from never having
 * had it, and a principal whose KPI card disappears during an incident will
 * assume their access was revoked.
 */
export function DisabledWidget({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}): React.ReactElement {
  return (
    <Card sx={{ height: '100%', opacity: 0.72 }}>
      <CardHeader title={title} slotProps={{ title: { variant: 'h4' } }} />
      <CardContent>
        <Alert severity="info" variant="outlined">
          {hint ?? 'Temporarily unavailable.'}
        </Alert>
      </CardContent>
    </Card>
  );
}
