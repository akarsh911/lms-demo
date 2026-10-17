import type { SectionRow } from '@/types/academic';
import type {
  AcademicSession,
  Branch,
  GradeLevel,
  SchoolHouse,
  Subject,
  SubjectGroup,
} from '@/types/mdm';
import type { GradingScheme, Room, SchoolOfferingRow } from '@/types/school';

import { seedId } from '../ids';
import { LETTERS, SECTION_SLOTS } from './cohort';
import { TEACHERS } from './people';

export const BRANCH: Branch = {
  id: seedId('branch', 'main'),
  name: 'Main Campus',
  code: 'MAIN',
  status: 'active',
  phone: '+91 712 555 0142',
  email: 'office@dps-ngp.example',
  address_json: { line1: 'Kamptee Road', city: 'Nagpur', state: 'Maharashtra', postal_code: '440001', country: 'IN' },
};

export const CURRENT_SESSION: AcademicSession = {
  id: seedId('session', 'AY2627'),
  name: '2026 to 2027',
  code: 'AY2627',
  start_date: '2026-04-01T00:00:00Z',
  end_date: '2027-03-31T00:00:00Z',
  is_current: true,
  status: 'active',
  previous_session_id: seedId('session', 'AY2526'),
};

export const PAST_SESSION: AcademicSession = {
  id: seedId('session', 'AY2526'),
  name: '2025 to 2026',
  code: 'AY2526',
  start_date: '2025-04-01T00:00:00Z',
  end_date: '2026-03-31T00:00:00Z',
  is_current: false,
  status: 'closed',
};

export const BRANCHES: Branch[] = [BRANCH];

// Created and nothing else: no terms, working week or bell schedule yet.
export const NEXT_SESSION: AcademicSession = {
  id: seedId('session', 'AY2728'),
  name: '2027 to 2028',
  code: 'AY2728',
  start_date: '2027-04-01T00:00:00Z',
  end_date: '2028-03-31T00:00:00Z',
  is_current: false,
  status: 'upcoming',
  previous_session_id: seedId('session', 'AY2627'),
};

export const SESSIONS: AcademicSession[] = [CURRENT_SESSION, PAST_SESSION, NEXT_SESSION];

const stageOf = (n: number): string => (n <= 8 ? 'middle' : n <= 10 ? 'secondary' : 'senior_secondary');

export const GRADE_LEVELS: GradeLevel[] = Array.from({ length: 7 }, (_, i) => {
  const n = i + 6;
  return {
    id: seedId('grade', n),
    name: `Class ${n}`,
    code: `G${String(n).padStart(2, '0')}`,
    sequence: n,
    education_stage: stageOf(n),
    status: 'active' as const,
  };
});

export const HOUSES: SchoolHouse[] = ['Aravali', 'Nilgiri', 'Himalaya', 'Vindhya'].map((name) => ({
  id: seedId('house', name),
  name,
  code: name.slice(0, 3).toUpperCase(),
  status: 'active' as const,
}));

export const SUBJECT_GROUPS: SubjectGroup[] = [
  { id: seedId('subject-group', 'core'), name: 'Core academics', status: 'active' },
  { id: seedId('subject-group', 'languages'), name: 'Languages', status: 'active' },
  { id: seedId('subject-group', 'skills'), name: 'Skills and sports', status: 'active' },
];

const [CORE, LANGUAGES, SKILLS] = SUBJECT_GROUPS.map((g) => g.id) as [string, string, string];

const subject = (code: string, name: string, type: string, elective = false): Subject => ({
  id: seedId('subject', code),
  name,
  short_name: code,
  code,
  subject_type: type,
  is_elective: elective,
  status: 'active',
});

export const SUBJECTS: Subject[] = [
  subject('MATH', 'Mathematics', 'scholastic'),
  subject('SCI', 'Science', 'scholastic'),
  subject('PHY', 'Physics', 'scholastic'),
  subject('CHE', 'Chemistry', 'scholastic'),
  subject('BIO', 'Biology', 'scholastic', true),
  subject('ENG', 'English', 'language'),
  subject('HIN', 'Hindi', 'language'),
  subject('SST', 'Social Science', 'scholastic'),
  subject('CS', 'Computer Science', 'scholastic', true),
  subject('PE', 'Physical Education', 'co_scholastic', true),
];

export const subjectByCode = (code: string): Subject => {
  const found = SUBJECTS.find((s) => s.code === code);
  if (!found) throw new Error(`unknown subject ${code}`);
  return found;
};

export interface PlanEntry {
  code: string;
  periods: number;
  group: string;
}

