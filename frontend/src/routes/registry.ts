import { FEATURE_KEYS, parentOf, type FeatureKey } from '@/constants/features';
import type { RouteNode, RouteRecord } from '@/types/nav';

/**
 * THE ROUTE REGISTRY — the single source of truth binding URLs to CAS keys.
 *
 * Adding a feature to the product is: add a node here, add the page file if it
 * needs one, and make sure the key exists in CAS. Nothing in the nav, the shell
 * or the routing layer is edited. That is the whole point of the design.
 *
 * # Nesting
 *
 * A node's `children` are places INSIDE it, each with its own CAS key and its
 * own URL. `emerge.learning` holding `emerge.learning.mindmap` renders as a
 * collapsible group in the sidebar and serves `/p/{persona}/learning/mindmap`.
 * Two rules make that coherent, and `check-routes.mjs` enforces both:
 *
 *   1. `path` is a single segment relative to the parent. The full path is
 *      derived, so a nav item and its URL cannot disagree about where it sits.
 *   2. A child's feature key must be a descendant of its parent's. The tree of
 *      URLs and the tree of keys are then the same tree, which is what lets
 *      `resolve-key.ts` inherit along it.
 *
 * Depth is not capped here. The sidebar renders two levels comfortably and
 * indents further ones; a third level is a design smell rather than a bug.
 *
 * # A group is not always a page
 *
 * `emerge.learning` below has two children and both are sidebar routes, so it
 * owns no content of its own: its page would be a list of links the sidebar is
 * already showing. It therefore has NO page, no URL and no route. The row is a
 * disclosure control and the whole of it toggles.
 *
 * Give it a widget, any key under `emerge.learning` that is not itself a route,
 * and it becomes a page again with the group still expandable. That is derived
 * from the two registries, not declared, so the two cannot disagree.
 *
 * # The build gate
 *
 * `scripts/check-routes.mjs` enforces the registry↔filesystem bijection at
 * build time. It has to, because the two natural failure modes are both silent:
 * a key CAS has never heard of answers 200 `no_grant` (invisible forever), and
 * a page file with no registry node would be an ungated route.
 */
