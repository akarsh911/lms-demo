/**
 * Feature keys.
 *
 * A feature key is a VISIBILITY key and authorizes nothing. CAS says so in its
 * own source: "the backend authorizes through rules, and a hidden button
 * protects no endpoint". Everything here decides what is *offered*. What is
 * *permitted* is decided by CAS rules on the resource API.
 *
 * # The key shape: `emerge.<section>[.<child>...]`
 *
 *   emerge.attendance            <- a top-level place
 *   emerge.attendance.summary    <- a panel inside it
 *   emerge.learning              <- a top-level place
 *   emerge.learning.mindmap      <- a place NESTED inside it
 *
 * A key's DEPTH says where it sits in the tree. It does NOT say what it is.
 * That is placement, and placement is a separate axis:
 *
 *   placement: 'sidebar'  -> a nav entry with a URL of its own. Registered in
 *                            `routes/registry.ts`. May sit at any depth: a
 *                            three-segment sidebar key becomes a nested nav
 *                            item under its parent, at `/p/{persona}/a/b`.
 *   placement: 'widget'   -> a panel on the page its parent key owns. No URL.
 *                            Registered in `components/widgets/registry.ts`.
 *
 * This used to be inferred from depth, two segments meant a section and three
 * meant a widget, which made `emerge.learning.mindmap` unrepresentable as a
 * page. CAS has carried `features.placement` all along
 * (`CAS/internal/domain/models.go`); the front end simply was not reading it.
 * It still cannot read it at runtime, because CAS returns placement only from
 * the admin catalog, so the two registries DECLARE it and
 * `scripts/check-routes.mjs` refuses a key that claims both.
 *
 * # CAS_REGISTERED_KEYS is the switch, and it exists for one specific reason
 *
 * CAS answers a key it has never heard of with `200 no_grant` — the SAME answer
 * it gives for a key that exists but was not granted. Those two cases are
 * indistinguishable on the wire.
 *
 * That matters because it makes naive inheritance unsafe. If we asked CAS about
 * `emerge.attendance.summary` before that key existed, we would get `no_grant`
 * and hide the widget; if we then "helpfully" fell back to the parent, we would
 * ALSO override a legitimate, deliberate `no_grant` once the key did exist.
 *
 * So the list below is explicit: it names the keys CAS actually knows about.
 *   - A key IN the list is evaluated by CAS and CAS's answer is final.
 *   - A key NOT in the list is never sent, and inherits from its nearest
 *     registered ancestor (see `lib/entitlement/resolve-key.ts`).
 *
 * Adding a key to CAS is therefore a two-line change: create it in CAS, add it
 * here. Until you do, a new widget inherits its section's visibility, which is
 * the sane default while a section is being built out.
 *
 * A NESTED SIDEBAR KEY IS THE ONE CASE WHERE INHERITANCE IS NOT ENOUGH. An
 * unregistered `emerge.learning.mindmap` inherits `emerge.learning`, so it
 * appears for everyone who holds the parent and cannot be denied on its own.
 * That is fine while a section is being built and wrong the moment the child is
 * something a school buys separately. `check-routes.mjs` warns about it rather
 * than failing, because the permissive default is deliberate.
 */

/**
 * Keys CAS actually has rows for. **Keep this in sync with CAS.**
 *
 * Verify with: psql -d mentis -c "select key, is_active, is_enabled, kill_switch, placement from features where key like 'emerge%' order by key;"
 *
 * (`mentis` is the legacy name of the database, kept because renaming it means
 * reconfiguring CAS. The product and the company are Emerge — see
 * docs/DECISIONS.md.)
 */
export const CAS_REGISTERED_KEYS = [
  'emerge.home',
  // Granted by the live tenant (recorded 2026-10-01); registered when Classes & Sections became a top-level page.
  'emerge.school.sections',
  'emerge.timetable',
  'emerge.attendance',
  'emerge.assignments',
  'emerge.grades',
  'emerge.announcements',
  'emerge.analytics',

  // A nested sidebar branch. `emerge.learning` is a place; the two below it are
  // places INSIDE it, each with its own CAS row so each can be sold, killed or
  // switched off on its own. That independence is the entire reason they are
  // registered rather than left to inherit the parent.
  'emerge.learning',
  'emerge.learning.mindmap',
  'emerge.learning.flashcards',
  'emerge.home.people',
  'emerge.home.profile',
  'emerge.home.library',
  'emerge.learning.labs',

  // The school-administration branch: the screens that DEFINE the year and the
  // week, as opposed to the ones that read them. Registered, and nested, for
  // the reason the learning branch is: each is a place a school may be given or
  // denied on its own, and a teacher who may read the timetable must not be
  // offered the screen that rewrites it. Leaving these unregistered would make
  // each inherit `emerge.school` and appear for everyone holding the section,
  // which is exactly wrong for four screens that rewrite the calendar.
  //
  // Registering a key means CAS is asked and its answer is final, including
  // `no_grant` until the row exists. That is the deliberate trade here.
  'emerge.school',
  'emerge.school.calendar',
  'emerge.school.periods',
  'emerge.school.rooms',
  'emerge.school.timetable',

  // The principal overview. Registered so that it is granted, never inherited: a pupil holding Home must not see it.
  // Until CAS has the row it answers no_grant in real mode and Home stays as it was.
  'emerge.home.overview',

  'emerge.learning.lessonplanner',

  'emerge.grades.marks',
  'emerge.grades.results',

  // The Home of a teacher and of a pupil, each granted to its group; a key nobody holds leaves Home as it was.
  'emerge.home.teaching',
  'emerge.home.learner',
  // My subjects: the subjects a teacher teaches or a pupil takes. A top-level place, so registered.
  'emerge.subjects',
  // My leave, held by teachers only, so registered rather than inherited from Home.
  'emerge.home.leave',
  // My students, for a teacher; the office has People.
  'emerge.students',
  // My house, for the teachers who head one.
  'emerge.house',
  // GRASP stands on its own for a teacher, apart from the AI plugins.
  'emerge.grasp',
  // Jerry AI stands on its own for learners and the office, apart from the AI plugins.
  'emerge.jerry',
  // The own calendar and date sheet of a teacher or a pupil; the office uses Academic Years.
  'emerge.calendar',
  // The fee book for the office, and the own fees of a pupil. The live tenant already grants it.
  'emerge.fees',
] as const;

