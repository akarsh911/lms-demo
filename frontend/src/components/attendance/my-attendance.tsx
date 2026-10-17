'use client';

import * as React from 'react';

import { AttendanceDetail } from '@/components/people/attendance-detail';
import { ATTENDANCE_WINDOW_DAYS } from '@/constants/people-detail';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { useStudentAttendanceDays } from '@/hooks/query/use-student-page';
import { trailingWindow } from '@/lib/people/window';

// A pupil's own year of attendance: each month at a glance, and the reason given for any day away.
export function MyAttendance({ studentId }: { studentId: string }): React.ReactElement {
  const sessions = useMdmSessions();
  const recent = React.useMemo(() => trailingWindow(ATTENDANCE_WINDOW_DAYS), []);
  const start = (sessions.data?.rows.find((row) => row.is_current)?.start_date ?? '').slice(0, 10);
  const window = React.useMemo(() => ({ from: start || recent.from, to: recent.to }), [start, recent]);
  const days = useStudentAttendanceDays(studentId, window, 200);

  return <AttendanceDetail rows={days.data?.rows ?? []} from={window.from} to={window.to} isPending={days.isPending || sessions.isPending} hasMore={Boolean(days.data?.page.has_more)} />;
}