export const ROUTES: readonly RouteNode[] = [
  {
    key: 'home',
    feature: 'emerge.home',
    title: 'Home',
    path: '',
    icon: 'home',
    inNav: true,
    children: [
      {
        // The school at a glance, drawn ON the Home page for whoever holds it, so it has no row of its own.
        // Registered in CAS, so nobody holds it by inheriting Home.
        key: 'home-overview',
        feature: 'emerge.home.overview',
        title: 'Overview',
        path: 'overview',
        icon: 'gauge',
        inNav: false,
      },
      {
        // A teacher's day and a pupil's, drawn on Home for whoever holds each, as the overview is.
        key: 'home-teaching',
        feature: 'emerge.home.teaching',
        title: 'My day',
        path: 'my-day',
        icon: 'home',
        inNav: false,
      },
      {
        key: 'home-learner',
        feature: 'emerge.home.learner',
        title: 'Today',
        path: 'today',
        icon: 'home',
        inNav: false,
      },
      {
        // A teacher's requests for days away, decided by the office in Actions.
        key: 'home-leave',
        feature: 'emerge.home.leave',
        title: 'My leave',
        titles: { student: 'Leave notes' },
        path: 'leave',
        icon: 'calendar',
        inNav: true,
        description: 'Ask for days away with a reason, and see what was decided.',
        descriptions: { student: 'Explain an absence, or ask ahead for days away. Your class teacher decides.' },
      },
      {
        // The person's own record in emerge-core. Nested under Home because its
        // key has to descend from its parent's and there is no CAS row for a
        // top-level `emerge.profile`; an unregistered top-level key has no
        // ancestor to inherit from and would be invisible to everyone.
        //
        // The persona root keeps its page: `hasPage` is derived, and Home still
        // owns widget keys, so gaining a sidebar child does not turn it into a
        // pure disclosure control.
        key: 'home-profile',
        feature: 'emerge.home.profile',
        title: 'My profile',
        path: 'profile',
        icon: 'user',
        inNav: true,
      },
      {
        // Two panels: the catalogue, and the curriculum with what is mapped to
        // each topic. Both on one page because a teacher asking "what do we
        // have for this chapter" is asking one question of two tables.
        key: 'home-library',
        feature: 'emerge.home.library',
        title: 'Library',
        path: 'library',
        icon: 'library',
        inNav: true,
      },
    ],
  },
  {
    // A branch, so a disclosure with no page of its own; only the three lists under it are features. The key is the
    // registered CAS row `emerge.home.people`, which is why it can sit at the top with no ancestor.
    key: 'people',
    feature: 'emerge.home.people',
    title: 'People',
    path: 'people',
    icon: 'users',
    inNav: true,
    children: [
      { key: 'people-students', feature: 'emerge.home.people.students', title: 'Students', path: 'students', icon: 'graduationCap', inNav: true, description: 'Every pupil of the year, class by class.' },
      { key: 'people-teachers', feature: 'emerge.home.people.teachers', title: 'Teachers', path: 'teachers', icon: 'teacher', inNav: true, description: 'Who teaches what, to which classes, and who is class teacher.' },
      { key: 'people-staff', feature: 'emerge.home.people.staff', title: 'Staff & others', path: 'staff', icon: 'badge', inNav: true, description: 'Everyone the school employs, and the guardians on record.' },
    ],
  },
  {
    // The day-to-day door to the CURRENT year's classes and sections; the same data as that year's Classes & Sections tab.
    // A page, not a folder, on the key the live school already grants, registered so it can sit at the top.
    key: 'sections',
    feature: 'emerge.school.sections',
    title: 'Classes & Sections',
    path: 'sections',
    icon: 'grid',
    inNav: true,
    description: 'The classes and sections of the current academic year.',
  },
  {
    // A teacher's or a pupil's own week as a timeline, each lesson opening its subject. On the key the live tenant already has.
    key: 'timetable',
    feature: 'emerge.timetable',
    title: 'My timetable',
    path: 'timetable',
    icon: 'clock',
    inNav: true,
    description: 'Your week, period by period: which class, which subject and which room, with covers and extra classes marked.',
  },
  {
    // The subjects a teacher teaches or a pupil takes, each opening to its stream, work, content and curriculum.
    key: 'subjects',
    feature: 'emerge.subjects',
    title: 'My subjects',
    path: 'subjects',
    icon: 'layers',
    inNav: true,
    description: 'Every subject you teach or take this year, each with its announcements, assignments, material and syllabus.',
  },
  {
    // The pupils of the classes a teacher teaches, each opening to their record and grades.
    key: 'my-students',
    feature: 'emerge.students',
    title: 'My students',
    path: 'students',
    icon: 'users',
    inNav: true,
    description: 'Every pupil in the classes you teach, by class and section, each with their record, attendance and grades.',
  },
  {
    key: 'attendance',
    feature: 'emerge.attendance',
    title: 'Attendance',
    path: 'attendance',
    icon: 'checkSquare',
    inNav: true,
  },
  {
    key: 'assignments',
    feature: 'emerge.assignments',
    title: 'Assignments',
    path: 'assignments',
    icon: 'clipboard',
    inNav: true,
    description: 'Work set for classes, sections or chosen students: what is open, what has been handed in, and what has come back marked.',
  },
  {
    // A nested branch. `emerge.learning` is a place with a page of its own AND
    // a parent of two more places. Both halves matter: the row is a link and
    // the chevron beside it is a separate control, so opening the group never
    // costs you the ability to reach the group's own page.
    key: 'learning',
    feature: 'emerge.learning',
    title: 'Learning',
    titles: { teacher: 'AI plugins', principal: 'AI plugins' },
    path: 'learning',
    icon: 'bookOpen',
    inNav: true,
    children: [
      {
        key: 'learning-lesson-planner',
        feature: 'emerge.learning.lessonplanner',
        title: 'Lesson planner',
        path: 'lesson-planner',
        icon: 'lessonPlan',
        inNav: true,
      },
      {
        key: 'learning-paper-setter',
        feature: 'emerge.learning.paper_setter',
        title: 'Paper setter',
        path: 'paper-setter',
        icon: 'examPaper',
        inNav: true,
      },
      {
        key: 'learning-answer-sheets',
        feature: 'emerge.learning.answer_sheets',
        title: 'Answer sheets',
        path: 'answer-sheets',
        icon: 'clipboardCheck',
        inNav: true,
      },
      {
        key: 'learning-gaps',
        feature: 'emerge.learning.gaps',
        title: 'Gap analyzer',
        description: 'Which subject, chapter and topic each learner is weak in, from every assessment, drill and lesson record the school holds.',
        path: 'gaps',
        icon: 'target',
        inNav: true,
      },
      {
        key: 'learning-papers',
        feature: 'emerge.learning.papers',
        title: 'Paper bank',
        path: 'papers',
        icon: 'fileQuestion',
        inNav: true,
      },
      {
        key: 'learning-mindmap',
        feature: 'emerge.learning.mindmap',
        title: 'Mind maps',
        path: 'mindmap',
        icon: 'network',
        inNav: true,
      },
      {
        key: 'learning-flashcards',
        feature: 'emerge.learning.flashcards',
        title: 'Flashcards',
        path: 'flashcards',
        icon: 'layers',
        inNav: true,
      },
      {
        // Interactive practicals. Each bench is a widget on this page, drawn
        // immersive, so the page is a leaf with panels rather than a group.
        key: 'learning-labs',
        feature: 'emerge.learning.labs',
        title: 'Virtual labs',
        path: 'labs',
        icon: 'flask',
        inNav: true,
      },
      {
        key: 'learning-playground',
        feature: 'emerge.learning.playground',
        title: 'Visual playground',
        path: 'playground',
        icon: 'shapes',
        inNav: true,
      },
      {
        key: 'learning-timeline',
        feature: 'emerge.learning.timeline',
        title: 'Timeline',
        description: 'Every dated event in the NCERT history books, Classes 6 to 12, on one line of time, each quoted from the textbook itself.',
        path: 'timeline',
        icon: 'timeline',
        inNav: true,
      },
      {
        key: 'learning-debate',
        feature: 'emerge.learning.debate',
        title: 'Debate room',
        path: 'debate',
        icon: 'debate',
        inNav: true,
      },
    ],
  },
  {
    // A teacher's or a pupil's own year: the school's events for their classes, their plans, and the date sheet.
    key: 'calendar',
    feature: 'emerge.calendar',
    title: 'Calendar',
    path: 'calendar',
    icon: 'calendar',
    inNav: true,
    description: 'Holidays, examinations, meetings and trips for your classes, with your own plans and the date sheet.',
  },
  {
    // The office's fee book; a pupil's own instalments and receipts.
    key: 'fees',
    feature: 'emerge.fees',
    title: 'Fees',
    titles: { student: 'My fees' },
    path: 'fees',
    icon: 'wallet',
    inNav: true,
    description: 'What was billed and collected, and every family behind on fees.',
    descriptions: { student: 'Your instalments for the year, what is paid with its receipt, and what is due next.' },
  },
  {
    // Jerry, the study buddy, stands on its own beside the AI plugins.
    key: 'jerry',
    feature: 'emerge.jerry',
    title: 'Jerry AI',
    path: 'jerry',
    icon: 'jerry',
    inNav: true,
    description: 'Jerry, the study buddy: what is due, explanations, quizzes and hints, by voice or chat.',
  },
  {
    // School administration: the screens that DEFINE the year and the week,
    // rather than the ones that read them. A pure disclosure control — all four
    // children are sidebar routes and it owns no panels of its own, so it has
    // no page and no URL, and `/p/{persona}/school` 404s exactly like a URL
    // that was never in the registry.
    //
    // Nested rather than four top-level sections because they are one job: a
    // person who may set the calendar is the person who sets the bells, and a
    // sidebar with Calendar, Periods, Rooms and Timetable scattered through it
    // does not say that they belong together.
    key: 'school',
    feature: 'emerge.school',
    title: 'School',
    path: 'school',
    icon: 'school',
    inNav: true,
    children: [
      // The foundation: what has to exist before classes, people and a timetable can.
      {
        key: 'school-setup',
        feature: 'emerge.school.setup',
        title: 'School Setup',
        description: 'Complete the core setup required to run the school in Emerge.',
        path: 'setup',
        icon: 'listChecks',
        inNav: true,
      },
      {
        key: 'school-profile',
        feature: 'emerge.school.profile',
        title: 'School Profile',
        description: 'The name and contact details people see.',
        path: 'profile',
        icon: 'building',
        inNav: true,
      },
      {
        key: 'school-years',
        feature: 'emerge.school.years',
        title: 'Academic Years',
        description: 'Each year is the school’s full register for that session: who was enrolled, what it ran on and what is still open.',
        path: 'years',
        icon: 'calendarRange',
        inNav: true,
      },
      {
        key: 'school-rooms',
        feature: 'emerge.school.rooms',
        title: 'Rooms & Spaces',
        description: 'Manage classrooms, labs and shared spaces.',
        path: 'rooms',
        icon: 'door',
        inNav: true,
      },
      {
        // The year. Calendar days, the halves each is open for, holidays, and
        // which bell schedule a day runs to.
        key: 'school-calendar',
        feature: 'emerge.school.calendar',
        title: 'Calendar',
        path: 'calendar',
        icon: 'calendar',
        inNav: true,
      },
      {
        // The shape of a day: the period pattern, and the bell schedules that
        // give it times. Two panels on one page because a period with no bell
        // has no time at all, and editing either alone hides that.
        key: 'school-periods',
        feature: 'emerge.school.periods',
        title: 'Periods and bells',
        path: 'periods',
        icon: 'clock',
        inNav: true,
      },
      {
        // The builder. One timetable, every class's week, with the clash report
        // it is judged by.
        key: 'school-timetable',
        feature: 'emerge.school.timetable',
        title: 'Timetable builder',
        path: 'timetable',
        icon: 'table',
        inNav: true,
        children: [
          {
            key: 'school-timetable-generate',
            feature: 'emerge.school.timetable.generate',
            title: 'Auto-fill',
            path: 'generate',
            icon: 'network',
            inNav: true,
          },
        ],
      },
      {
        key: 'school-exams',
        feature: 'emerge.school.exams',
        title: 'Exams',
        path: 'exams',
        icon: 'examPaper',
        inNav: true,
      },
      {
        key: 'school-structure',
        feature: 'emerge.school.structure',
        title: 'Structure',
        path: 'structure',
        icon: 'school',
        inNav: true,
      },
      {
        key: 'school-offerings',
        feature: 'emerge.school.offerings',
        title: 'Subject offerings',
        path: 'offerings',
        icon: 'layers',
        inNav: true,
      },
    ],
  },
  {
    key: 'grades',
    feature: 'emerge.grades',
    title: 'Grades',
    path: 'grades',
    icon: 'award',
    inNav: true,
  },
  {
    key: 'announcements',
    feature: 'emerge.announcements',
    title: 'Announcements',
    path: 'announcements',
    icon: 'megaphone',
    inNav: true,
    description: 'Notices from the school and its teachers, to everyone, to classes and sections, or to named students.',
  },
  {
    // The house a teacher heads: standings, captains, members and the points log.
    key: 'house',
    feature: 'emerge.house',
    title: 'My house',
    path: 'house',
    icon: 'shield',
    inNav: true,
    description: 'The house you head: where it stands, its captains, its members and every point it has earned.',
    descriptions: { student: 'Your house: where it stands, its captains, and every point it has earned.' },
  },
  {
    // Set by a teacher at hand-in and answered by pupils at /g/{code}; its own place, not one of the AI plugins.
    key: 'grasp',
    feature: 'emerge.grasp',
    title: 'GRASP',
    path: 'grasp',
    icon: 'grasp',
    inNav: true,
    description: 'A seven-second readback at hand-in that shows whether students understood the work they submitted.',
  },
  {
    // Each person's inbox, narrowed to their reach. It keeps the analytics key because the live tenant grants that one.
    key: 'actions',
    feature: 'emerge.analytics',
    title: 'Actions',
    titles: { student: 'To do' },
    path: 'actions',
    icon: 'zap',
    inNav: true,
    description: 'Everything that needs your decision or a follow-up, the urgent first.',
    descriptions: { student: 'Work to hand in, things to sort out and what is coming up, the soonest first.' },
  },
];

