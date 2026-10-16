import type { StructureFix } from './structure';

// The school foundation: what a principal sets up before classes, people and a timetable exist.
// Everything here except rooms and years is served by fixtures only; no backend has it yet.

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type WorkingDays = Record<Weekday, boolean>;

export interface WorkingWeek {
  academic_session_id: string;
  days: WorkingDays;
}

// Dates are plain `YYYY-MM-DD`.
// A year is the school's whole register for that session. Its calendar is one tab of seven, not what the year is.
export const YEAR_TABS = ['overview', 'students', 'classes', 'teachers', 'examinations', 'calendar', 'actions'] as const;

export type YearTab = (typeof YEAR_TABS)[number];

export const CALENDAR_PARTS = ['working-days', 'holidays', 'bell-schedules'] as const;

export type CalendarPart = (typeof CALENDAR_PARTS)[number];

export interface YearIssue {
  code: 'no_working_days' | 'no_schedule';
  message: string;
  part: CalendarPart;
}

export interface YearSummary {
  academic_session_id: string;
  working_days: Weekday[];
  holiday_count: number;
  schedule_count: number;
  default_schedule: string | null;
  issues: YearIssue[];
}

export type SetupStatus = 'complete' | 'attention' | 'not_started';

// `route` is a key in the route registry, never a URL: the screen builds the link and decides if it is reachable.
export interface SetupItem {
  key: string;
  title: string;
  explanation: string;
  detail: string;
  status: SetupStatus;
  route: string | null;
  // A record under that route, when the row is about one in particular.
  id?: string;
}

export interface SchoolSetup {
  items: SetupItem[];
  complete: number;
  total: number;
}

export interface SchoolProfile {
  name: string;
  short_name: string;
  current_year: string | null;
  phone: string;
  email: string;
  address: string;
}

export type SchoolProfileWrite = Pick<SchoolProfile, 'name' | 'short_name' | 'phone' | 'email' | 'address'>;

export interface OverviewLink {
  route: string;
  id?: string;
  tab?: string;
  // A filter or sub-view on that tab.
  view?: string;
  // Opens the year's setup workspace rather than the year itself.
  setup?: boolean;
  // The dialog to open on arrival, as a section page's `?act=`.
  act?: string;
}

export interface OverviewAttention {
  id: string;
  kind: 'attendance' | 'room' | 'staff' | 'setup' | 'timetable';
  title: string;
  detail?: string;
  action: string;
  // Null when the place that would resolve it is not built yet.
  link: OverviewLink | null;
}

export interface OverviewCount {
  value: number;
  total: number;
}

export interface OverviewSummary {
  students: OverviewCount;
  staff: OverviewCount;
  attendance: OverviewCount;
  events_today: number;
}

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  detail?: string;
}

export interface SchoolOverview {
  academic_year: string | null;
  primary: OverviewAttention | null;
  summary: OverviewSummary;
  needs: OverviewAttention[];
  agenda: AgendaItem[];
}

export const ROOM_STATUSES = ['active', 'maintenance', 'unavailable', 'archived'] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

export interface RoomUnavailability {
  from: string;
  until: string | null;
  reason: string;
}

export type RoomAvailability = 'available' | 'in_use' | 'maintenance' | 'unavailable';

export interface RoomUsageEntry {
  id: string;
  starts: string;
  ends: string;
  title: string;
}

export interface RoomIssue {
  code: 'over_capacity' | 'unavailable';
  message: string;
}

// What the school knows about a room beyond its own columns: who uses it, when, and what is wrong.
export interface RoomInsight {
  room_id: string;
  primary_use: string | null;
  primary_size: number | null;
  availability: RoomAvailability;
  today: RoomUsageEntry[];
  upcoming: RoomUsageEntry[];
  issues: RoomIssue[];
}

// --- the year as a register ---------------------------------------------------------

// How a pupil came to be in a year's class. Leaving is a status, not an entry.
export type YearEntry = 'new_admission' | 'continuing' | 'promoted' | 'retained';

export type NextYearDisposition = 'promote' | 'retain' | 'graduate' | 'not_returning' | 'undecided';

export type DocumentState = 'pending' | 'issued' | 'not_required';

// A paper the school owes a pupil who has left. Its state is separate from the fact of leaving.
export interface EnrollmentDocument {
  key: string;
  label: string;
  state: DocumentState;
}

// Being prepared, running, or over. A closed year is a record: it is read, not edited.
export type YearLifecycle = 'draft' | 'active' | 'closed';

export type EnrollmentStatus = YearEntry | 'withdrawn' | 'graduated';

