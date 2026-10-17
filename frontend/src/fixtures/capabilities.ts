import type { Capability, CapabilityBreadth, CapabilityField } from '@/types/core';

import { CORE_ENTITIES, GUARDIAN_ENTITIES, STUDENT_ENTITIES, TEACHER_ENTITIES } from './data/entities';
import { ASSIGNMENTS, ATTENDANCE_PERIODS, STREAM_COMMENTS, STREAM_POSTS, SUBJECT_ENROLLMENTS, SUBMISSIONS } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { CONTENT_ITEMS, CURRICULA, PLACEMENTS } from './data/library';
import { BLUEPRINTS, PAPERS } from './data/papers';
import { GUARDIANS, STAFF, STUDENTS, TEACHERS } from './data/people';
import { OFFERINGS, ROOMS, SECTIONS, SESSIONS } from './data/structure';
import { CALENDAR_DAYS, SLOTS, TEACHER_ASSIGNMENTS } from './data/timetable';

export const PERSON_COLUMNS = [
  'first_name', 'middle_name', 'last_name', 'display_name', 'date_of_birth',
  'gender', 'email', 'phone', 'profile_photo_asset_id', 'status',
] as const;

const PERSON_SELF_WRITABLE: readonly string[] = ['first_name', 'middle_name', 'last_name', 'display_name', 'phone'];

const SCHOOL_WIDE_USERS: ReadonlySet<string> = new Set(['admin', 'superadmin']);

const NARROWED: Readonly<Record<string, readonly string[]>> = { parent: GUARDIAN_ENTITIES, student: STUDENT_ENTITIES };

const VERB_NAMES: Readonly<Record<string, string>> = {
  read: 'Read %s',
  read_all: 'Read all %s',
  write: 'Create and edit %s',
  write_all: 'Create and edit any %s',
  delete: 'Delete %s',
  delete_all: 'Delete any %s',
  create: 'Add %s',
  override: 'Override a %s clash',
  generate: 'Auto-fill a %s',
};

const SERVER_OWNED = new Set(['id', 'created_at', 'updated_at', 'edges']);

const label = (segment: string): string => segment.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const field = (key: string): CapabilityField => ({ key, name: label(key), data_type: 'string' });

function columnsOf(rows: readonly object[]): string[] {
  const keys = new Set<string>();
  for (const row of rows.slice(0, 50)) for (const key of Object.keys(row)) if (!SERVER_OWNED.has(key)) keys.add(key);
  return [...keys];
}

// Columns come from the rows themselves, so the catalogue cannot drift from what the lists serve.
const areaRows = (): Readonly<Record<string, readonly object[]>> => ({
  students: STUDENTS,
  staff: STAFF,
  teachers: TEACHERS,
  guardians: GUARDIANS,
  enrollments: ENROLLMENTS,
  subject_enrollments: SUBJECT_ENROLLMENTS,
  teacher_assignments: TEACHER_ASSIGNMENTS,
  library: CONTENT_ITEMS,
  curriculum: CURRICULA,
  content_placements: PLACEMENTS,
  sections: SECTIONS,
  academic_sessions: SESSIONS,
  subject_offerings: OFFERINGS,
  timetable: SLOTS,
  attendance: ATTENDANCE_PERIODS,
  stream_posts: STREAM_POSTS,
  stream_comments: STREAM_COMMENTS,
  assignments: ASSIGNMENTS,
  assignment_submissions: SUBMISSIONS,
  rooms: ROOMS,
  calendar: CALENDAR_DAYS,
  papers: PAPERS,
  blueprints: BLUEPRINTS,
});

function heldBy(user: string): ReadonlySet<string> {
  if (SCHOOL_WIDE_USERS.has(user)) return new Set(CORE_ENTITIES);
  return new Set(NARROWED[user] ?? TEACHER_ENTITIES);
}

export function writablePersonColumns(user: string): readonly string[] {
  return SCHOOL_WIDE_USERS.has(user) ? PERSON_COLUMNS : PERSON_SELF_WRITABLE;
}

// Mirrors emerge-core `breadthOf`: an area with no `_all` key is not_applicable, which is not "restricted".
function breadthOf(area: string, action: string, held: ReadonlySet<string>): CapabilityBreadth {
  if (action.endsWith('_all')) return 'school_wide';
  const wide = `core.${area}.${action}_all`;
  if (!CORE_ENTITIES.includes(wide)) return 'not_applicable';
  return held.has(wide) ? 'school_wide' : 'narrowed';
}

const MASTERY_COLUMNS = [
  'student_id', 'content_item_id', 'engine_section_id', 'node_id', 'state', 'score', 'attempts', 'last_attempt_at',
];

const MINDMAP_READ: Capability = {
  key: 'core.mindmaps.read',
  area: 'mindmaps',
  action: 'read',
  name: 'Read mind maps',
  breadth: 'not_applicable',
  row_pinned: false,
  fields: { all: true, enumerated: false, permitted: [] },
};

const masteryRead = (action: 'read' | 'read_all', reach?: string): Capability => ({
  key: `core.concept_mastery.${action}`,
  area: 'concept_mastery',
  action,
  name: action === 'read' ? 'Read concept mastery' : 'Read all concept mastery',
  ...(reach ? { reach } : {}),
  breadth: reach ? 'narrowed' : 'school_wide',
  row_pinned: false,
  fields: { all: true, enumerated: true, permitted: MASTERY_COLUMNS.map(field) },
});

const MASTERY_WRITE: Capability = {
  key: 'core.concept_mastery.write',
  area: 'concept_mastery',
  action: 'write',
  name: 'Record concept mastery',
  reach: 'self',
  breadth: 'narrowed',
  row_pinned: false,
  fields: { all: true, enumerated: true, permitted: ['state'].map(field) },
};

const SCHOOL_WIDE_MASTERY = [MINDMAP_READ, masteryRead('read'), masteryRead('read_all')];
const LEARNER_MASTERY = [MINDMAP_READ, masteryRead('read', 'self'), MASTERY_WRITE];

const MINDMAP_GRANTS: Readonly<Record<string, readonly Capability[]>> = {
  admin: SCHOOL_WIDE_MASTERY,
  superadmin: SCHOOL_WIDE_MASTERY,
  teacher: [MINDMAP_READ, masteryRead('read', 'teacher_assignment')],
  student: LEARNER_MASTERY,
  parent: [MINDMAP_READ, masteryRead('read', 'guardian_ward')],
  dev: LEARNER_MASTERY,
};

export function coreCapabilities(user: string): Capability[] {
  return [...entityCapabilities(user), ...(MINDMAP_GRANTS[user] ?? [])];
}

function entityCapabilities(user: string): Capability[] {
  const held = heldBy(user);
  const rows = areaRows();

  return CORE_ENTITIES.filter((key) => held.has(key)).map((key) => {
    const [, area = '', action = ''] = key.split('.');
    const ownRecordOnly = key === 'core.persons.write' && !SCHOOL_WIDE_USERS.has(user);
    const columns = action.startsWith('delete') ? [] : area === 'persons' ? PERSON_COLUMNS : columnsOf(rows[area] ?? []);
    const permitted = ownRecordOnly ? columns.filter((column) => PERSON_SELF_WRITABLE.includes(column)) : columns;

    return {
      key,
      area,
      action,
      name: (VERB_NAMES[action] ?? '%s').replace('%s', label(area).toLowerCase()),
      breadth: breadthOf(area, action, held),
      row_pinned: ownRecordOnly,
      fields: { all: !ownRecordOnly, enumerated: columns.length > 0, permitted: permitted.map(field) },
    };
  });
}
