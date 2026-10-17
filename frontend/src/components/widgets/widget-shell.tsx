'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Skeleton from '@mui/material/Skeleton';

/**
 * Error isolation for one widget.
 *
 * A dashboard assembled from independent widgets must not be destroyed by one
 * of them. Without a boundary per widget, a single failed data call blanks the
 * whole page — which is a worse outcome than the one broken card.
 */
export class WidgetBoundary extends React.Component<
  { title: string; children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { title: string; children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): React.ReactNode {
    if (this.state.failed) {
      return (
        <Card>
          <CardHeader title={this.props.title} slotProps={{ title: { variant: 'h4' } }} />
          <CardContent>
            <Alert severity="warning" variant="outlined">
              This section could not be loaded. The rest of your dashboard is unaffected.
            </Alert>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

/**
 * The loading placeholder occupies the same footprint as the loaded widget, so
 * the dashboard does not reflow as widgets arrive.
 */
export function WidgetFallback({ title }: { title: string }): React.ReactElement {
  return (
    <Card>
      <CardHeader title={title} slotProps={{ title: { variant: 'h4' } }} />
      <CardContent>
        <Skeleton variant="rounded" height={96} />
      </CardContent>
    </Card>
  );
}