/** Every feature key claimed by a route, at any depth. */
const ROUTE_FEATURES: ReadonlySet<string> = (() => {
  const out = new Set<string>();
  const walk = (nodes: readonly RouteNode[]): void => {
    for (const node of nodes) {
      out.add(node.feature);
      if (node.children) walk(node.children);
    }
  };
  walk(ROUTES);
  return out;
})();

/**
 * Does this key own any panels?
 *
 * A key that exists in `FEATURE_KEYS` but is claimed by no route is a widget
 * placement, by the same dichotomy `check-routes.mjs` enforces. Asking the
 * question this way keeps the route registry free of React: importing the
 * widget registry to count its entries would pull components into a module that
 * `lib/` and a plain-Node build script both read.
 */
function ownsWidgets(feature: string): boolean {
  return FEATURE_KEYS.some((key) => parentOf(key) === feature && !ROUTE_FEATURES.has(key));
}

/**
 * Flattened index, including children, keyed by route key.
 *
 * Full paths and ancestor trails are computed HERE, once, at module load. The
 * alternative, every consumer re-walking the tree to work out an href, is
 * how a nav item and a URL drift apart.
 */
export const ROUTE_INDEX: ReadonlyMap<string, RouteRecord> = (() => {
  const out = new Map<string, RouteRecord>();

  const walk = (
    nodes: readonly RouteNode[],
    parentPath: string,
    trail: readonly string[],
  ): void => {
    for (const node of nodes) {
      if (out.has(node.key)) {
        throw new Error(`Duplicate route key "${node.key}" in the registry.`);
      }
      if (node.path.includes('/')) {
        throw new Error(
          `Route "${node.key}" declares path "${node.path}". A path is ONE segment ` +
            `relative to its parent; the full path is derived from the tree.`,
        );
      }
      // `[parentPath, node.path].filter(Boolean)` rather than a template, so the
      // root's empty path does not produce a leading or doubled slash.
      const path = [parentPath, node.path].filter(Boolean).join('/');

      // A leaf always has a page. A group has one only if it owns panels;
      // otherwise its page would show nothing the sidebar does not already.
      const hasPage = !node.children?.length || ownsWidgets(node.feature);

      out.set(node.key, { node, path, trail, depth: trail.length, hasPage });
      if (node.children) walk(node.children, path, [...trail, node.key]);
    }
  };

  walk(ROUTES, '', []);
  return out;
})();

/**
 * Lookup by the full path below the persona root, which is what the catch-all
 * route hands us after joining its segments.
 *
 * Pageless groups are EXCLUDED, so `/p/x/learning` 404s exactly like a URL that
 * was never in the registry. Keeping them in and checking a flag at the call
 * site would work until the second call site forgot.
 */
export const ROUTE_BY_PATH: ReadonlyMap<string, RouteRecord> = new Map(
  [...ROUTE_INDEX.values()]
    .filter((record) => record.hasPage)
    .map((record) => [record.path, record]),
);

/** Lookup by feature key. One key gates at most one route. */
export const ROUTE_BY_FEATURE: ReadonlyMap<string, RouteRecord> = new Map(
  [...ROUTE_INDEX.values()].map((record) => [record.node.feature, record]),
);

/**
 * Every feature key the registry references, de-duplicated.
 *
 * This is intersected with `/v1/me.features` before evaluate, which keeps the
 * request comfortably under the 64-key cap. See `resolveEntitlements` for why
 * the intersection is safe and what would break it.
 */
export const REGISTRY_FEATURE_KEYS: readonly FeatureKey[] = [
  ...new Set([...ROUTE_INDEX.values()].map((r) => r.node.feature)),
];
