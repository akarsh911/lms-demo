import type { ChipTone } from '@/components/ui/chip';
import type { HalvesState, SessionState } from '@/lib/classroom/section-calendar';
import type { DeviationKind } from '@/types/section-calendar';

export interface SessionPresentation {
  label: string;
  tone: ChipTone;
  note: string;
}

export const SESSION_PRESENTATION: Record<SessionState, SessionPresentation> = {
  open: {
    label: 'In session',
    tone: 'green',
    note: 'The school is open on this date.',
  },
  closed: {
    label: 'Closed',
    tone: 'grey',
    note: 'A day is recorded for this date and both halves of it are shut.',
  },
  unscheduled: {
    label: 'Not on the calendar',
    tone: 'amber',
    note: 'The branch calendar says nothing about this date, so whether the school is open has not been recorded.',
  },
  unknown: {
    label: 'Not readable here',
    tone: 'lilac',
    note: 'A day is recorded for this date, but not one this account may read. Whether the school is open is unknown, which is not the same as closed.',
  },
};

export const HALVES_LABELS: Record<HalvesState, string | null> = {
  both: null,
  forenoon: 'Forenoon only',
  afternoon: 'Afternoon only',
  neither: 'Both halves shut',
  unknown: null,
};

export const DEVIATION_ACTIONS: Record<DeviationKind, string> = {
  cancelled: 'Cancel this lesson',
  substitution: 'Put a substitute on it',
  room_change: 'Move it to another room',
  time_change: 'Change its time',
  added: 'Add a lesson',
};

export const DEVIATION_HINTS: Record<DeviationKind, string> = {
  cancelled: 'The lesson stays on the calendar, struck through, so a teacher can tell a cancelled lesson from one that was never scheduled.',
  substitution: 'Names who is taking the lesson instead. It does not record why the usual teacher is away.',
  room_change: 'Sends this class to a different room for this date only.',
  time_change: 'Moves the start and end of this lesson within the day.',
  added: 'Records a lesson that the weekly pattern does not contain.',
};

export const DEVIATION_REASON_LIMIT = 200;

export const CHANGEABLE_KINDS: readonly DeviationKind[] = [
  'cancelled',
  'substitution',
  'room_change',
  'time_change',
];
