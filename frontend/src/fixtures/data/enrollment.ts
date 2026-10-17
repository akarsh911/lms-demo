import type { EnrollmentRow } from '@/types/academic';
import type { EnrollmentDocument, NextYearDisposition, YearEntry } from '@/types/foundation';

import { seedId } from '../ids';
import {
  ACTIVE,
  ENROLLED,
  LETTERS,
  SECTION_SLOTS,
  STUDENT_COUNT,
  dispositionOf,
  entryOf,
  placementOf,
  sectionSize,
  type Placement,
} from './cohort';
import { STUDENTS } from './people';
import { CURRENT_SESSION, GRADE_LEVELS, PAST_SESSION, SECTIONS } from './structure';

// One enrolment is one pupil's place in one year. The columns emerge-core has, plus what it does not record yet:
// how they came in, why they left, which papers are owed, and what is planned for next year.
export interface EnrollmentRecord extends EnrollmentRow {
  grade_level_id: string;
  entry: YearEntry;
  leaving_reason?: string;
  destination?: string;
  documents?: EnrollmentDocument[];
  next_year?: NextYearDisposition;
  // Moves between sections during the year, oldest first. The section_id above is where the pupil is now.
  history?: { date: string; from_section_id: string; to_section_id: string; reason: string }[];
}

const sectionsOf = (sessionId: string) => SECTIONS.filter((s) => s.academic_session_id === sessionId);
const CURRENT = sectionsOf(CURRENT_SESSION.id);
const PAST = sectionsOf(PAST_SESSION.id);

const two = (n: number): string => String(n).padStart(2, '0');

const REASONS = ['Family relocated', 'Moved to another school', 'Moved abroad', 'Medical reasons'] as const;
const DESTINATIONS = ['Kendriya Vidyalaya, Pune', 'St. Xavier’s, Mumbai', undefined, 'Bhavan’s, Hyderabad'] as const;

// Leaving and the paperwork are separate facts: the first three leavers are gone, with a certificate still owed.
function papers(leaver: number, settled: boolean): EnrollmentDocument[] {
  const owed = !settled && leaver < 3;
  return [
    { key: 'transfer_certificate', label: 'Transfer certificate', state: owed ? 'pending' : 'issued' },
    { key: 'character_certificate', label: 'Character certificate', state: leaver % 4 === 3 ? 'not_required' : owed && leaver === 1 ? 'pending' : 'issued' },
  ];
}

function thisYear(student: number, placement: Placement): EnrollmentRecord {
  const row = STUDENTS[student];
  const section = placement.slot === undefined ? undefined : CURRENT[placement.slot];
  const entry = entryOf(student, placement);
  const left = placement.standing === 'withdrawn';
  const leaver = student - ACTIVE;
  // A new admission arrives when it arrives; everyone else starts on the first day of the year.
  const joined = entry === 'new_admission' && student % 3 !== 0 ? `2026-${two(5 + (student % 5))}-${two((student * 7) % 27 + 1)}` : '2026-04-01';

  return {
    id: seedId('enrollment', row?.id ?? student),
    student_id: row?.id,
    academic_session_id: CURRENT_SESSION.id,
    section_id: section?.id,
    grade_level_id: GRADE_LEVELS[placement.grade]?.id ?? '',
    roll_number: placement.roll === undefined ? undefined : two(placement.roll),
    enrollment_number: `EN${2600 + student}`,
    enrollment_date: joined,
    status: left ? 'withdrawn' : 'active',
    entry: left ? 'promoted' : entry,
    edges: { student: { id: row?.id ?? '', admission_number: row?.admission_number } },
    ...(left
      ? {
          exit_date: `2026-${two(5 + (leaver % 5))}-${two((leaver * 5) % 27 + 1)}`,
          leaving_reason: REASONS[leaver % REASONS.length],
          destination: DESTINATIONS[leaver % DESTINATIONS.length],
          documents: papers(leaver, false),
        }
      : { next_year: dispositionOf(student, placement) }),
  };
}

