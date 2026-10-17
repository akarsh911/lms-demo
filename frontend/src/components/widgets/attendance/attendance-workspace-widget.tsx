'use client';

import * as React from 'react';

import { AttendanceWorkspace } from '@/components/attendance/attendance-workspace';
import { MyAttendance } from '@/components/attendance/my-attendance';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { useReach } from '@/hooks/query/use-reach';
import type { WidgetProps } from '@/types/widget';

// The office and teachers see registers; a pupil sees their own attendance.
export function AttendanceWorkspaceWidget(_: WidgetProps): React.ReactElement {
  const reach = useReach();
  if (!reach) return <WidgetLoading rows={8} />;
  return reach.kind === 'self' ? <MyAttendance studentId={reach.studentId} /> : <AttendanceWorkspace />;
}
