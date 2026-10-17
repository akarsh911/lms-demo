'use client';

import * as React from 'react';

import { MyClassCard } from '@/components/home/learner/my-class-card';
import type { WidgetProps } from '@/types/widget';

export function MyClassWidget({ title }: WidgetProps): React.ReactElement | null {
  return <MyClassCard title={title} />;
}
