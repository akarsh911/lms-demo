/**
 * TanStack Query cache keys, in one place.
 *
 * Centralised so that invalidation after a mutation is a compile-checked
 * reference rather than a hand-retyped array. A typo'd key in an
 * `invalidateQueries` call does not error — it just silently invalidates
 * nothing, and the screen quietly shows stale data.
 *
 * Convention: `[domain, entity, ...params]`, broad to narrow, so a prefix
 * invalidates everything beneath it.
 */
export const queryKeys = {
  attendance: {
    all: ['attendance'] as const,
    classes: () => [...queryKeys.attendance.all, 'classes'] as const,
    summary: (classId: string, date: string) =>
      [...queryKeys.attendance.all, 'summary', classId, date] as const,
    roster: (classId: string, date: string) =>
      [...queryKeys.attendance.all, 'roster', classId, date] as const,
    leaves: (classId: string, date: string) => [...queryKeys.attendance.all, 'leaves', classId, date] as const,
    registers: (date: string) => [...queryKeys.attendance.all, 'registers', date] as const,
  },
  timetable: {
    all: ['timetable'] as const,
    today: (personaSlug: string) =>
      [...queryKeys.timetable.all, 'today', personaSlug] as const,
  },
  labs: {
    all: ['labs'] as const,
    attempts: (bench: string) => [...queryKeys.labs.all, 'attempts', bench] as const,
    features: (bench: string) => [...queryKeys.labs.all, 'features', bench] as const,
  },
  mindmap: {
    all: ['mindmap'] as const,
    books: () => [...queryKeys.mindmap.all, 'books'] as const,
    chapters: (itemId: string) => [...queryKeys.mindmap.all, 'chapters', itemId] as const,
    map: (itemId: string, sectionId: string) =>
      [...queryKeys.mindmap.all, 'map', itemId, sectionId] as const,
    node: (itemId: string, sectionId: string, nodeId: string) =>
      [...queryKeys.mindmap.all, 'node', itemId, sectionId, nodeId] as const,
    trace: (itemId: string, sectionId: string, from: string, to: string) =>
      [...queryKeys.mindmap.all, 'trace', itemId, sectionId, from, to] as const,
    // The seed is part of the key because it IS the drill: the engine rebuilds
    // the same questions from it, so two seeds are two different drills and must
    // not share a cache entry.
    drill: (itemId: string, sectionId: string, kind: string, n: number, seed: number, topicId = '') =>
      [...queryKeys.mindmap.all, 'drill', itemId, sectionId, kind, n, seed, topicId] as const,
    curriculumNode: (nodeId: string) =>
      [...queryKeys.mindmap.all, 'curriculum-node', nodeId] as const,
  },
  mastery: {
    all: ['mastery'] as const,
    chapter: (itemId: string, sectionId: string) =>
      [...queryKeys.mastery.all, 'chapter', itemId, sectionId] as const,
  },
  flashcards: {
    all: ['flashcards'] as const,
    catalog: (subject: string, grade: number) =>
      [...queryKeys.flashcards.all, 'catalog', subject, grade] as const,
    deck: (deckId: string) => [...queryKeys.flashcards.all, 'deck', deckId] as const,
    sourcePage: (documentId: string, page: number) =>
      [...queryKeys.flashcards.all, 'source-page', documentId, page] as const,
  },
  /**
   * emerge-core. `identity` and `capabilities` are the caller's own answer and
   * change only when a grant or their own record does, so `core.all` is the
   * prefix a person edit invalidates: a changed display name shows in
   * `/auth/me`, not only in the row the PATCH returned.
   */
  core: {
    all: ['core'] as const,
    identity: () => [...queryKeys.core.all, 'identity'] as const,
    capabilities: () => [...queryKeys.core.all, 'capabilities'] as const,
  },
  /**
   * The roster. `offset` is part of the list key because emerge-core pages by
   * offset and reports no total: two offsets are two different answers and
   * must not share a cache entry, and there is no page count that would let
   * one be derived from the other.
   */
  roster: {
    all: ['roster'] as const,
    list: (kind: string, q: string, offset: number) =>
      [...queryKeys.roster.all, 'list', kind, q, offset] as const,
    member: (kind: string, id: string) =>
      [...queryKeys.roster.all, 'member', kind, id] as const,
  },
  /**
   * The academic structure. Every key carries the offset for the same reason
   * the roster keys do: emerge-core pages by offset and reports no total.
   */
  academic: {
    all: ['academic'] as const,
    sections: (offset: number) => [...queryKeys.academic.all, 'sections', offset] as const,
    everySection: () => [...queryKeys.academic.all, 'sections', 'every'] as const,
    offerings: (sectionId: string) =>
      [...queryKeys.academic.all, 'offerings', sectionId] as const,
    enrollments: (sectionId: string, offset: number) =>
      [...queryKeys.academic.all, 'enrollments', sectionId, offset] as const,
    section: (sectionId: string) =>
      [...queryKeys.academic.all, 'section', sectionId] as const,
    offering: (offeringId: string) =>
      [...queryKeys.academic.all, 'offering', offeringId] as const,
    teachersOf: (sectionId: string) =>
      [...queryKeys.academic.all, 'teacher-assignments', sectionId] as const,
    offeringEnrollments: (offeringId: string) =>
      [...queryKeys.academic.all, 'subject-enrollments', offeringId] as const,
    classStudents: (sectionId: string) =>
      [...queryKeys.academic.all, 'class-students', sectionId] as const,
    classEnrollments: (sectionId: string) =>
      [...queryKeys.academic.all, 'class-enrollments', sectionId] as const,
  },
  classroom: {
    all: ['classroom'] as const,
    week: (sectionId: string, from: string, to: string) =>
      [...queryKeys.classroom.all, 'week', sectionId, from, to] as const,
    sectionCalendar: (sectionId: string, from: string, to: string) =>
      [...queryKeys.classroom.all, 'section-calendar', sectionId, from, to] as const,
    stream: (targets: string, offset: number, liveOnly: boolean) =>
      [...queryKeys.classroom.all, 'stream', targets, offset, liveOnly] as const,
    comments: (postId: string) =>
      [...queryKeys.classroom.all, 'comments', postId] as const,
    assignments: (offeringId: string, offset: number) =>
      [...queryKeys.classroom.all, 'assignments', offeringId, offset] as const,
    assignmentItems: (assignmentId: string) =>
      [...queryKeys.classroom.all, 'assignment-items', assignmentId] as const,
    submissions: (assignmentId: string) =>
      [...queryKeys.classroom.all, 'submissions', assignmentId] as const,
  },
  /**
   * The library and the curriculum. `nodeContent` is keyed on the node alone
   * because nothing here sends `include_ancestors` or `include_proposed`: if
   * either is ever offered, it belongs in this key, since both change the
   * answer for the same node.
   */
  library: {
    all: ['library'] as const,
    items: (offset: number) => [...queryKeys.library.all, 'items', offset] as const,
    curricula: () => [...queryKeys.library.all, 'curricula'] as const,
    nodes: (curriculumId: string) =>
      [...queryKeys.library.all, 'nodes', curriculumId] as const,
    nodeContent: (nodeId: string) =>
      [...queryKeys.library.all, 'node-content', nodeId] as const,
    filed: (scope: string) => [...queryKeys.library.all, 'filed', scope] as const,
    placements: (scope: string) =>
      [...queryKeys.library.all, 'placements', scope] as const,
  },
  person: {
    all: ['person'] as const,
    subjects: () => [...queryKeys.person.all, 'subjects'] as const,
    studentEnrollments: (studentId: string) =>
      [...queryKeys.person.all, 'student-enrollments', studentId] as const,
    subjectEnrollments: (studentId: string) =>
      [...queryKeys.person.all, 'subject-enrollments', studentId] as const,
    teacherAssignments: (teacherId: string) =>
      [...queryKeys.person.all, 'teacher-assignments', teacherId] as const,
    attendanceDays: (studentId: string, from: string, to: string) =>
      [...queryKeys.person.all, 'attendance-days', studentId, from, to] as const,
    attendancePeriods: (studentId: string, from: string, to: string) =>
      [...queryKeys.person.all, 'attendance-periods', studentId, from, to] as const,
    assignments: (targetIds: string) =>
      [...queryKeys.person.all, 'assignments', targetIds] as const,
    submissions: (studentId: string) =>
      [...queryKeys.person.all, 'assignment-submissions', studentId] as const,
    stream: (scope: string) => [...queryKeys.person.all, 'stream-posts', scope] as const,
    occurrences: (teacherId: string, branchId: string, from: string, to: string) =>
      [...queryKeys.person.all, 'occurrences', teacherId, branchId, from, to] as const,
    offerings: () => [...queryKeys.person.all, 'subject-offerings'] as const,
    calendarDay: (branchId: string, date: string) =>
      [...queryKeys.person.all, 'calendar-day', branchId, date] as const,
    daySchedules: (dayId: string) =>
      [...queryKeys.person.all, 'day-schedules', dayId] as const,
    schemePeriods: (schemeId: string) =>
      [...queryKeys.person.all, 'scheme-periods', schemeId] as const,
    bellPeriods: (bellId: string) =>
      [...queryKeys.person.all, 'bell-periods', bellId] as const,
  },
  retrieval: {
    all: ['retrieval'] as const,
    books: (subject: string, grade: number) =>
      [...queryKeys.retrieval.all, 'books', subject, grade] as const,
    section: (documentId: string, query: string) =>
      [...queryKeys.retrieval.all, 'section', documentId, query] as const,
    scoped: (sectionId: string, query: string, topK: number) =>
      [...queryKeys.retrieval.all, 'scoped', sectionId, query, topK] as const,
  },
  playground: {
    all: ['playground'] as const,
    manifest: () => [...queryKeys.playground.all, 'manifest'] as const,
  },
  timeline: {
    all: ['timeline'] as const,
    data: () => [...queryKeys.timeline.all, 'data'] as const,
    context: (code: string) => [...queryKeys.timeline.all, 'context', code] as const,
  },
  answerChecker: {
    all: ['answer-checker'] as const,
    health: () => [...queryKeys.answerChecker.all, 'health'] as const,
    papers: () => [...queryKeys.answerChecker.all, 'papers'] as const,
    paper: (paperId: string) => [...queryKeys.answerChecker.all, 'paper', paperId] as const,
    references: (paperId: string, n: number) => [...queryKeys.answerChecker.all, 'references', paperId, n] as const,
    exams: () => [...queryKeys.answerChecker.all, 'exams'] as const,
    exam: (examId: string) => [...queryKeys.answerChecker.all, 'exam', examId] as const,
    rubric: (examId: string) => [...queryKeys.answerChecker.all, 'rubric', examId] as const,
    booklets: (examId: string) => [...queryKeys.answerChecker.all, 'booklets', examId] as const,
    booklet: (examId: string, bookletId: string) => [...queryKeys.answerChecker.all, 'booklet', examId, bookletId] as const,
    results: (examId: string) => [...queryKeys.answerChecker.all, 'results', examId] as const,
    job: (jobId: string) => [...queryKeys.answerChecker.all, 'job', jobId] as const,
    omrSheets: (paperId: string) => [...queryKeys.answerChecker.all, 'omr-sheets', paperId] as const,
  },
  debate: {
    all: ['debate'] as const,
    status: () => [...queryKeys.debate.all, 'status'] as const,
    catalog: (scripted: boolean) => [...queryKeys.debate.all, 'catalog', scripted] as const,
    session: (id: string) => [...queryKeys.debate.all, 'session', id] as const,
    report: (id: string) => [...queryKeys.debate.all, 'report', id] as const,
  },
  lessonPlanner: {
    all: ['lesson-planner'] as const,
    context: () => [...queryKeys.lessonPlanner.all, 'context'] as const,
    outline: (curriculumId: string) => [...queryKeys.lessonPlanner.all, 'outline', curriculumId] as const,
    plans: () => [...queryKeys.lessonPlanner.all, 'plans'] as const,
    plan: (id: string) => [...queryKeys.lessonPlanner.all, 'plans', id] as const,
    week: (from: string, sectionId: string) => [...queryKeys.lessonPlanner.all, 'week', from, sectionId] as const,
    termContext: (offeringId: string) => [...queryKeys.lessonPlanner.all, 'term-context', offeringId] as const,
    termPlan: (offeringId: string) => [...queryKeys.lessonPlanner.all, 'term-plan', offeringId] as const,
  },
  gapAnalyzer: {
    all: ['gap-analyzer'] as const,
    scope: () => [...queryKeys.gapAnalyzer.all, 'scope'] as const,
    learner: (studentId: string) => [...queryKeys.gapAnalyzer.all, 'learner', studentId] as const,
    section: (sectionId: string, subjectCode: string) => [...queryKeys.gapAnalyzer.all, 'section', sectionId, subjectCode] as const,
    grade: (grade: number, subjectCode: string) => [...queryKeys.gapAnalyzer.all, 'grade', grade, subjectCode] as const,
  },
  /**
   * The school-administrator surface: the year, the shape of the day, the rooms
   * and the week.
   *
   * No key carries an offset, unlike the roster and the academic keys above,
   * because none of these lists is paged in the UI: a branch has one period
   * scheme with nine periods, and a timetable's slots are followed to the end
   * before they are indexed into a grid. `school.all` is the prefix a write
   * invalidates when it could have moved something a sibling list shows —
   * placing a slot changes both the grid and the requirements count.
   */
  school: {
    all: ['school'] as const,
    branches: () => [...queryKeys.school.all, 'branches'] as const,
    sessions: () => [...queryKeys.school.all, 'academic-sessions'] as const,
    calendarDays: (branchId: string, from: string, to: string) =>
      [...queryKeys.school.all, 'calendar-days', branchId, from, to] as const,
    daySchedules: (dayId: string) =>
      [...queryKeys.school.all, 'day-schedules', dayId] as const,
    schemes: (branchId: string) => [...queryKeys.school.all, 'schemes', branchId] as const,
    periods: (schemeId: string) => [...queryKeys.school.all, 'periods', schemeId] as const,
    bells: (schemeId: string) => [...queryKeys.school.all, 'bells', schemeId] as const,
    bellPeriods: (bellId: string) =>
      [...queryKeys.school.all, 'bell-periods', bellId] as const,
    schemeGrades: (schemeId: string) =>
      [...queryKeys.school.all, 'scheme-grades', schemeId] as const,
    branchSchemeGrades: (schemeIds: string) =>
      [...queryKeys.school.all, 'branch-scheme-grades', schemeIds] as const,
    branchSchemeBells: (schemeIds: string) =>
      [...queryKeys.school.all, 'branch-scheme-bells', schemeIds] as const,
    gradeLevels: () => [...queryKeys.school.all, 'grade-levels'] as const,
    gradingSchemes: (sessionId: string) =>
      [...queryKeys.school.all, 'grading-schemes', sessionId] as const,
    rooms: (branchId: string) => [...queryKeys.school.all, 'rooms', branchId] as const,
    timetables: (schemeId: string) =>
      [...queryKeys.school.all, 'timetables', schemeId] as const,
    slots: (timetableId: string) =>
      [...queryKeys.school.all, 'slots', timetableId] as const,
    generation: (timetableId: string, jobId: string) =>
      [...queryKeys.school.all, 'generation', timetableId, jobId] as const,
    clashReport: (timetableId: string) =>
      [...queryKeys.school.all, 'clash-report', timetableId] as const,
    sections: (branchId: string) =>
      [...queryKeys.school.all, 'sections', branchId] as const,
    offerings: (sectionId: string) =>
      [...queryKeys.school.all, 'offerings', sectionId] as const,
    assignments: (sectionId: string) =>
      [...queryKeys.school.all, 'teacher-assignments', sectionId] as const,
    teachers: () => [...queryKeys.school.all, 'teachers'] as const,
    person: (personId: string) => [...queryKeys.school.all, 'person', personId] as const,
  },
  exams: {
    all: ['exams'] as const,
    list: (branchId: string, sessionId: string) =>
      [...queryKeys.exams.all, 'list', branchId, sessionId] as const,
    exam: (examId: string) => [...queryKeys.exams.all, 'exam', examId] as const,
    subjects: (examId: string) =>
      [...queryKeys.exams.all, 'subjects', examId] as const,
    sittings: (examId: string) =>
      [...queryKeys.exams.all, 'sittings', examId] as const,
    branchPeriods: (schemeIds: string) =>
      [...queryKeys.exams.all, 'branch-periods', schemeIds] as const,
    reachable: () => [...queryKeys.exams.all, 'reachable'] as const,
    sittingDays: (dayIds: string) =>
      [...queryKeys.exams.all, 'sitting-days', dayIds] as const,
    marks: (examSubjectId: string) =>
      [...queryKeys.exams.all, 'marks', examSubjectId] as const,
  },
  papers: {
    all: ['papers'] as const,
    list: (sessionId: string) => [...queryKeys.papers.all, 'list', sessionId] as const,
    paper: (paperId: string) => [...queryKeys.papers.all, 'paper', paperId] as const,
    run: (runId: string) => [...queryKeys.papers.all, 'run', runId] as const,
    runs: (blueprintId: string) => [...queryKeys.papers.all, 'runs', blueprintId] as const,
  },
  blueprints: {
    all: ['blueprints'] as const,
    list: (scope: string) => [...queryKeys.blueprints.all, 'list', scope] as const,
    blueprint: (id: string) => [...queryKeys.blueprints.all, 'blueprint', id] as const,
  },
  questions: {
    all: ['questions'] as const,
    list: (scope: string) => [...queryKeys.questions.all, 'list', scope] as const,
    versions: (questionId: string) =>
      [...queryKeys.questions.all, 'versions', questionId] as const,
  },
  mdm: {
    all: ['mdm'] as const,
    branches: () => [...queryKeys.mdm.all, 'branches'] as const,
    sessions: () => [...queryKeys.mdm.all, 'academic-sessions'] as const,
    gradeLevels: () => [...queryKeys.mdm.all, 'grade-levels'] as const,
    houses: () => [...queryKeys.mdm.all, 'school-houses'] as const,
    subjects: () => [...queryKeys.mdm.all, 'subjects'] as const,
    subjectGroups: () => [...queryKeys.mdm.all, 'subject-groups'] as const,
    sections: (branchId: string, sessionId: string) =>
      [...queryKeys.mdm.all, 'sections', branchId, sessionId] as const,
    offerings: (sectionId: string) =>
      [...queryKeys.mdm.all, 'offerings', sectionId] as const,
  },
  rostering: {
    all: ['rostering'] as const,
    enrolments: (sectionId: string) =>
      [...queryKeys.rostering.all, 'enrollments', sectionId] as const,
    roll: (sectionId: string) => [...queryKeys.rostering.all, 'roll', sectionId] as const,
    candidates: (q: string) => [...queryKeys.rostering.all, 'candidates', q] as const,
    teaching: (sectionId: string) =>
      [...queryKeys.rostering.all, 'teacher-assignments', sectionId] as const,
    subjectEnrolments: (offeringId: string) =>
      [...queryKeys.rostering.all, 'subject-enrollments', offeringId] as const,
    offeringPupils: (offeringId: string) =>
      [...queryKeys.rostering.all, 'offering-pupils', offeringId] as const,
  },
  results: {
    all: ['results'] as const,
    schemes: (sessionId: string) =>
      [...queryKeys.results.all, 'schemes', sessionId] as const,
    components: (schemeId: string) =>
      [...queryKeys.results.all, 'components', schemeId] as const,
    componentExams: (componentId: string) =>
      [...queryKeys.results.all, 'component-exams', componentId] as const,
    componentAssignments: (componentId: string) =>
      [...queryKeys.results.all, 'component-assignments', componentId] as const,
    exams: (sessionId: string, branchId: string) =>
      [...queryKeys.results.all, 'exams', sessionId, branchId] as const,
    assignments: (sessionId: string) =>
      [...queryKeys.results.all, 'assignments', sessionId] as const,
    offering: (offeringId: string, studentId: string) =>
      [...queryKeys.results.all, 'offering', offeringId, studentId] as const,
    reportCard: (studentId: string, sessionId: string) =>
      [...queryKeys.results.all, 'report-card', studentId, sessionId] as const,
  },
  actions: {
    all: ['actions'] as const,
    list: () => [...queryKeys.actions.all, 'list'] as const,
    summary: () => [...queryKeys.actions.all, 'summary'] as const,
    detail: (id: string) => [...queryKeys.actions.all, 'detail', id] as const,
    owners: () => [...queryKeys.actions.all, 'owners'] as const,
  },
  homework: {
    all: ['homework'] as const,
    list: () => [...queryKeys.homework.all, 'list'] as const,
    summary: () => [...queryKeys.homework.all, 'summary'] as const,
    detail: (id: string) => [...queryKeys.homework.all, 'detail', id] as const,
    options: () => [...queryKeys.homework.all, 'options'] as const,
    mine: () => [...queryKeys.homework.all, 'mine'] as const,
  },
  grasp: {
    all: ['grasp'] as const,
    list: () => [...queryKeys.grasp.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.grasp.all, 'detail', id] as const,
    bank: () => [...queryKeys.grasp.all, 'bank'] as const,
    host: () => [...queryKeys.grasp.all, 'host'] as const,
    join: (code: string) => [...queryKeys.grasp.all, 'join', code] as const,
  },
  notices: {
    all: ['notices'] as const,
    list: () => [...queryKeys.notices.all, 'list'] as const,
    summary: () => [...queryKeys.notices.all, 'summary'] as const,
    detail: (id: string) => [...queryKeys.notices.all, 'detail', id] as const,
    audience: () => [...queryKeys.notices.all, 'audience'] as const,
    students: (query: string) => [...queryKeys.notices.all, 'students', query] as const,
    staff: (query: string) => [...queryKeys.notices.all, 'staff', query] as const,
    reach: (key: string) => [...queryKeys.notices.all, 'reach', key] as const,
  },
  myCalendar: () => ['my-calendar'] as const,
  pupilLeave: () => ['pupil-leave'] as const,
  fees: {
    mine: () => ['fees', 'mine'] as const,
    overview: () => ['fees', 'overview'] as const,
  },
  house: {
    mine: () => ['house', 'mine'] as const,
  },
  materialShares: {
    offering: (offeringId: string) => ['material-shares', offeringId] as const,
  },
  classRoles: {
    section: (sectionId: string) => ['class-roles', sectionId] as const,
    mine: () => ['class-roles', 'mine'] as const,
  },
  leave: {
    all: ['leave'] as const,
    mine: () => ['leave', 'mine'] as const,
  },
  teaching: {
    mine: () => ['teaching', 'mine'] as const,
    week: (weekOf: string) => ['teaching', 'week', weekOf] as const,
  },
  structure: {
    all: ['structure'] as const,
    year: (yearId: string) => [...queryKeys.structure.all, 'year', yearId] as const,
    subjects: (yearId: string, gradeId: string) => [...queryKeys.structure.all, 'subjects', yearId, gradeId] as const,
    rooms: (yearId: string) => [...queryKeys.structure.all, 'rooms', yearId] as const,
    teachers: (yearId: string) => [...queryKeys.structure.all, 'teachers', yearId] as const,
    merge: (fromId: string, intoId: string) => [...queryKeys.structure.all, 'merge', fromId, intoId] as const,
    recommendation: (yearId: string, gradeId: string) => [...queryKeys.structure.all, 'recommendation', yearId, gradeId] as const,
    proposal: (yearId: string, gradeId: string) => [...queryKeys.structure.all, 'proposal', yearId, gradeId] as const,
  },
  directory: {
    all: ['directory'] as const,
    teachers: (yearId: string) => [...queryKeys.directory.all, 'teachers', yearId] as const,
  },
  grades: {
    all: ['grades'] as const,
    exams: (sessionId: string) => [...queryKeys.grades.all, 'exams', sessionId] as const,
    exam: (examId: string, filter: string) => [...queryKeys.grades.all, 'exam', examId, filter] as const,
    student: (studentId: string, sessionId: string) => [...queryKeys.grades.all, 'student', studentId, sessionId] as const,
    mark: (markId: string) => [...queryKeys.grades.all, 'mark', markId] as const,
    paper: (examSubjectId: string) => [...queryKeys.grades.all, 'paper', examSubjectId] as const,
    students: (query: string) => [...queryKeys.grades.all, 'students', query] as const,
    classmates: (studentId: string, sessionId: string, scope: string, gradeId: string, sectionId: string) => [...queryKeys.grades.all, 'classmates', studentId, sessionId, scope, gradeId, sectionId] as const,
  },
  foundation: {
    all: ['foundation'] as const,
    overview: () => [...queryKeys.foundation.all, 'overview'] as const,
    setup: () => [...queryKeys.foundation.all, 'setup'] as const,
    profile: () => [...queryKeys.foundation.all, 'profile'] as const,
    yearRegisters: () => [...queryKeys.foundation.all, 'year-registers'] as const,
    yearRegister: (yearId: string) => [...queryKeys.foundation.all, 'year-register', yearId] as const,
    yearEnrollments: (yearId: string) => [...queryKeys.foundation.all, 'year-enrollments', yearId] as const,
    setupAreas: (yearId: string) => [...queryKeys.foundation.all, 'setup-areas', yearId] as const,
    pendingTasks: (yearId: string) => [...queryKeys.foundation.all, 'pending-tasks', yearId] as const,
    yearClasses: (yearId: string) => [...queryKeys.foundation.all, 'year-classes', yearId] as const,
    yearTeaching: (yearId: string) => [...queryKeys.foundation.all, 'year-teaching', yearId] as const,
    yearTransition: (yearId: string) => [...queryKeys.foundation.all, 'year-transition', yearId] as const,
    yearEvents: (yearId: string) => [...queryKeys.foundation.all, 'year-events', yearId] as const,
    workingWeek: (yearId: string) => [...queryKeys.foundation.all, 'working-week', yearId] as const,
    roomInsights: () => [...queryKeys.foundation.all, 'room-insights'] as const,
    roomInsight: (roomId: string) => [...queryKeys.foundation.all, 'room-insight', roomId] as const,
  },
} as const;
