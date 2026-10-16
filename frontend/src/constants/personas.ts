import type { FeatureKey } from './features';

/**
 * Personas — the "which hat am I wearing" model.
 *
 * # Why a persona cannot grant anything
 *
 * A persona is a LENS, not a permission. The entitlement set is a union over
 * every group a user belongs to, and a persona selects an ordered SUBSET of it
 * for display. The selection is an intersection, never a union, so a persona is
 * structurally incapable of adding a feature the user does not already hold.
 *
 * That is what makes the URL segment safe. `/p/principal` typed by a student
 * yields the intersection of the student's real entitlements with the principal
 * preset — which, for a student, is close to nothing. Forging it is not an
 * escalation; it is a way to see less.
 *
 * # Why the map is keyed on leaf groups only
 *
 * `/v1/me.groups` returns the ANCESTOR CLOSURE, not direct membership. Every
 * Emerge user's closure contains `emerge-school`, and teachers and students
 * both contain `emerge-class-10`. Mapping either to a persona would hand that
 * persona to the entire tenant and silently collapse the segregated design back
 * into one undifferentiated union — the exact outcome this design exists to
 * avoid. Only leaf, role-bearing groups belong here.
 *
 * # Why this lives in the front end for now
 *
 * CAS has no role concept, and it cannot attribute a feature to the group that
 * granted it (`EffectiveFeatureKeys` ends in `SELECT DISTINCT f.key`), so this
 * mapping could not come from CAS even if roles existed. When `groups.role_name`
 * lands, only `selectPersonas()` changes — this table is replaced by data and
 * nothing else moves.
 */

/** Group key -> the designation shown to the user. Leaf role groups ONLY. */
export const ROLE_BEARING_GROUPS: Readonly<Record<string, string>> = {
  'emerge-teachers': 'Teacher',
  'emerge-students': 'Student',
  'emerge-parents': 'Parent',
  'emerge-leadership': 'Principal',
};

export const ADMISSION_GROUP_KEYS = {
  teacher: 'emerge-teachers',
  student: 'emerge-students',
} as const;

export type AdmissionGroupKey =
  (typeof ADMISSION_GROUP_KEYS)[keyof typeof ADMISSION_GROUP_KEYS];

/**
 * Groups that must NEVER confer a persona. Structural or cohort groups appear
 * in everyone's ancestor closure. Listed explicitly so the invariant is
 * asserted rather than merely intended — see `assertPersonaInvariant()`.
 */
export const NON_ROLE_GROUPS: readonly string[] = [
  'emerge-school',
  'emerge-class-06',
  'emerge-class-10',
];

/** The operator persona for a superadmin, who holds zero feature keys. */
export const OPERATOR_SLUG = 'operator';
export const OPERATOR_LABEL = 'Operator';

const LEARNING_LOOP: readonly FeatureKey[] = [
  'emerge.learning',
  'emerge.learning.lessonplanner',
  'emerge.learning.paper_setter',
  'emerge.learning.answer_sheets',
  'emerge.learning.gaps',
  'emerge.learning.papers',
  'emerge.learning.mindmap',
  'emerge.learning.flashcards',
  'emerge.learning.labs',
  'emerge.learning.playground',
  'emerge.learning.timeline',
  'emerge.learning.debate',
  'emerge.grasp',
];

/**
 * What each persona surfaces, in order.
 *
 * This is a display preference, not a security boundary. A key here that the
 * user does not hold is dropped by the intersection; a key the user holds that
 * is absent here is simply not shown under this hat.
 */
export const PERSONA_PRESETS: Readonly<Record<string, readonly FeatureKey[]>> = {
  teacher: [
    'emerge.home',
    'emerge.analytics',
    'emerge.home.teaching',
    'emerge.timetable',
    'emerge.calendar',
    'emerge.subjects',
    'emerge.school.sections',
    'emerge.students',
    'emerge.attendance',
    'emerge.assignments',
    'emerge.grades',
    'emerge.announcements',
    'emerge.grasp',
    'emerge.house',
    ...LEARNING_LOOP,
  ],
  student: [
    'emerge.home',
    'emerge.analytics',
    'emerge.home.learner',
    'emerge.timetable',
    'emerge.calendar',
    'emerge.subjects',
    'emerge.assignments',
    'emerge.grades',
    'emerge.attendance',
    'emerge.fees',
    'emerge.house',
    'emerge.announcements',
    'emerge.jerry',
    'emerge.learning',
    // A practical is something a student does, so it leads the branch here.
    'emerge.learning.labs',
    'emerge.learning.playground',
    'emerge.learning.timeline',
    'emerge.learning.debate',
    'emerge.learning.mindmap',
    'emerge.learning.flashcards',
    'emerge.learning.gaps',
  ],
  parent: [
    'emerge.home',
    'emerge.attendance',
    'emerge.grades',
    'emerge.announcements',
  ],
  principal: [
    'emerge.home',
    // What needs the principal today comes straight after Home.
    'emerge.analytics',
    // Whoever runs the school meets the school first: its setup, its years, its rooms.
    'emerge.school',
    'emerge.school.setup',
    'emerge.school.profile',
    'emerge.school.years',
    'emerge.school.rooms',
    'emerge.home.people',
    'emerge.home.people.students',
    'emerge.home.people.teachers',
    'emerge.home.people.staff',
    'emerge.school.sections',
    'emerge.fees',
    'emerge.jerry',
    ...LEARNING_LOOP,
    'emerge.attendance',
    'emerge.announcements',
  ],
  [OPERATOR_SLUG]: ['emerge.home'],
};

/**
 * Fails fast if the two tables above ever contradict each other.
 *
 * `PERSONA_PRESETS` is a second silent-typo surface: it names personas and
 * feature keys with no compile-time link to either table, exactly the failure
 * mode `check-routes.mjs` exists to catch in the route registry. A preset
 * naming a persona nothing produces would shrink that persona's nav to nothing,
 * forever, with no error anywhere.
 */
export function assertPersonaInvariant(): void {
  for (const key of NON_ROLE_GROUPS) {
    if (key in ROLE_BEARING_GROUPS) {
      throw new Error(
        `Persona invariant violated: "${key}" is a structural group and appears in ` +
          `every user's ancestor closure. Mapping it to a persona would give that ` +
          `persona to the whole tenant. See docs/DECISIONS.md.`,
      );
    }
  }
  const slugs = new Set(Object.values(ROLE_BEARING_GROUPS).map(slugifyRole));
  slugs.add(OPERATOR_SLUG);
  for (const slug of Object.keys(PERSONA_PRESETS)) {
    if (!slugs.has(slug)) {
      throw new Error(
        `PERSONA_PRESETS has an entry for "${slug}", which no group produces. ` +
          `It would never render. Known slugs: ${[...slugs].join(', ')}.`,
      );
    }
  }
}

/**
 * Role name -> URL slug.
 *
 * KNOWN LIMITATION, deliberately accepted for now: a role name with no Latin
 * characters ("शिक्षक") slugifies to an empty string and confers no persona.
 * The app keeps working and the segregation silently does not. The fix is a
 * `groups.role_slug` column set alongside `role_name`, which needs CAS and is
 * therefore deferred. Until then, role names must be Latin-script.
 */
export function slugifyRole(roleName: string): string {
  return roleName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
