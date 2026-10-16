import type { ChipTone } from '@/components/ui/chip';
import type { OccurrenceState } from '@/types/classroom';

export const CLASSROOM_PAGE_SIZE = 25;

export interface OccurrencePresentation {
  label: string | null;
  tone: ChipTone;
  struck: boolean;
}

export const OCCURRENCE_STATES: Record<OccurrenceState, OccurrencePresentation> = {
  planned: { label: null, tone: 'grey', struck: false },
  cancelled: { label: 'Cancelled', tone: 'red', struck: true },
  substituted: { label: 'Substitute teacher', tone: 'amber', struck: false },
  relocated: { label: 'Room changed', tone: 'blue', struck: false },
  rescheduled: { label: 'Time changed', tone: 'amber', struck: false },
  added: { label: 'Extra class', tone: 'green', struck: false },
};

const UNKNOWN_STATE: OccurrencePresentation = {
  label: 'Changed',
  tone: 'grey',
  struck: false,
};

export function occurrencePresentation(state: string): OccurrencePresentation {
  return OCCURRENCE_STATES[state as OccurrenceState] ?? UNKNOWN_STATE;
}

const STATUS_TONES: Record<string, ChipTone> = {
  active: 'green',
  published: 'green',
  graded: 'green',
  submitted: 'blue',
  returned: 'amber',
  late: 'red',
  draft: 'grey',
  closed: 'grey',
  archived: 'grey',
  inactive: 'grey',
};

export function statusTone(status: string | undefined): ChipTone {
  return status ? (STATUS_TONES[status] ?? 'grey') : 'grey';
}

export const CLASS_TABS = [
  { slug: 'students', label: 'Students' },
  { slug: 'subjects', label: 'Subjects' },
  { slug: 'calendar', label: 'Calendar' },
  { slug: 'stream', label: 'Stream' },
] as const;

export type ClassTabSlug = (typeof CLASS_TABS)[number]['slug'];

export const SUBJECT_TABS = [
  { slug: 'stream', label: 'Stream' },
  { slug: 'content', label: 'Content' },
  { slug: 'assignments', label: 'Assignments' },
  { slug: 'curriculum', label: 'Curriculum' },
] as const;

export type SubjectTabSlug = (typeof SUBJECT_TABS)[number]['slug'];

export function tabIndexOf(
  tabs: readonly { slug: string }[],
  slug: string | null,
): number {
  const at = tabs.findIndex((tab) => tab.slug === slug);
  return at === -1 ? 0 : at;
}

export const STREAM_TITLE_LIMIT = 200;
export const STREAM_BODY_LIMIT = 20000;
export const ASSIGNMENT_TITLE_LIMIT = 200;
export const ASSIGNMENT_TEXT_LIMIT = 20000;

export const POST_TYPES = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'resource', label: 'Something to read or watch' },
  { value: 'question', label: 'A question for the class' },
] as const;

export const ASSIGNMENT_TYPES = [
  { value: 'worksheet', label: 'Worksheet' },
  { value: 'practice', label: 'Practice' },
  { value: 'reading', label: 'Reading' },
  { value: 'project', label: 'Project' },
  { value: 'test', label: 'Test' },
] as const;
