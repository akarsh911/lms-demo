'use client';

import * as React from 'react';

import type { WidgetProps } from '@/types/widget';

import { RosterWidget } from './roster-widget';

// Everyone who is neither a pupil nor a teacher: office and support staff, and the guardians on record.
export function StaffDirectoryWidget(props: WidgetProps): React.ReactElement {
  return <RosterWidget {...props} kinds={['staff', 'guardians']} />;
}
