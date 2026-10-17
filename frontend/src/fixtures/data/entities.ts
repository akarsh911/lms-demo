type Verb = 'read' | 'write' | 'delete' | 'create' | 'override' | 'generate';

const keys = (area: string, verbs: readonly Verb[], narrowable: boolean): string[] =>
  verbs.flatMap((verb) =>
    narrowable && verb !== 'create' && verb !== 'override' && verb !== 'generate'
      ? [`core.${area}.${verb}`, `core.${area}.${verb}_all`]
      : [`core.${area}.${verb}`],
  );

const RWD = ['read', 'write', 'delete'] as const;
const CRWD = ['create', 'read', 'write', 'delete'] as const;

const NARROWABLE = [
  'assignment_submissions', 'assignments', 'attendance', 'enrollments', 'praises', 'stream_comments', 'stream_posts',
  'student_achievements', 'student_addresses', 'student_assignments', 'student_documents', 'student_notes',
  'subject_enrollments', 'teacher_assignments',
] as const;

const NARROWABLE_WITH_CREATE = ['content_placements', 'curriculum', 'guardians', 'library', 'students', 'teachers'] as const;

const FLAT = [
  'academic_sessions', 'achievements', 'calendar', 'praise_reactions', 'reference', 'rooms', 'schools', 'sections',
  'subject_offerings',
] as const;

// Transcribed from emerge-core `internal/authorization` AllEntities; the last four areas are from the papers work, which is newer than the local checkout.
export const CORE_ENTITIES: string[] = [
  ...NARROWABLE.flatMap((area) => keys(area, RWD, true)),
  ...NARROWABLE_WITH_CREATE.flatMap((area) => keys(area, CRWD, true)),
  ...FLAT.flatMap((area) => keys(area, RWD, false)),
  ...keys('persons', RWD, true),
  ...keys('staff', RWD, true),
  ...keys('timetable', ['read', 'write', 'delete', 'override', 'generate'], true),
  'core.student_guardians.write',
  ...keys('papers', CRWD, false),
  ...keys('blueprints', CRWD, false),
  'core.paper_generation.read',
  'core.question_bank.read',
].sort();

const reads = (...areas: string[]): string[] => areas.map((area) => `core.${area}.read`);

// A teacher: narrowed reads everywhere they teach, and writes only on what a classroom produces.
export const TEACHER_ENTITIES: string[] = [
  ...reads(
    'academic_sessions', 'achievements', 'assignment_submissions', 'assignments', 'attendance', 'blueprints', 'calendar',
    'content_placements', 'curriculum', 'enrollments', 'guardians', 'library', 'paper_generation', 'papers', 'persons',
    'praises', 'question_bank', 'reference', 'rooms', 'sections', 'staff', 'stream_comments', 'stream_posts',
    'student_achievements', 'students', 'subject_enrollments', 'subject_offerings', 'teacher_assignments', 'teachers',
    'timetable',
  ),
  'core.persons.write',
  'core.attendance.write',
  'core.stream_posts.write',
  'core.stream_comments.write',
  'core.assignments.write',
  'core.assignment_submissions.write',
  'core.library.create',
  'core.library.write',
  'core.content_placements.create',
  'core.content_placements.write',
  'core.content_placements.delete',
  'core.papers.create',
  'core.papers.write',
  'core.praises.write',
];

// A student: their own record and class, and writes only on what a pupil hands in or says.
export const STUDENT_ENTITIES: string[] = [
  ...reads(
    'academic_sessions', 'assignment_submissions', 'assignments', 'attendance', 'calendar', 'content_placements',
    'curriculum', 'enrollments', 'library', 'persons', 'praises', 'reference', 'sections', 'stream_comments',
    'stream_posts', 'student_achievements', 'students', 'subject_enrollments', 'subject_offerings', 'timetable',
  ),
  'core.persons.write',
  'core.assignment_submissions.write',
  'core.stream_comments.write',
];

export const GUARDIAN_ENTITIES: string[] = [
  ...reads(
    'academic_sessions', 'assignment_submissions', 'assignments', 'attendance', 'calendar', 'enrollments', 'guardians',
    'persons', 'reference', 'sections', 'stream_comments', 'stream_posts', 'student_achievements', 'students',
    'subject_enrollments', 'subject_offerings', 'timetable',
  ),
  'core.persons.write',
];
