import { config } from '@/config';
import { SUBJECT_ENROLLMENTS } from '@/fixtures/data/classroom';
import { ENROLLMENTS } from '@/fixtures/data/enrollment';
import { CURRENT_SESSION, OFFERINGS, SECTIONS } from '@/fixtures/data/structure';
import { TEACHER_ASSIGNMENTS } from '@/fixtures/data/timetable';

import { coreApi } from './api';
import { devGet, devList } from './dev-bypass';
import type {
  AcademicPage,
  EnrollmentRow,
  SectionRow,
  SubjectOfferingRow,
  TeacherAssignmentRow,
} from '@/types/academic';
import type { SubjectEnrollmentRow } from '@/types/people-detail';
import type { PageInfo } from '@/types/roster';

/**
 * Sections, what is taught in them, and who is enrolled.
 *
 * Transport only, and like `roster.ts` it does exactly one thing beyond naming
 * a URL: lifts the per-endpoint array key into `rows`.
 *
 * NOTHING HERE SENDS `all_sessions`. Each of these three defaults to the
 * session flagged `is_current` and mixes nothing else in. Asking for every
 * session would put two years of Class 10 in one list with no column saying
 * which, and the endpoints offer no way to sort that out afterwards. The
 * screens name the current session instead.
 */
interface AcademicEnvelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

interface ListQuery {
  limit: number;
  offset: number;
  /** Parameters the route parses, by their own names. */
  filters?: Record<string, string | undefined>;
}

async function list<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<AcademicPage<T>> {
  const body = await coreApi.get<AcademicEnvelope>(
    path,
    { limit: query.limit, offset: query.offset, ...(query.filters ?? {}) },
    signal,
  );
  const rows = body[key];
  return {
    rows: Array.isArray(rows) ? (rows as T[]) : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit: query.limit, offset: query.offset, has_more: false },
  };
}

// What the fixture list is asked for: this year's rows only, which is what these endpoints default to.
const thisYear = (query: ListQuery) => ({
  academic_session_id: CURRENT_SESSION.id,
  limit: query.limit,
  offset: query.offset,
  ...query.filters,
});

export const academicService = {
  listSections: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(SECTIONS, thisYear(query))
      : list<SectionRow>('sections', 'sections', query, signal),

  getSection: (id: string, signal?: AbortSignal) =>
    config.devBypass ? devGet(SECTIONS, id) : coreApi.get<SectionRow>(`sections/${id}`, undefined, signal),

  getOffering: (id: string, signal?: AbortSignal) =>
    config.devBypass
      ? devGet<SubjectOfferingRow>(OFFERINGS, id)
      : coreApi.get<SubjectOfferingRow>(`subject-offerings/${id}`, undefined, signal),

  listTeacherAssignments: (sectionId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(TEACHER_ASSIGNMENTS, { ...thisYear(query), section_id: sectionId })
      : list<TeacherAssignmentRow>(
          'teacher-assignments',
          'teacher_assignments',
          { ...query, filters: { ...query.filters, section_id: sectionId } },
          signal,
        ),

  /** What is taught in a section. `section_id` is a filter the route parses. */
  listOfferings: (sectionId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList<SubjectOfferingRow>(OFFERINGS, { ...thisYear(query), section_id: sectionId })
      : list<SubjectOfferingRow>(
          'subject-offerings',
          'subject_offerings',
          { ...query, filters: { ...query.filters, section_id: sectionId } },
          signal,
        ),

  /**
   * Who is enrolled in a section.
   *
   * The rows carry `edges.student` but NOT that student's person:
   * `enrollment.Basic()` is `WithSection().WithStudent()` and nothing loads the
   * person below it. So this endpoint supplies roll numbers and enrollment
   * state and cannot supply names; the class roll gets those from
   * `/students?section_id=`, which does carry the person edge, in one request
   * rather than one per student.
   */
  listEnrollments: (sectionId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(ENROLLMENTS, { ...thisYear(query), section_id: sectionId })
      : list<EnrollmentRow>(
          'enrollments',
          'enrollments',
          { ...query, filters: { ...query.filters, section_id: sectionId } },
          signal,
        ),

  listOfferingEnrollments: (offeringId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(SUBJECT_ENROLLMENTS, { ...thisYear(query), subject_offering_id: offeringId, status: 'active' })
      : list<SubjectEnrollmentRow>(
          'subject-enrollments',
          'subject_enrollments',
          {
            ...query,
            filters: {
              ...query.filters,
              subject_offering_id: offeringId,
              status: 'active',
            },
          },
          signal,
        ),
};
