'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ROSTER_PAGE_SIZE } from '@/constants/roster';
import type { ApiError } from '@/services/api';
import { academicService } from '@/services/academic';
import { rosterService } from '@/services/roster';
import type { AcademicPage, EnrollmentRow, SubjectOfferingRow } from '@/types/academic';
import type { RosterPage, StudentRow } from '@/types/roster';

/**
 * What is taught in one section.
 *
 * Offerings are not paged in the UI: a section teaches a dozen subjects, not a
 * thousand, so one page of the list is the list. `has_more` is still read and
 * surfaced rather than ignored, because "not paged" is a judgement about this
 * data and not a promise the endpoint made.
 */
export function useSectionOfferings(sectionId: string | null) {
  return useQuery<AcademicPage<SubjectOfferingRow>, ApiError>({
    queryKey: queryKeys.academic.offerings(sectionId ?? ''),
    queryFn: ({ signal }) =>
      academicService.listOfferings(sectionId!, { limit: ROSTER_PAGE_SIZE, offset: 0 }, signal),
    enabled: Boolean(sectionId),
  });
}

/**
 * The class roll: students of a section, with their enrollment records.
 *
 * TWO requests, joined here, because neither endpoint answers the question on
 * its own:
 *
 *   `/students?section_id=` carries the person edge, so it has names, and
 *   carries no roll number.
 *   `/enrollments?section_id=` carries the roll number and the enrollment
 *   state, and its `edges.student` has no person below it, so it has no names.
 *
 * The alternative to joining is one `/persons/{id}` per row, which is a request
 * per student on every class. The join is by `student_id` and is decoration
 * only: a student whose enrollment is out of the caller reach still appears,
 * without a roll number, rather than being dropped from the roll.
 */
export function useSectionRoll(sectionId: string | null, offset: number) {
  const students = useQuery<RosterPage<StudentRow>, ApiError>({
    queryKey: [...queryKeys.academic.all, 'roll', sectionId ?? '', offset] as const,
    queryFn: ({ signal }) =>
      rosterService.list<StudentRow>(
        'students',
        { limit: ROSTER_PAGE_SIZE, offset, filters: { section_id: sectionId! } },
        signal,
      ),
    enabled: Boolean(sectionId),
  });

  const enrollments = useQuery<AcademicPage<EnrollmentRow>, ApiError>({
    queryKey: queryKeys.academic.enrollments(sectionId ?? '', offset),
    queryFn: ({ signal }) =>
      academicService.listEnrollments(
        sectionId!,
        { limit: ROSTER_PAGE_SIZE, offset },
        signal,
      ),
    enabled: Boolean(sectionId),
  });

  return { students, enrollments };
}
