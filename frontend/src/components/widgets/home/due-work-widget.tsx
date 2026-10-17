'use client';

import * as React from 'react';

import { DueWork } from '@/components/home/learner/due-work';
import type { WidgetProps } from '@/types/widget';

export function DueWorkWidget({ title, personaSlug }: WidgetProps): React.ReactElement {
  return <DueWork title={title} personaSlug={personaSlug} />;
}
