'use client';

import * as React from 'react';

import { MySubjects } from '@/components/subjects/my-subjects';
import type { WidgetProps } from '@/types/widget';

export function MySubjectsWidget({ personaSlug }: WidgetProps): React.ReactElement {
  return <MySubjects personaSlug={personaSlug} />;
}
