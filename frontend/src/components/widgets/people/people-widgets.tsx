'use client';

import * as React from 'react';

import { StudentsExplorer } from '@/components/people/directory/students-explorer';
import { TeachersDirectory } from '@/components/people/directory/teachers-directory';
import type { WidgetProps } from '@/types/widget';

export function StudentsExplorerWidget({ personaSlug }: WidgetProps): React.ReactElement {
  return <StudentsExplorer personaSlug={personaSlug} />;
}

export function TeachersDirectoryWidget({ personaSlug }: WidgetProps): React.ReactElement {
  return <TeachersDirectory personaSlug={personaSlug} />;
}
