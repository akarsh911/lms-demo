import * as React from 'react';
import { CalendarClock, ClipboardCheck, DoorOpen, ListChecks, UserX } from 'lucide-react';

import type { OverviewAttention } from '@/types/foundation';

// One mark per kind of thing that needs attention, so the list can be scanned by shape.
export function AttentionIcon({ kind, size = 20 }: { kind: OverviewAttention['kind']; size?: number }): React.ReactElement {
  if (kind === 'attendance') return <ClipboardCheck size={size} aria-hidden />;
  if (kind === 'room') return <DoorOpen size={size} aria-hidden />;
  if (kind === 'staff') return <UserX size={size} aria-hidden />;
  if (kind === 'setup') return <ListChecks size={size} aria-hidden />;
  return <CalendarClock size={size} aria-hidden />;
}
