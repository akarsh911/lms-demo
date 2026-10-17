import { parentOf } from '@/constants/features';
import type { WidgetDescriptor } from '@/types/widget';

import { TimetableTodayWidget } from './timetable/timetable-today-widget';
import { OverviewActionsWidget } from './home/overview-actions-widget';
import { OverviewAgendaWidget } from './home/overview-agenda-widget';
import { OverviewAttentionWidget } from './home/overview-attention-widget';
import { OverviewNeedsWidget } from './home/overview-needs-widget';
import { OverviewSummaryWidget } from './home/overview-summary-widget';
import { AnnouncementsWidget } from './home/announcements-widget';
import { ActionsWidget } from './actions/actions-widget';
import { DueWorkWidget } from './home/due-work-widget';
import { LatestResultsWidget } from './home/latest-results-widget';
import { MyClassWidget } from './home/my-class-widget';
import { MyClassesWidget } from './home/my-classes-widget';
import { NeedsYouWidget } from './home/needs-you-widget';
import { MySubjectsWidget } from './subjects/my-subjects-widget';
import { MyTimetableWidget } from './timetable/my-timetable-widget';
import { MyLeaveWidget } from './leave/my-leave-widget';
import { MyStudentsWidget } from './students/my-students-widget';
import { MyHouseWidget } from './house/my-house-widget';
import { MyCalendarWidget } from './calendar/my-calendar-widget';
import { FeesWidget } from './fees/fees-widget';
import { HomeworkWidget } from './homework/homework-widget';
import { NoticesWidget } from './notices/notices-widget';
import { AttendanceWorkspaceWidget } from './attendance/attendance-workspace-widget';
import { LabAttemptsWidget, LabBenchWidget } from '@/modules/virtual-labs';
import { MindMapWidget } from './learning/mindmap-widget';
import { FlashcardsWidget } from './learning/flashcards-widget';
import { BlueprintsWidget, PapersWidget } from './learning/papers-widget';
import { PlaygroundWidget } from './learning/playground-widget';
import { TimelineWidget } from './learning/timeline-widget';
import { AnswerSheetsWidget } from './learning/answer-sheets-widget';
import { LessonPlannerWidget } from '@/components/lesson-planner/lesson-planner-widget';
import { DebateWidget } from './learning/debate-widget';
import { ProfileWidget } from './profile/profile-widget';
import { AdmissionsWidget } from './people/admissions-widget';
import { StudentsExplorerWidget, TeachersDirectoryWidget } from './people/people-widgets';
import { StaffDirectoryWidget } from './people/staff-directory-widget';
import { LibraryWidget } from './library/library-widget';
import { CurriculumWidget } from './library/curriculum-widget';
import { SchoolCalendarWidget } from './school/calendar-widget';
import { SchoolPeriodsWidget } from './school/periods-widget';
import { SchoolSchemeGradesWidget } from './school/scheme-grades-widget';
import { SchoolResultSchemesWidget } from './school/result-schemes-widget';
import { SchoolExamPapersWidget, SchoolExamsWidget } from './school/exams-widget';
import { SchoolRoomsWidget } from './school/rooms-widget';
import { SchoolYearsWidget } from './school/years-widget';
import { SetupChecklistWidget } from './school/setup-checklist-widget';
import { SchoolProfileWidget } from './school/school-profile-widget';
import { SchoolTimetableWidget } from './school/timetable-widget';
import { SchoolTimetableGenerateWidget } from './school/timetable-generate-widget';
import { GradesExamsWidget } from './grades/exams-widget';
import { GradesMarksWidget } from './grades/marks-widget';
import { GradesResultsWidget } from './grades/results-widget';
import { ClassesStructureWidget } from './school/classes-structure-widget';
import { GradesGapsWidget } from './grades/gaps-widget';
import { GapAnalyzerWidget } from './learning/gap-analyzer-widget';
import { GAP_LINK_FEATURES } from '@/components/gap-analyzer/link-features';
import {
  SchoolBranchesWidget,
  SchoolGradeLevelsWidget,
  SchoolHousesWidget,
  SchoolOfferingsWidget,
  SchoolSessionsWidget,
} from '@/components/school/mdm/widgets';
import {
  SchoolTeachingWidget,
} from '@/components/school/rostering/widgets';