export type CasFeatureKey = (typeof CAS_REGISTERED_KEYS)[number];

/**
 * Every key the front end refers to, including nested ones CAS does not have
 * yet. Sidebar routes and widgets are both typed against this.
 */
export const FEATURE_KEYS = [
  ...CAS_REGISTERED_KEYS,

  // --- emerge.home widgets -------------------------------------------------
  'emerge.home.timetable',
  'emerge.home.announcements',

  // --- emerge.home.overview: what needs the administrator today -------------
  'emerge.home.overview.attention',
  'emerge.home.overview.summary',
  'emerge.home.overview.needs',
  'emerge.home.overview.agenda',
  'emerge.home.overview.actions',

  // --- the school foundation: setup checklist and academic years ------------
  // Nested sidebar keys with no CAS row yet, so both inherit emerge.school.
  'emerge.school.setup',
  'emerge.school.setup.checklist',
  'emerge.school.profile',
  'emerge.school.profile.details',
  'emerge.school.years',
  'emerge.school.years.list',

  // --- emerge.home.profile: a person and their own record in emerge-core ---
  // A nested SIDEBAR key with no CAS row, so it inherits emerge.home: anyone
  // who has a dashboard can reach their own profile, which is the right default
  // for a screen that shows a person nothing but themselves. It cannot be sold
  // or switched off separately until it is created in CAS and registered above,
  // and `check-routes.mjs` warns about exactly that.
  //
  // Nested under Home rather than made a top-level `emerge.profile`, which
  // would have to be in CAS_REGISTERED_KEYS to pass the build gate and would
  // then answer `no_grant` until somebody created the row — invisible to
  // everyone, with nothing in any log.
  //
  // NOTE for whoever edits this file next: `check-routes.mjs` reads these lists
  // with a quote-pair regex over the whole block, so a stray apostrophe in a
  // comment here silently re-pairs every key below it. Keep them out.
  'emerge.home.profile',
  'emerge.home.profile.identity',

  // --- emerge.home.people: the school roster from emerge-core --------------
  // Nested for the same reason as the profile above: a top-level key must be in
  // CAS_REGISTERED_KEYS to pass the build gate, and registering one CAS has no
  // row for makes it answer no_grant and vanish with nothing in any log. The
  // CAS `emerge` shelf (see CLAUDE.md 14) has no roster key to point at either.
  // Migrating is one line per route once CAS has one.
  'emerge.home.people',
  'emerge.home.people.students',
  'emerge.home.people.students.explorer',
  'emerge.home.people.students.admissions',
  'emerge.home.people.teachers',
  'emerge.home.people.teachers.directory',
  'emerge.home.people.teachers.admissions',
  'emerge.home.people.staff',
  'emerge.home.people.staff.directory',


  // --- emerge.home.library: the catalogue and the curriculum ---------------
  // Note the CAS `emerge` shelf already carries a real `emerge.library` row,
  // active and enabled and granted to nobody (CLAUDE.md 14). That is the key
  // this should become when the shelf is wired up and granted; until then it
  // would evaluate to no_grant and the screen would exist for no one.
  'emerge.home.library',
  'emerge.home.library.items',
  'emerge.home.library.curriculum',

  // --- emerge.attendance widgets -------------------------------------------
  'emerge.attendance.picker',
  'emerge.attendance.summary',
  'emerge.attendance.roster',
  'emerge.attendance.mark',

  // --- emerge.learning.mindmap widgets -------------------------------------
  // Four segments, and that is not a special case: a widget nests under
  // whatever owns the page it is drawn on, and here that page is itself nested.
  'emerge.learning.mindmap.canvas',
  'emerge.learning.flashcards.study',

  // --- emerge.learning.labs: Virtual labs ----------------------------------
  // A nested SIDEBAR key with no CAS row yet, so it inherits emerge.learning:
  // everyone who holds Learning sees Virtual labs, and it cannot be sold or
  // switched off on its own until it is created in CAS and registered above.
  // `check-routes.mjs` warns about exactly this, deliberately.
  'emerge.learning.labs',
  // The bench (which runs whichever practical is chosen) and the attempts
  // panel. Unregistered, so each inherits Virtual labs.
  'emerge.learning.labs.bench',
  'emerge.learning.labs.attempts',

  'emerge.learning.playground',
  'emerge.learning.playground.viewer',

  'emerge.learning.timeline',
  'emerge.learning.timeline.viewer',

  'emerge.learning.debate',
  'emerge.learning.debate.room',

  'emerge.learning.lessonplanner.workspace',

  'emerge.learning.papers',
  'emerge.learning.papers.list',
  'emerge.learning.papers.blueprints',

  'emerge.learning.paper_setter',

  'emerge.learning.answer_sheets',
  'emerge.learning.answer_sheets.checker',

  'emerge.learning.gaps',
  'emerge.learning.gaps.analyzer',

  // --- emerge.school: the year, the day, the rooms and the week ------------
  // One panel per page, and each is a workspace rather than a readout, so none
  // of them shares a row with anything. They are widget keys, not routes: the
  // page above each is the sidebar entry, and a key may claim only one
  // placement. Unregistered in CAS, so each inherits the page it is drawn on,
  // which is right — there is no reason to sell "the calendar screen" and "the
  // panel on the calendar screen" separately.
  'emerge.school.calendar.days',
  'emerge.school.periods.schemes',
  'emerge.school.periods.grades',
  'emerge.school.rooms.list',
  'emerge.school.timetable.builder',
  'emerge.school.timetable.generate',
  'emerge.school.timetable.generate.solver',

  'emerge.school.structure',
  'emerge.school.structure.branches',
  'emerge.school.structure.sessions',
  'emerge.school.structure.grades',
  'emerge.school.structure.houses',
  'emerge.school.sections',
  'emerge.school.sections.structure',
  'emerge.announcements.board',
  'emerge.assignments.board',
  'emerge.analytics.inbox',
  'emerge.school.offerings',
  'emerge.school.offerings.list',
  'emerge.school.offerings.results',
  'emerge.school.offerings.teaching',
  'emerge.school.exams',
  'emerge.school.exams.campaigns',
  'emerge.school.exams.papers',

  'emerge.grades.exams',
  'emerge.grades.gaps',

  'emerge.subjects.list',
  'emerge.timetable.week',
  'emerge.home.leave.requests',
  'emerge.students.explorer',
  'emerge.house.board',
  'emerge.calendar.agenda',
  'emerge.fees.board',

  'emerge.home.teaching.timetable',
  'emerge.home.teaching.needs',
  'emerge.home.teaching.classes',
  'emerge.home.teaching.announcements',
  'emerge.home.learner.timetable',
  'emerge.home.learner.work',
  'emerge.home.learner.results',
  'emerge.home.learner.class',
  'emerge.home.learner.announcements',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const CAS_KEY_SET: ReadonlySet<string> = new Set(CAS_REGISTERED_KEYS);
const FEATURE_KEY_SET: ReadonlySet<string> = new Set(FEATURE_KEYS);

export function isFeatureKey(value: string): value is FeatureKey {
  return FEATURE_KEY_SET.has(value);
}

/** True when CAS has a row for this key and its answer is authoritative. */
export function isCasRegistered(key: string): key is CasFeatureKey {
  return CAS_KEY_SET.has(key);
}

/**
 * The key one level up. `emerge.learning.mindmap` -> `emerge.learning`.
 * Empty for a key with no parent below the `emerge` namespace.
 *
 * This is what binds a widget to the page it appears on, and what binds a
 * nested sidebar entry to the one above it. It replaced `sectionOf`, which
 * always took the first two segments and so put a widget of
 * `emerge.learning.mindmap` onto the `emerge.learning` page instead.
 */
export function parentOf(key: string): string {
  const parts = key.split('.');
  return parts.length > 2 ? parts.slice(0, -1).join('.') : '';
}

/**
 * The top-level place a key belongs to: the first two segments.
 * `emerge.learning.mindmap` -> `emerge.learning`.
 *
 * Use this for "which branch of the product is this", never for "which page
 * does this widget belong on": that is `parentOf`.
 */
export function sectionOf(key: FeatureKey): string {
  return key.split('.').slice(0, 2).join('.');
}

/**
 * CAS rejects an evaluate request carrying more than this many keys with a 400
 * (`handler/features.go:21`). Nested keys make the registry grow faster than
 * routes alone would, so the batching in `lib/entitlement/chunk.ts` earns its
 * place rather than being defensive decoration.
 */
export const MAX_EVALUATE_KEYS = 64;
