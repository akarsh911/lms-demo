'use client';

import * as React from 'react';

import { FeesOverview } from '@/components/fees/fees-overview';
import { MyFees } from '@/components/fees/my-fees';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { useReach } from '@/hooks/query/use-reach';
import type { WidgetProps } from '@/types/widget';

// The office reads the fee book; a pupil reads their own instalments.
export function FeesWidget(_: WidgetProps): React.ReactElement {
  const reach = useReach();
  if (!reach) return <WidgetLoading rows={4} />;
  return reach.kind === 'self' ? <MyFees /> : <FeesOverview />;
}
