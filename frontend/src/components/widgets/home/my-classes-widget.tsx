'use client';

import * as React from 'react';

import { MyClassesCard } from '@/components/home/teaching/my-classes-card';
import type { WidgetProps } from '@/types/widget';

export function MyClassesWidget({ title, personaSlug }: WidgetProps): React.ReactElement {
  return <MyClassesCard title={title} personaSlug={personaSlug} />;
}
