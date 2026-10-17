'use client';

import * as React from 'react';

import { ActionsBoard } from '@/components/actions/actions-board';
import type { WidgetProps } from '@/types/widget';

export function ActionsWidget({ personaSlug }: WidgetProps): React.ReactElement {
  return <ActionsBoard personaSlug={personaSlug} />;
}