// One pupil's place in one year, as a row a person reads. Every student view of a year is a filter over these.
export interface YearEnrollment {
  id: string;
  student_id: string;
  name: string;
  admission_number: string;
  grade_level_id: string;
  class_name: string;
  class_order: number;
  // Null while the pupil is enrolled but not yet placed. They stay on every list regardless.
  section_id: string | null;
  section_name: string | null;
  roll_number: string | null;
  status: EnrollmentStatus;
  joined: string;
  left: string | null;
  leaving_reason: string | null;
  destination: string | null;
  documents: EnrollmentDocument[];
  next_year: NextYearDisposition | null;
  // Changes of section during the year, oldest first, written as short names (7A).
  moves: { date: string; from: string; to: string; reason: string }[];
  pending: string[];
}

export const SETUP_AREAS = [
  'basic',
  'structure',
  'classes',
  'students',
  'admissions',
  'teachers',
  'rooms',
  'subjects',
  'learning',
  'access',
  'timetable',
  'review',
] as const;

export type SetupAreaKey = (typeof SETUP_AREAS)[number];

export type SetupAreaState = 'not_started' | 'in_progress' | 'attention' | 'ready' | 'blocked';

export interface YearSetupArea {
  key: SetupAreaKey;
  title: string;
  state: SetupAreaState;
  summary: string;
  issues: number;
  // What has to be finished first, when the state is blocked.
  blocked_by: string | null;
  // The module that will own this area's detailed workspace, when it is not built into the year yet.
  module: string | null;
  // A page that exists today for it, as a route key.
  route: string | null;
  facts: string[];
}

// One thing somebody has to do. Home, School Setup and the year all show these, and none keeps its own copy.
export interface PendingTask {
  id: string;
  // What kind of work it is, stable across years: 'placement', 'documents', 'rooms', 'class-teacher', 'teaching', or a calendar issue code.
  kind: string;
  scope: 'student' | 'class' | 'teacher' | 'room' | 'year';
  title: string;
  detail: string;
  count: number;
  tab: YearTab;
  // A filter or sub-view on that tab to open at.
  view?: string;
  // The page outside the year that resolves it, as a route key, when there is one.
  route?: string;
  // A class or section of this year, and what to open there to fix it.
  target?: { grade_level_id: string; section_id: string | null; fix: StructureFix };
}

export interface YearRegister {
  academic_session_id: string;
  lifecycle: YearLifecycle;
  enrolled: number;
  active: number;
  new_admissions: number;
  withdrawn: number;
  retained: number;
  promoted: number;
  graduated: number;
  final_grade: number;
  unassigned: number;
  documents_pending: number;
  sections: number;
  sections_with_room: number;
  sections_with_class_teacher: number;
  // Null where the year has no teaching record to count.
  teachers: number | null;
  areas_ready: number;
  areas_total: number;
  pending_items: number;
  open_areas: string[];
}

export interface YearClassRow {
  grade_level_id: string;
  class_name: string;
  sections: number;
  students: number;
  unassigned: number;
  rooms_assigned: number;
  class_teachers: number;
}

export interface SectionSubjectTeacher {
  offering_id: string;
  subject: string;
  teacher_id: string | null;
  teacher: string | null;
}

// Teaching seen from a section: who takes each subject, and who is its class teacher.
export interface YearSectionTeaching {
  section_id: string;
  class_name: string;
  section_name: string;
  class_order: number;
  class_teacher: string | null;
  subjects: SectionSubjectTeacher[];
}

// Teaching seen from a teacher: what they carry this year, and when they were part of it.
export interface YearTeacherLoad {
  teacher_id: string;
  name: string;
  specialization: string | null;
  class_teacher_of: string | null;
  assignments: { section: string; subject: string }[];
  joined: string | null;
  left: string | null;
}

export type TeachingChangeKind = 'joined' | 'left' | 'assigned' | 'reassigned' | 'class_teacher' | 'vacant';

// One staffing incident in the year, with what it changed for the classes.
export interface TeachingChange {
  id: string;
  date: string;
  kind: TeachingChangeKind;
  teacher: string;
  title: string;
  impact: string[];
}

export interface YearTeaching {
  teachers: number | null;
  class_teachers: OverviewCount;
  assignments: OverviewCount;
  by_section: YearSectionTeaching[];
  by_teacher: YearTeacherLoad[];
  changes: TeachingChange[];
}

export const EVENT_KINDS = ['exam', 'internal', 'holiday', 'ptm', 'trip', 'camp', 'event', 'personal'] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

// Anything that happened to the whole school on a date: an examination window, a holiday, a trip, a PTM.
export interface YearEvent {
  id: string;
  kind: EventKind;
  title: string;
  start: string;
  end: string;
  detail: string | null;
  audience: string | null;
}

export type YearEventWrite = Pick<YearEvent, 'kind' | 'title' | 'start' | 'end' | 'detail' | 'audience'>;


export interface YearTransition {
  lifecycle: YearLifecycle;
  // The year after this one, when it has been created.
  next: { id: string; name: string; areas_ready: number; areas_total: number } | null;
  plans: Record<NextYearDisposition, number>;
  // How the year ended, for one that is closed.
  outcome: { promoted: number; retained: number; graduated: number; withdrawn: number; not_continued: number };
}
