'use client';

import * as React from 'react';

import { AttendanceRegister } from '@/components/attendance/attendance-register';
import { useUrlState } from '@/components/school/url-state';
import { useIdentity } from '@/hooks/query/use-identity';
import { isIsoDate, todayInSchool } from '@/lib/classroom/week';

// The section's register, the same one the Attendance page uses; the day is kept in the URL.
export function SectionAttendance({ sectionId, label, editable }: { sectionId: string; label: string; editable: boolean }): React.ReactElement {
  const { get, put } = useUrlState();
  const identity = useIdentity();
  const today = todayInSchool(identity.data?.school?.timezone);
  const asked = get('day');
  const date = isIsoDate(asked) && asked <= today ? asked : today;
  return <AttendanceRegister sectionId={sectionId} label={label} date={date} today={today} onDate={(next) => put({ day: next === today ? null : next })} editable={editable} />;
}
