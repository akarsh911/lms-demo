'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ROSTER_PAGE_SIZE } from '@/constants/roster';
import type { ApiError } from '@/services/api';
import { academicService } from '@/services/academic';
import type { AcademicPage, SectionRow } from '@/types/academic';

/**
 * The sections of the CURRENT academic session.
 *
 * Current is the endpoint default, not a filter sent from here, and nothing
 * asks for `all_sessions`. See `services/academic.ts` for why.
 */
export function useSections(offset: number) {
  return useQuery<AcademicPage<SectionRow>, ApiError>({
    queryKey: queryKeys.academic.sections(offset),
    queryFn: ({ signal }) =>
      academicService.listSections({ limit: ROSTER_PAGE_SIZE, offset }, signal),
    placeholderData: keepPreviousData,
  });
}

const EVERY_SECTION_LIMIT = 200;

export function useEverySection(enabled: boolean) {
  return useQuery<AcademicPage<SectionRow>, ApiError>({
    queryKey: queryKeys.academic.everySection(),
    queryFn: ({ signal }) => academicService.listSections({ limit: EVERY_SECTION_LIMIT, offset: 0 }, signal),
    enabled,
  });
}
