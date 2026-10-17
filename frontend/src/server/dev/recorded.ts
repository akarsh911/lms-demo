import 'server-only';

// Recorded 2026-10-01 from the live `dps-ngp` tenant, signed in as its principal: the keys CAS decided
// (`registry ∩ /v1/me`), every one `scope_match` on `emerge-leadership`. Keys absent here have no CAS row and inherit.
export const PRINCIPAL_SCOPE = 'emerge-leadership';

export const PRINCIPAL_TENANT = { key: 'dps-ngp', name: 'DPS Nagpur' } as const;

export const PRINCIPAL_KEYS: readonly string[] = [
  'emerge.analytics', 'emerge.announcements', 'emerge.assignments', 'emerge.attendance',
  'emerge.attendance.picker', 'emerge.attendance.roster', 'emerge.attendance.summary', 'emerge.fees',
  'emerge.grades', 'emerge.grades.marks', 'emerge.grades.results', 'emerge.home', 'emerge.home.announcements',
  'emerge.home.classes', 'emerge.home.classes.sections', 'emerge.home.library', 'emerge.home.library.curriculum',
  'emerge.home.library.items', 'emerge.home.people', 'emerge.home.people.admissions',
  'emerge.home.people.roster', 'emerge.home.profile', 'emerge.home.profile.identity', 'emerge.home.timetable',
  'emerge.learning', 'emerge.learning.flashcards', 'emerge.learning.flashcards.study', 'emerge.learning.labs',
  'emerge.learning.labs.attempts', 'emerge.learning.labs.bench', 'emerge.learning.mindmap',
  'emerge.learning.mindmap.canvas', 'emerge.learning.papers', 'emerge.learning.papers.list', 'emerge.school',
  'emerge.school.calendar', 'emerge.school.calendar.days', 'emerge.school.exams',
  'emerge.school.exams.campaigns', 'emerge.school.exams.papers', 'emerge.school.offerings',
  'emerge.school.offerings.list', 'emerge.school.offerings.results', 'emerge.school.offerings.teaching',
  'emerge.school.periods', 'emerge.school.periods.grades', 'emerge.school.periods.schemes',
  'emerge.school.rooms', 'emerge.school.rooms.list', 'emerge.school.sections', 'emerge.school.sections.list',
  'emerge.school.sections.roster', 'emerge.school.structure', 'emerge.school.structure.branches',
  'emerge.school.structure.grades', 'emerge.school.structure.houses', 'emerge.school.structure.sessions',
  'emerge.school.subjects', 'emerge.school.subjects.catalogue', 'emerge.school.subjects.groups',
  'emerge.school.timetable', 'emerge.school.timetable.builder', 'emerge.timetable',
];
