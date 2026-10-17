'use client';

import * as React from 'react';

import { MyTimetable } from '@/components/timetable/my-timetable';
import type { WidgetProps } from '@/types/widget';

export function MyTimetableWidget({ personaSlug }: WidgetProps): React.ReactElement {
  return <MyTimetable personaSlug={personaSlug} />;
}
