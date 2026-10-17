'use client';

import * as React from 'react';

import { StudentsExplorer } from '@/components/people/directory/students-explorer';
import type { WidgetProps } from '@/types/widget';

// The same explorer as People, answered with the pupils of the teacher's own sections.
export function MyStudentsWidget({ personaSlug }: WidgetProps): React.ReactElement {
  return <StudentsExplorer personaSlug={personaSlug} base="students" />;
}
