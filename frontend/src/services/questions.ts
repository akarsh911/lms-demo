import { config } from '@/config';
import { QUESTIONS, QUESTION_VERSIONS } from '@/fixtures/data/papers';

import { coreApi } from './api';
import { devList } from './dev-bypass';
import { MAX_PAGE, type ListQuery } from './school';
import type { PageInfo } from '@/types/roster';
import type { SchoolPage } from '@/types/school';
import type { QuestionRow, QuestionVersionRow } from '@/types/questions';

interface ListEnvelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

async function list<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<SchoolPage<T>> {
  const body = await coreApi.get<ListEnvelope>(
    path,
    { limit: MAX_PAGE, offset: 0, ...query },
    signal,
  );
  const rows = body[key];
  return {
    rows: Array.isArray(rows) ? (rows as T[]) : [],
    count: typeof body.count === 'number' ? body.count : 0,
    page: body.page ?? { limit: MAX_PAGE, offset: 0, has_more: false },
  };
}

export const questionService = {
  listQuestions: (query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList(QUESTIONS, { limit: MAX_PAGE, ...query })
      : list<QuestionRow>('questions', 'questions', query, signal),

  listVersions: (questionId: string, signal?: AbortSignal) =>
    config.devBypass
      ? devList<QuestionVersionRow>(QUESTION_VERSIONS, { limit: MAX_PAGE, question_id: questionId })
      : list<QuestionVersionRow>(
          `questions/${questionId}/versions`,
          'question_versions',
          {},
          signal,
        ),
};