/**
 * THE WIDGET REGISTRY.
 *
 * One entry per panel. Every key here is `placement: 'widget'` by definition:
 * a panel with no URL of its own. Sidebar placements live in
 * `routes/registry.ts`, and `check-routes.mjs` refuses a key claiming both.
 *
 * A widget's key nests under the key that owns the page it is drawn on:
 *
 *   emerge.home.timetable            -> a panel on the Home page
 *   emerge.attendance.summary        -> a panel on the Attendance page
 *   emerge.learning.mindmap.canvas   -> a panel on the Mind maps page, which is
 *                                       itself a nested sidebar entry
 *
 * Adding a widget is one entry here plus its component. Nothing about routing,
 * navigation or the section page changes — `WidgetGrid` reads this registry and
 * renders whatever the user is entitled to.
 *
 * Whether a widget is gated independently depends on whether its key is in
 * `CAS_REGISTERED_KEYS`. Until it is, it inherits its section's visibility.
 * That is a deliberate default, explained in `lib/entitlement/resolve-key.ts`.
 */
export const WIDGETS: readonly WidgetDescriptor[] = [
  // --- emerge.home ---------------------------------------------------------
  {
    key: 'home-timetable',
    feature: 'emerge.home.timetable',
    title: "Today's timetable",
    span: 7,
    order: 10,
    Component: TimetableTodayWidget,
  },
  {
    key: 'home-announcements',
    feature: 'emerge.home.announcements',
    title: 'Announcements',
    span: 5,
    order: 20,
    Component: AnnouncementsWidget,
  },

  // --- emerge.home.teaching: a teacher's own day --------------------------
  {
    key: 'teaching-timetable',
    feature: 'emerge.home.teaching.timetable',
    title: "Today's timetable",
    span: 7,
    order: 10,
    Component: TimetableTodayWidget,
  },
  {
    key: 'teaching-needs',
    feature: 'emerge.home.teaching.needs',
    title: 'Needs you',
    span: 5,
    order: 20,
    Component: NeedsYouWidget,
  },
  {
    key: 'teaching-classes',
    feature: 'emerge.home.teaching.classes',
    title: 'My classes',
    span: 7,
    order: 30,
    Component: MyClassesWidget,
  },
  {
    key: 'teaching-announcements',
    feature: 'emerge.home.teaching.announcements',
    title: 'Announcements',
    span: 5,
    order: 40,
    Component: AnnouncementsWidget,
  },

  // --- emerge.home.learner: a pupil's own day -------------------------------
  {
    key: 'learner-timetable',
    feature: 'emerge.home.learner.timetable',
    title: "Today's timetable",
    span: 7,
    order: 10,
    Component: TimetableTodayWidget,
  },
  {
    key: 'learner-work',
    feature: 'emerge.home.learner.work',
    title: 'To hand in',
    span: 5,
    order: 20,
    Component: DueWorkWidget,
  },
  {
    key: 'learner-results',
    feature: 'emerge.home.learner.results',
    title: 'Latest results',
    span: 7,
    order: 30,
    Component: LatestResultsWidget,
  },
  {
    key: 'learner-class',
    feature: 'emerge.home.learner.class',
    title: 'My class',
    span: 5,
    order: 35,
    Component: MyClassWidget,
  },
  {
    key: 'learner-announcements',
    feature: 'emerge.home.learner.announcements',
    title: 'Announcements',
    presentation: 'wide',
    order: 40,
    Component: AnnouncementsWidget,
  },

  // --- emerge.home.overview: Home for whoever runs the school --------------
  // Drawn on the Home page in place of the two panels above when the user holds the overview key.
  {
    key: 'overview-attention',
    feature: 'emerge.home.overview.attention',
    title: 'Needs you first',
    presentation: 'wide',
    order: 10,
    Component: OverviewAttentionWidget,
  },
  {
    key: 'overview-summary',
    feature: 'emerge.home.overview.summary',
    title: 'Today in numbers',
    presentation: 'wide',
    order: 20,
    Component: OverviewSummaryWidget,
  },
  {
    key: 'overview-needs',
    feature: 'emerge.home.overview.needs',
    title: 'Needs attention',
    span: 7,
    order: 30,
    Component: OverviewNeedsWidget,
  },
  {
    key: 'overview-agenda',
    feature: 'emerge.home.overview.agenda',
    title: 'Today',
    span: 5,
    order: 40,
    Component: OverviewAgendaWidget,
  },
  {
    key: 'overview-actions',
    feature: 'emerge.home.overview.actions',
    title: 'Quick actions',
    presentation: 'wide',
    order: 50,
    Component: OverviewActionsWidget,
  },

  // --- emerge.home.profile -------------------------------------------------
  // The only panel on a page that is itself nested under Home. `wide`: a form
  // of paired label-and-value rows reads as a table, and half a row of it beside
  // an unrelated card reads as two things competing.
  {
    key: 'profile-identity',
    feature: 'emerge.home.profile.identity',
    title: 'Your details',
    presentation: 'wide',
    order: 10,
    Component: ProfileWidget,
  },

  // --- emerge.home.people --------------------------------------------------
  // `wide`: a list with a search box, a pager and a detail panel below it is a
  // workspace in width but not in height, and it grows with its own content.
  {
    key: 'people-students',
    feature: 'emerge.home.people.students.explorer',
    title: 'Students',
    presentation: 'wide',
    order: 10,
    Component: StudentsExplorerWidget,
  },
  {
    key: 'people-teachers',
    feature: 'emerge.home.people.teachers.directory',
    title: 'Teachers',
    presentation: 'wide',
    order: 10,
    Component: TeachersDirectoryWidget,
  },
  {
    // The emerge-core roster, kept for office staff and guardians; it is also the one people list that reads the live API.
    key: 'people-roster',
    feature: 'emerge.home.people.staff.directory',
    title: 'Directory',
    presentation: 'wide',
    order: 10,
    Component: StaffDirectoryWidget,
  },
  // People is a branch, never a page: admitting somebody sits on the leaf lists it adds to.
  {
    key: 'people-students-admissions',
    feature: 'emerge.home.people.students.admissions',
    title: 'Add somebody to the school',
    presentation: 'wide',
    order: 20,
    Component: AdmissionsWidget,
  },
  {
    key: 'people-teachers-admissions',
    feature: 'emerge.home.people.teachers.admissions',
    title: 'Add somebody to the school',
    presentation: 'wide',
    order: 20,
    Component: AdmissionsWidget,
  },

  // --- emerge.home.library -------------------------------------------------
  // The curriculum comes FIRST. It answers "what do we have for this chapter",
  // which is the question a teacher arrives with; the catalogue below it is the
  // same material listed flat, and is the answer to a rarer question.
  {
    key: 'library-curriculum',
    feature: 'emerge.home.library.curriculum',
    title: 'Curriculum',
    presentation: 'wide',
    order: 10,
    linksTo: ['emerge.learning.mindmap'],
    Component: CurriculumWidget,
  },
  {
    key: 'library-items',
    feature: 'emerge.home.library.items',
    title: 'Catalogue',
    presentation: 'wide',
    order: 20,
    Component: LibraryWidget,
  },

  // --- emerge.school -------------------------------------------------------
  // One panel per page. Each is the whole of its screen, so each is `wide` —
  // except the builder, which is a workspace and takes the viewport's height.
  {
    key: 'school-calendar-days',
    feature: 'emerge.school.calendar.days',
    title: 'The school year',
    presentation: 'wide',
    order: 10,
    Component: SchoolCalendarWidget,
  },
  {
    key: 'school-period-schemes',
    feature: 'emerge.school.periods.schemes',
    title: 'Patterns of the day',
    presentation: 'wide',
    order: 10,
    Component: SchoolPeriodsWidget,
  },
  {
    key: 'school-period-grades',
    feature: 'emerge.school.periods.grades',
    title: 'Grades and patterns',
    presentation: 'wide',
    order: 20,
    Component: SchoolSchemeGradesWidget,
  },
  // --- emerge.school.setup ---------------------------------------------------
  {
    key: 'school-setup-checklist',
    feature: 'emerge.school.setup.checklist',
    title: 'Setup checklist',
    presentation: 'wide',
    order: 10,
    Component: SetupChecklistWidget,
  },
  // --- emerge.school.profile -------------------------------------------------
  {
    key: 'school-profile-details',
    feature: 'emerge.school.profile.details',
    title: 'School details',
    presentation: 'wide',
    order: 10,
    Component: SchoolProfileWidget,
  },
  // --- emerge.school.years ---------------------------------------------------
  {
    key: 'school-years-list',
    feature: 'emerge.school.years.list',
    title: 'Academic years',
    presentation: 'wide',
    order: 10,
    Component: SchoolYearsWidget,
  },
  {
    key: 'school-rooms-list',
    feature: 'emerge.school.rooms.list',
    title: 'Rooms',
    presentation: 'wide',
    order: 10,
    Component: SchoolRoomsWidget,
  },
  {
    key: 'school-timetable-builder',
    feature: 'emerge.school.timetable.builder',
    title: 'Timetable',
    presentation: 'immersive',
    order: 10,
    Component: SchoolTimetableWidget,
  },
  {
    key: 'school-timetable-generate-solver',
    feature: 'emerge.school.timetable.generate.solver',
    title: 'Auto-fill',
    presentation: 'wide',
    order: 10,
    Component: SchoolTimetableGenerateWidget,
  },
  {
    key: 'school-structure-branches',
    feature: 'emerge.school.structure.branches',
    title: 'Branches',
    presentation: 'wide',
    order: 10,
    Component: SchoolBranchesWidget,
  },
  {
    key: 'school-structure-sessions',
    feature: 'emerge.school.structure.sessions',
    title: 'Academic years',
    presentation: 'wide',
    order: 20,
    Component: SchoolSessionsWidget,
  },
  {
    key: 'school-structure-grades',
    feature: 'emerge.school.structure.grades',
    title: 'Grade levels',
    presentation: 'wide',
    order: 30,
    Component: SchoolGradeLevelsWidget,
  },
  {
    key: 'school-structure-houses',
    feature: 'emerge.school.structure.houses',
    title: 'Houses',
    presentation: 'wide',
    order: 40,
    Component: SchoolHousesWidget,
  },
  {
    key: 'my-calendar',
    feature: 'emerge.calendar.agenda',
    title: 'Calendar',
    presentation: 'wide',
    order: 10,
    Component: MyCalendarWidget,
  },
  {
    key: 'fees-board',
    feature: 'emerge.fees.board',
    title: 'Fees',
    presentation: 'wide',
    order: 10,
    Component: FeesWidget,
  },
  {
    key: 'my-house',
    feature: 'emerge.house.board',
    title: 'My house',
    presentation: 'wide',
    order: 10,
    Component: MyHouseWidget,
  },
  {
    key: 'my-students',
    feature: 'emerge.students.explorer',
    title: 'My students',
    presentation: 'wide',
    order: 10,
    Component: MyStudentsWidget,
  },
  {
    key: 'my-leave',
    feature: 'emerge.home.leave.requests',
    title: 'My leave',
    presentation: 'wide',
    order: 10,
    Component: MyLeaveWidget,
  },
  {
    key: 'my-timetable',
    feature: 'emerge.timetable.week',
    title: 'My timetable',
    presentation: 'wide',
    order: 10,
    Component: MyTimetableWidget,
  },
  {
    key: 'my-subjects',
    feature: 'emerge.subjects.list',
    title: 'My subjects',
    presentation: 'wide',
    order: 10,
    Component: MySubjectsWidget,
  },
  {
    key: 'actions-inbox',
    feature: 'emerge.analytics.inbox',
    title: 'Actions',
    presentation: 'wide',
    order: 10,
    Component: ActionsWidget,
  },
  {
    key: 'assignments-board',
    feature: 'emerge.assignments.board',
    title: 'Assignments',
    presentation: 'wide',
    order: 10,
    Component: HomeworkWidget,
  },
  {
    key: 'announcements-board',
    feature: 'emerge.announcements.board',
    title: 'Announcements',
    presentation: 'wide',
    order: 10,
    Component: NoticesWidget,
  },
  {
    key: 'sections-structure',
    feature: 'emerge.school.sections.structure',
    title: 'Classes & Sections',
    presentation: 'wide',
    order: 10,
    Component: ClassesStructureWidget,
  },
  {
    key: 'school-offerings-list',
    feature: 'emerge.school.offerings.list',
    title: 'Subject offerings',
    presentation: 'wide',
    order: 10,
    Component: SchoolOfferingsWidget,
  },
  {
    key: 'school-offerings-results',
    feature: 'emerge.school.offerings.results',
    title: 'Result schemes',
    presentation: 'wide',
    order: 20,
    Component: SchoolResultSchemesWidget,
  },
  {
    key: 'school-offerings-teaching',
    feature: 'emerge.school.offerings.teaching',
    title: 'Who teaches what',
    presentation: 'wide',
    order: 30,
    Component: SchoolTeachingWidget,
  },
  {
    key: 'school-exams-campaigns',
    feature: 'emerge.school.exams.campaigns',
    title: 'Assessments',
    presentation: 'wide',
    order: 10,
    Component: SchoolExamsWidget,
  },
  {
    key: 'school-exams-papers',
    feature: 'emerge.school.exams.papers',
    title: 'Papers and sittings',
    presentation: 'wide',
    order: 20,
    Component: SchoolExamPapersWidget,
  },

  // --- emerge.grades -------------------------------------------------------
  {
    key: 'grades-exams',
    feature: 'emerge.grades.exams',
    title: 'Examinations',
    presentation: 'wide',
    order: 5,
    Component: GradesExamsWidget,
  },
  {
    key: 'grades-marks',
    feature: 'emerge.grades.marks',
    title: 'Marks entry',
    presentation: 'wide',
    order: 10,
    Component: GradesMarksWidget,
  },
  {
    key: 'grades-results',
    feature: 'emerge.grades.results',
    title: 'Class results',
    presentation: 'wide',
    order: 20,
    Component: GradesResultsWidget,
  },
  {
    key: 'grades-gaps',
    feature: 'emerge.grades.gaps',
    title: 'Learning gaps',
    presentation: 'wide',
    order: 30,
    linksTo: GAP_LINK_FEATURES,
    Component: GradesGapsWidget,
  },

  // --- emerge.attendance ---------------------------------------------------
  // First, because everything below it is a view of whatever this selects.
  {
    key: 'attendance-register',
    feature: 'emerge.attendance.roster',
    title: 'Registers',
    presentation: 'wide',
    order: 10,
    Component: AttendanceWorkspaceWidget,
  },

  // --- emerge.learning.mindmap ---------------------------------------------
  // On a page that is itself nested. Nothing here says so, which is the point.
  // `immersive`: a canvas is a workspace, and one in a 400px card is unusable.
  {
    key: 'mindmap-canvas',
    feature: 'emerge.learning.mindmap.canvas',
    title: 'Mind map',
    presentation: 'immersive',
    order: 10,
    Component: MindMapWidget,
  },

  // --- emerge.learning.flashcards -------------------------------------------
  {
    key: 'flashcards-study',
    feature: 'emerge.learning.flashcards.study',
    title: 'Flashcards',
    presentation: 'immersive',
    order: 10,
    Component: FlashcardsWidget,
  },

  // --- emerge.learning.labs ------------------------------------------------
  // ONE widget serves every practical: with nothing chosen it is the practical
  // file, and `?practical=` opens that bench in the same space. Adding a
  // practical is an entry in the bench registry, not another widget.
  // A bench is a workspace, not a readout, so it is IMMERSIVE: the full row and
  // the viewport's height, with a fullscreen control.
  {
    key: 'labs-bench',
    feature: 'emerge.learning.labs.bench',
    title: 'Virtual lab bench',
    presentation: 'immersive',
    order: 10,
    Component: LabBenchWidget,
  },
  {
    key: 'labs-attempts',
    feature: 'emerge.learning.labs.attempts',
    title: 'Your recent attempts',
    // Full width, under a full-width bench: a 6-column card under a 12-column
    // one reads as a mistake.
    presentation: 'wide',
    order: 20,
    Component: LabAttemptsWidget,
  },

  {
    key: 'playground-viewer',
    feature: 'emerge.learning.playground.viewer',
    title: 'Visual playground',
    presentation: 'immersive',
    order: 10,
    linksTo: ['emerge.learning.timeline'],
    Component: PlaygroundWidget,
  },

  {
    key: 'timeline-viewer',
    feature: 'emerge.learning.timeline.viewer',
    title: 'Timeline',
    presentation: 'immersive',
    order: 10,
    linksTo: ['emerge.learning.playground'],
    Component: TimelineWidget,
  },

  {
    key: 'lesson-planner-workspace',
    feature: 'emerge.learning.lessonplanner.workspace',
    title: 'Lesson planner',
    presentation: 'wide',
    order: 10,
    linksTo: [
      'emerge.learning.mindmap',
      'emerge.learning.playground',
      'emerge.learning.flashcards',
      'emerge.learning.paper_setter',
      'emerge.learning.debate',
      'emerge.learning.timeline',
    ],
    Component: LessonPlannerWidget,
  },

  {
    key: 'debate-room',
    feature: 'emerge.learning.debate.room',
    title: 'Debate room',
    presentation: 'immersive',
    order: 10,
    Component: DebateWidget,
  },

  {
    key: 'papers-list',
    feature: 'emerge.learning.papers.list',
    title: 'Paper bank',
    presentation: 'wide',
    order: 10,
    Component: PapersWidget,
  },
  {
    key: 'papers-blueprints',
    feature: 'emerge.learning.papers.blueprints',
    title: 'Paper patterns',
    presentation: 'wide',
    order: 20,
    Component: BlueprintsWidget,
  },

  {
    key: 'answer-sheets-checker',
    feature: 'emerge.learning.answer_sheets.checker',
    title: 'Answer sheets',
    presentation: 'wide',
    order: 10,
    linksTo: ['emerge.learning.gaps'],
    Component: AnswerSheetsWidget,
  },

  {
    key: 'gap-analyzer',
    feature: 'emerge.learning.gaps.analyzer',
    title: 'Gap analyzer',
    presentation: 'wide',
    order: 10,
    linksTo: GAP_LINK_FEATURES,
    Component: GapAnalyzerWidget,
  },
];

/**
 * Widgets drawn on the page that one feature key owns, in order.
 *
 * Matched on the widget key's PARENT, not on its first two segments. That
 * distinction only became visible once a page could itself be nested: with
 * `sectionOf`, a widget keyed `emerge.learning.mindmap.canvas` reported its
 * section as `emerge.learning` and rendered on the parent's page instead of the
 * mind-map page it names.
 */
export function widgetsForSection(owner: string): WidgetDescriptor[] {
  return WIDGETS.filter((w) => parentOf(w.feature) === owner).sort(
    (a, b) => a.order - b.order,
  );
}

/**
 * Only the widget keys CAS actually knows about need evaluating. Unregistered
 * ones inherit their section and would return a meaningless `no_grant`.
 */
export const WIDGET_FEATURE_KEYS = [...new Set(WIDGETS.map((w) => w.feature))];