const JUNIOR_PLAN: readonly PlanEntry[] = [
  { code: 'MATH', periods: 6, group: CORE },
  { code: 'SCI', periods: 6, group: CORE },
  { code: 'ENG', periods: 6, group: LANGUAGES },
  { code: 'HIN', periods: 5, group: LANGUAGES },
  { code: 'SST', periods: 5, group: CORE },
  { code: 'CS', periods: 3, group: SKILLS },
  { code: 'PE', periods: 2, group: SKILLS },
];

const SENIOR_PLAN: readonly PlanEntry[] = [
  { code: 'MATH', periods: 6, group: CORE },
  { code: 'PHY', periods: 6, group: CORE },
  { code: 'CHE', periods: 6, group: CORE },
  { code: 'BIO', periods: 6, group: CORE },
  { code: 'ENG', periods: 6, group: LANGUAGES },
  { code: 'CS', periods: 3, group: SKILLS },
];

export const planFor = (gradeSequence: number): readonly PlanEntry[] =>
  gradeSequence >= 11 ? SENIOR_PLAN : JUNIOR_PLAN;

export const GRADING_SCHEME: GradingScheme = {
  id: seedId('grading-scheme', 'cbse-9'),
  academic_session_id: CURRENT_SESSION.id,
  name: 'CBSE nine-point scale',
  code: 'CBSE9',
  kind: 'grade',
  maximum_marks: 100,
  pass_marks: 33,
  status: 'active',
  scale_json: [
    { label: 'A1', min_percent: 91, max_percent: 100, points: 10 },
    { label: 'A2', min_percent: 81, max_percent: 90, points: 9 },
    { label: 'B1', min_percent: 71, max_percent: 80, points: 8 },
    { label: 'B2', min_percent: 61, max_percent: 70, points: 7 },
    { label: 'C1', min_percent: 51, max_percent: 60, points: 6 },
    { label: 'C2', min_percent: 41, max_percent: 50, points: 5 },
    { label: 'D', min_percent: 33, max_percent: 40, points: 4 },
    { label: 'E', min_percent: 0, max_percent: 32, points: 0 },
  ],
};

export const GRADING_SCHEMES: GradingScheme[] = [GRADING_SCHEME];

const roomId = (grade: GradeLevel, letter: string): string => seedId('room', grade.code ?? '', letter);

// One row per class and section, in the order the cohort seats pupils.
const CLASS_SLOTS = SECTION_SLOTS.flatMap(({ grade, letter }) => {
  const level = GRADE_LEVELS[grade];
  const name = LETTERS[letter];
  return level && name ? [{ grade: level, letter: name }] : [];
});

const CLASSROOM_KIT = ['Projector', 'Smart Board'];

const SHARED_ROOMS: readonly Omit<Room, 'id' | 'branch_id' | 'code' | 'status'>[] = [
  { name: 'Physics Lab', room_type: 'laboratory', building: 'Science Block', floor: '1', capacity: 32, facilities: ['Lab Equipment', 'Projector'] },
  { name: 'Chemistry Lab', room_type: 'laboratory', building: 'Science Block', floor: '1', capacity: 32, facilities: ['Lab Equipment'] },
  { name: 'Biology Lab', room_type: 'laboratory', building: 'Science Block', floor: '2', capacity: 32, facilities: ['Lab Equipment'] },
  { name: 'Computer Lab', room_type: 'laboratory', building: 'Science Block', floor: '2', capacity: 40, facilities: ['Computers', 'Projector', 'Air Conditioning'] },
  { name: 'Library', room_type: 'library', building: 'Main Block', floor: 'Ground', capacity: 60, facilities: ['Computers', 'Air Conditioning'] },
  { name: 'Auditorium', room_type: 'hall', building: 'Activity Block', floor: 'Ground', capacity: 400, facilities: ['Projector', 'Audio System', 'Air Conditioning'] },
];

// Three rooms carry the states the room screens have to be able to draw.
const ROOM_QUIRKS: Readonly<Record<string, Partial<Room>>> = {
  // A class of 40 in a room that seats 32.
  R8B: { capacity: 32, notes: 'Partition wall added in 2025; seating reduced.' },
  CHEMIS: {
    status: 'maintenance',
    unavailable: { from: '2026-09-28', until: '2026-10-09', reason: 'Fume cupboard being replaced' },
  },
  R12C: { status: 'unavailable', unavailable: { from: '2026-10-01', until: null, reason: 'Used as the examination store' } },
};

const withQuirks = (room: Room): Room => ({ ...room, ...ROOM_QUIRKS[room.code ?? ''] });

