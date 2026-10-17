import 'server-only';

import type { FeatureReason } from '@/constants/cas';
import { logger } from '@/lib/logger';
import { entriesFromDecisions } from '@/server/entitlement/entries';
import type { SessionPayload } from '@/server/session/cookie';
import type { FeatureDecision, GroupRef } from '@/types/cas';
import type { EntitlementSnapshot } from '@/types/entitlement';

import { devUserOf } from './bypass';
import { PRINCIPAL_KEYS, PRINCIPAL_SCOPE, PRINCIPAL_TENANT } from './recorded';

// Fixture users, each written as CAS would answer AFTER the `registry ∩ /v1/me` intersection.
// A key CAS has no row for is absent, as it would be, and inherits its nearest registered ancestor.

interface FixtureUser {
  groups: GroupRef[];
  superAdmin: boolean;
  decisions: [key: string, reason: FeatureReason][];
  // The group a `scope_match` matched on, which CAS reports back with the decision.
  scope?: string;
}

const group = (key: string, name: string): GroupRef => ({ id: `grp-${key}`, key, name });

const SCHOOL = group('emerge-school', 'Emerge School');
const CLASS_10 = group('emerge-class-10', 'Class 10');

const TEACHERS = group('emerge-teachers', 'Teachers');
const STUDENTS = group('emerge-students', 'Students');

const grant = (keys: readonly string[]): [string, FeatureReason][] => keys.map((key) => [key, 'unscoped_grant']);

// What every classroom user holds. Announcements is granted although the seeded estate has it inactive: the live tenant runs it.
const CLASSROOM: readonly string[] = [
  'emerge.home',
  'emerge.home.profile',
  'emerge.home.library',
  'emerge.subjects',
  'emerge.timetable',
  'emerge.attendance',
  'emerge.assignments',
  'emerge.grades',
  'emerge.announcements',
  'emerge.learning',
  'emerge.learning.mindmap',
  'emerge.learning.flashcards',
  'emerge.learning.labs',
];

// A teacher runs their own classes; the school's administration and its people stay with leadership.
const TEACHING: readonly string[] = ['emerge.analytics', 'emerge.calendar', 'emerge.home.teaching', 'emerge.home.leave', 'emerge.students', 'emerge.house', 'emerge.grasp', 'emerge.school.sections', 'emerge.grades.marks', 'emerge.grades.results', 'emerge.learning.lessonplanner'];

const LEARNING: readonly string[] = ['emerge.analytics', 'emerge.home.learner', 'emerge.jerry', 'emerge.calendar', 'emerge.home.leave', 'emerge.house', 'emerge.fees'];

// Built in this app and registered, but with no CAS row yet: the live recording cannot contain them.
const AWAITING_CAS: readonly string[] = ['emerge.home.overview', 'emerge.learning.lessonplanner', 'emerge.grasp', 'emerge.jerry'];

const FIXTURE_USERS: Readonly<Record<string, FixtureUser>> = {
  // The real principal, as CAS answered for one: every screen, including school administration.
  admin: {
    groups: [group(PRINCIPAL_TENANT.key, PRINCIPAL_TENANT.name), group(PRINCIPAL_SCOPE, 'Leadership')],
    superAdmin: false,
    decisions: [...PRINCIPAL_KEYS, ...AWAITING_CAS].map((key) => [key, 'scope_match']),
    scope: PRINCIPAL_SCOPE,
  },

  // Flashcards is granted to both although its CAS row is is_enabled=false: the key now leads to a real screen.
  teacher: { groups: [SCHOOL, CLASS_10, TEACHERS], superAdmin: false, decisions: grant([...CLASSROOM, ...TEACHING]) },

  student: { groups: [SCHOOL, CLASS_10, STUDENTS], superAdmin: false, decisions: grant([...CLASSROOM, ...LEARNING]) },

  // Attendance granted for Class 10 only, while not being in Class 10.
  parent: {
    groups: [SCHOOL, group('emerge-parents', 'Parents')],
    superAdmin: false,
    decisions: [
      ['emerge.home', 'unscoped_grant'],
      ['emerge.attendance', 'scoped_grant_needs_context'],
      ['emerge.grades', 'unscoped_grant'],
      ['emerge.fees', 'unscoped_grant'],
    ],
  },

  // Two designations at once, the only way to see the persona switcher; this is who the public demo serves.
  dev: { groups: [SCHOOL, CLASS_10, TEACHERS, STUDENTS], superAdmin: false, decisions: grant([...CLASSROOM, ...TEACHING, ...LEARNING]) },

  // Break-glass: CAS returns no feature keys at all.
  superadmin: { groups: [], superAdmin: true, decisions: [] },
};

/** What CAS evaluate would return for one key, reason by reason. */
function decision(feature: string, reason: FeatureReason, user: FixtureUser): FeatureDecision {
  const enabled = reason === 'unscoped_grant' || reason === 'scope_match';
  const drawnInert =
    reason === 'disabled' || reason === 'grant_off' || reason === 'feature_group_off';
  const state = enabled ? 'on' : drawnInert ? 'disabled' : 'off';
  const scoped = reason === 'scope_match' && user.scope ? { matched_scope: user.scope, context: user.groups.map((g) => g.key ?? '').reverse() } : {};
  return { feature, enabled, state, visible: state !== 'off', reason, ...scoped, policy_epoch: 1 };
}

export function devSnapshot(session: SessionPayload): EntitlementSnapshot {
  const id = devUserOf(session.uid);
  let user = FIXTURE_USERS[id];
  if (!user) {
    logger.warn(
      `"${id}" is not a fixture user; using "admin". ` +
        `Known: ${Object.keys(FIXTURE_USERS).join(', ')}.`,
    );
    user = FIXTURE_USERS.admin!;
  }

  return {
    userId: session.uid,
    sessionId: session.sid,
    entries: entriesFromDecisions(user.decisions.map(([key, reason]) => decision(key, reason, user))),
    superAdmin: user.superAdmin,
    groups: user.groups,
    epoch: 1,
    resolvedAt: Date.now(),
    credentialExpiresAt: session.accessExpiresAt,
  };
}
