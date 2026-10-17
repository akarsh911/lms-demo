'use client';

import * as React from 'react';

import { MyCalendar } from '@/components/calendar/my-calendar';
import type { WidgetProps } from '@/types/widget';

export function MyCalendarWidget(_: WidgetProps): React.ReactElement {
  return <MyCalendar />;
}