// Last year, as it ended. Promotion made a NEW row this year; it never rewrote this one.
function lastYear(student: number, placement: Placement): EnrollmentRecord[] {
  const row = STUDENTS[student];
  const entry = entryOf(student, placement);
  const leaver = placement.standing === 'graduated' || placement.standing === 'withdrew_last_year';
  // Not here last year: a new admission, or a pupil in the campus's entry class.
  if (!leaver && (entry === 'new_admission' || (placement.grade === 0 && entry !== 'retained'))) return [];

  const slot = SECTION_SLOTS[placement.slot ?? 0];
  // A promoted pupil sat one class lower, in the section of the same letter.
  const grade = leaver || entry === 'retained' ? placement.grade : placement.grade - 1;
  const section = PAST.find((s) => s.grade_level_id === GRADE_LEVELS[grade]?.id && s.name === LETTERS[slot?.letter ?? 0]);
  const withdrew = placement.standing === 'withdrew_last_year';
  const index = student - ENROLLED;

  return [
    {
      id: seedId('enrollment', PAST_SESSION.code ?? '', row?.id ?? student),
      student_id: row?.id,
      academic_session_id: PAST_SESSION.id,
      section_id: section?.id,
      grade_level_id: GRADE_LEVELS[grade]?.id ?? '',
      roll_number: two(((student * 13) % 38) + 1),
      enrollment_number: `EN${2500 + student}`,
      enrollment_date: '2025-04-01',
      status: withdrew ? 'withdrawn' : 'completed',
      // A graduate completed the final class; the backend has no promotion word for that, so none is set.
      promotion_status: withdrew || placement.standing === 'graduated' ? undefined : entry === 'retained' ? 'retained' : 'promoted',
      entry: 'continuing',
      edges: { student: { id: row?.id ?? '', admission_number: row?.admission_number } },
      ...(withdrew
        ? {
            exit_date: `2025-${two(6 + (index % 6))}-${two((index * 5) % 27 + 1)}`,
            leaving_reason: REASONS[index % REASONS.length],
            documents: papers(index, true),
          }
        : {}),
    },
  ];
}

const PLACEMENTS = Array.from({ length: STUDENT_COUNT }, (_, student) => placementOf(student));

// This year's enrolments: the one collection every student view filters. New admissions insert here.
export const ENROLLMENTS: EnrollmentRecord[] = PLACEMENTS.slice(0, ENROLLED).map((placement, student) => thisYear(student, placement));

export const PAST_ENROLLMENTS: EnrollmentRecord[] = PLACEMENTS.flatMap((placement, student) => lastYear(student, placement));

// Pupils in a class today: what attendance, marks and subject lists are generated for.
export const SEATED: readonly EnrollmentRecord[] = ENROLLMENTS.filter((e) => e.status === 'active' && e.section_id);

export const STUDENTS_PER_SECTION = sectionSize(0);

// Next year's enrolments, made when a draft year's placement is applied.
export const NEXT_ENROLLMENTS: EnrollmentRecord[] = [];

// Two facts a real October carries: a pupil moved between sections in August, and late joiners in 7D with no roll number yet.
(() => {
  const seven = CURRENT.filter((s) => s.code?.startsWith('G07'));
  const [a, b] = [seven.find((s) => s.name === 'A'), seven.find((s) => s.name === 'B')];
  const moved = ENROLLMENTS.find((e) => e.section_id === b?.id && e.status === 'active');
  if (moved && a && b) moved.history = [{ date: '2026-08-03', from_section_id: a.id, to_section_id: b.id, reason: 'Moved to balance 7A and 7B' }];
  const d = seven.find((s) => s.name === 'D');
  ENROLLMENTS.filter((e) => e.section_id === d?.id && e.status === 'active').slice(-4).forEach((e) => {
    e.roll_number = undefined;
  });
})();
