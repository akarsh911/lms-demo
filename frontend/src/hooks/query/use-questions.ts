'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { withoutAnswerKey } from '@/lib/papers/answer-key';
import { questionService } from '@/services/questions';
import type { ApiError } from '@/services/api';
import type { QuestionRow, QuestionVersionRow } from '@/types/questions';
import type { SchoolPage } from '@/types/school';

export interface QuestionFilter {
  subjectId?: string;
  gradeLevelId?: string;
  search: string;
}

export function useQuestionBank(filter: QuestionFilter) {
  return useQuery<SchoolPage<QuestionRow>, ApiError>({
    queryKey: queryKeys.questions.list(
      `${filter.subjectId ?? ''}|${filter.gradeLevelId ?? ''}`,
    ),
    queryFn: ({ signal }) =>
      questionService.listQuestions(
        {
          ...(filter.subjectId ? { subject_id: filter.subjectId } : {}),
          ...(filter.gradeLevelId ? { grade_level_id: filter.gradeLevelId } : {}),
        },
        signal,
      ),
  });
}

export function useQuestionVersions(questionId: string | null) {
  return useQuery<QuestionVersionRow[], ApiError>({
    queryKey: queryKeys.questions.versions(questionId ?? ''),
    queryFn: async ({ signal }) => {
      const page = await questionService.listVersions(questionId!, signal);
      return page.rows.map(withoutAnswerKey);
    },
    enabled: Boolean(questionId),
  });
}
