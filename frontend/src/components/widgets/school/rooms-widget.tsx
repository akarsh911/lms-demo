'use client';

import * as React from 'react';

import { RoomsBoard } from '@/components/school/rooms/rooms-board';
import type { WidgetProps } from '@/types/widget';

export function SchoolRoomsWidget({ personaSlug }: WidgetProps): React.ReactElement {
  return <RoomsBoard personaSlug={personaSlug} />;
}