export const ROOMS: Room[] = [
  ...CLASS_SLOTS.map(({ grade, letter }) => ({
    id: roomId(grade, letter),
    branch_id: BRANCH.id,
    name: `Room ${grade.sequence}${letter}`,
    code: `R${grade.sequence}${letter}`,
    room_type: 'classroom',
    building: (grade.sequence ?? 6) >= 11 ? 'Senior Block' : 'Main Block',
    floor: String((((grade.sequence ?? 6) - 6) % 3) + 1),
    capacity: 40,
    status: 'active',
    facilities: CLASSROOM_KIT,
  })),
  ...SHARED_ROOMS.map((room) => ({
    ...room,
    id: seedId('room', room.name ?? ''),
    branch_id: BRANCH.id,
    code: (room.name ?? '').replace(/\s+/g, '').slice(0, 6).toUpperCase(),
    status: 'active',
  })),
].map(withQuirks);

export const LAB_ROOM_BY_SUBJECT: Readonly<Record<string, string>> = {
  PHY: seedId('room', 'Physics Lab'),
  CHE: seedId('room', 'Chemistry Lab'),
  BIO: seedId('room', 'Biology Lab'),
  CS: seedId('room', 'Computer Lab'),
};

const ref = (row: { id: string; name?: string; code?: string }) => ({ id: row.id, name: row.name, code: row.code });

// Two classes still wait on a room and two on a class teacher: the gaps a real year carries in October.
const NO_ROOM: ReadonlySet<string> = new Set(['G11F', 'G12E']);
const NO_CLASS_TEACHER: ReadonlySet<string> = new Set(['G08C', 'G10G']);

// Next year is half prepared: classes 6 to 9 have their sections, the rest do not yet.
const sessionSlots = (session: AcademicSession) =>
  session.id === NEXT_SESSION.id ? CLASS_SLOTS.filter(({ grade }) => (grade.sequence ?? 6) <= 9) : CLASS_SLOTS;

// The same label in two years is two records: 2025 to 2026 Class 6 A is not 2026 to 2027 Class 6 A.
export const SECTIONS: SectionRow[] = SESSIONS.flatMap((session) =>
  sessionSlots(session).map(({ grade, letter }, index) => {
    const code = `${grade.code}${letter}`;
    const settled = session.id !== NEXT_SESSION.id;
    return {
      id: seedId('section', session.code ?? '', grade.code ?? '', letter),
      academic_session_id: session.id,
      branch_id: BRANCH.id,
      grade_level_id: grade.id,
      name: letter,
      code,
      capacity: 40,
      room_id: settled && !(session.id === CURRENT_SESSION.id && NO_ROOM.has(code)) ? roomId(grade, letter) : undefined,
      class_teacher_id:
        settled && !(session.id === CURRENT_SESSION.id && NO_CLASS_TEACHER.has(code)) ? TEACHERS[index % TEACHERS.length]?.id : undefined,
      status: 'active',
      edges: { grade_level: ref(grade), branch: ref(BRANCH), academic_session: ref(session) },
    };
  }),
);

export const CURRENT_SECTIONS: SectionRow[] = SECTIONS.filter(
  (s) => s.academic_session_id === CURRENT_SESSION.id,
);

const gradeOf = (section: SectionRow): GradeLevel => {
  const grade = GRADE_LEVELS.find((g) => g.id === section.grade_level_id);
  if (!grade) throw new Error(`section ${section.id} has no grade`);
  return grade;
};

export const gradeSequenceOf = (section: SectionRow): number => gradeOf(section).sequence ?? 6;

// Subjects are offered only in a year that has run or is running; next year has classes and nothing taught in them yet.
export const OFFERINGS: SchoolOfferingRow[] = SECTIONS.filter((s) => s.academic_session_id !== NEXT_SESSION.id).flatMap((section) => {
  const { edges: _edges, ...bare } = section;
  return planFor(gradeSequenceOf(section)).map((entry) => {
    const subj = subjectByCode(entry.code);
    return {
      id: seedId('offering', section.id, entry.code),
      academic_session_id: section.academic_session_id,
      section_id: section.id,
      subject_id: subj.id,
      subject_group_id: entry.group,
      periods_per_week: entry.periods,
      minutes_per_week: entry.periods * 40,
      maximum_marks: 100,
      pass_marks: 33,
      grading_scheme_id: GRADING_SCHEME.id,
      // PE is not examined; classes up to 8 sit the shorter scheme. The ids match `data/exams.ts`.
      result_scheme_id: entry.code === 'PE' ? undefined : seedId('result-scheme', gradeSequenceOf(section) <= 8 ? 'half' : 'full'),
      status: 'active',
      edges: { subject: ref(subj), section: bare },
    };
  });
});
