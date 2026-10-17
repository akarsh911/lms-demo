'use client';

import * as React from 'react';

import { MyLeave } from '@/components/leave/my-leave';
import { PupilLeaveNotes } from '@/components/leave/pupil-leave';
import { WidgetLoading } from '@/components/widgets/widget-states';
import { useReach } from '@/hooks/query/use-reach';
import type { WidgetProps } from '@/types/widget';

// A teacher applies for their own leave; a pupil sends leave notes to their class teacher.
export function MyLeaveWidget(_: WidgetProps): React.ReactElement {
  const reach = useReach();
  if (!reach) return <WidgetLoading rows={4} />;
  return reach.kind === 'self' ? <PupilLeaveNotes /> : <MyLeave />;
}
