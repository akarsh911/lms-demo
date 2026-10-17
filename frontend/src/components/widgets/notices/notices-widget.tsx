'use client';

import * as React from 'react';

import { NoticesBoard } from '@/components/notices/notices-board';
import type { WidgetProps } from '@/types/widget';

export function NoticesWidget(_: WidgetProps): React.ReactElement {
  return <NoticesBoard />;
}
