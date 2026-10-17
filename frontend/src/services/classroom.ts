import { config } from '@/config';
import * as fixtures from '@/fixtures/classroom';
import { ASSIGNMENTS, ASSIGNMENT_ITEMS, STREAM_COMMENTS, SUBMISSIONS } from '@/fixtures/data/classroom';

import { coreApi } from './api';
import { dev, devCreate, devList } from './dev-bypass';
import type {
  AssignmentCreated,
  AssignmentItemRow,
  AssignmentItemWrite,
  AssignmentRow,
  AssignmentSubmissionRow,
  AssignmentWrite,
  ClassroomPage,
  OccurrenceWindow,
  StreamCommentRow,
  StreamCommentWrite,
  StreamPostCreated,
  StreamPostRow,
  StreamPostWrite,
} from '@/types/classroom';
import type { PageInfo } from '@/types/roster';

interface Envelope {
  count?: number;
  page?: PageInfo;
  [key: string]: unknown;
}

interface ListQuery {
  limit: number;
  offset: number;
  filters?: Record<string, string | undefined>;
}

async function list<T>(
  path: string,
  key: string,
  query: ListQuery,
  signal?: AbortSignal,
): Promise<ClassroomPage<T>> {
  const body = await coreApi.get<Envelope>(
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

const paging = (query: ListQuery) => ({ limit: query.limit, offset: query.offset, ...query.filters });

export const classroomService = {
  resolveOccurrences: (
    branchId: string,
    sectionId: string,
    from: string,
    to: string,
    signal?: AbortSignal,
  ) =>
    config.devBypass
      ? dev(() => fixtures.occurrences({ branch_id: branchId, section_id: sectionId, from, to }))
      : coreApi.get<OccurrenceWindow>(
          'timetable-occurrences',
          { branch_id: branchId, section_id: sectionId, from, to },
          signal,
        ),

  listStreamPosts: (
    targetIds: readonly string[],
    query: ListQuery,
    liveOnly: boolean,
    signal?: AbortSignal,
  ) =>
    config.devBypass
      ? dev(() => fixtures.streamPosts({ ...paging(query), target_id: targetIds.join(','), live: liveOnly }))
      : list<StreamPostRow>(
          'stream-posts',
          'stream_posts',
          {
            ...query,
            filters: {
              ...query.filters,
              target_id: targetIds.join(','),
              live: liveOnly ? 'true' : undefined,
            },
          },
          signal,
        ),

  createStreamPost: (body: StreamPostWrite) =>
    config.devBypass
      ? dev(() => fixtures.createStreamPost(body))
      : coreApi.post<StreamPostCreated>('stream-posts', body),

  createStreamComment: (postId: string, body: StreamCommentWrite) =>
    config.devBypass
      ? devCreate<StreamCommentRow>(STREAM_COMMENTS, { ...body, post_id: postId })
      : coreApi.post<StreamCommentRow>(`stream-posts/${postId}/comments`, body),

  createAssignment: (body: AssignmentWrite) =>
    config.devBypass
      ? dev(() => fixtures.createAssignment(body))
      : coreApi.post<AssignmentCreated>('assignments', body),

  createAssignmentItem: (assignmentId: string, body: AssignmentItemWrite) =>
    config.devBypass
      ? devCreate<AssignmentItemRow>(ASSIGNMENT_ITEMS, { ...body, assignment_id: assignmentId })
      : coreApi.post<AssignmentItemRow>(`assignments/${assignmentId}/items`, body),

  listStreamComments: (postId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList<StreamCommentRow>(STREAM_COMMENTS, { ...paging(query), post_id: postId })
      : list<StreamCommentRow>(
          `stream-posts/${postId}/comments`,
          'stream_comments',
          query,
          signal,
        ),

  listAssignments: (offeringId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList<AssignmentRow>(ASSIGNMENTS, { ...paging(query), subject_offering_id: offeringId })
      : list<AssignmentRow>(
          'assignments',
          'assignments',
          { ...query, filters: { ...query.filters, subject_offering_id: offeringId } },
          signal,
        ),

  listAssignmentItems: (assignmentId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList<AssignmentItemRow>(ASSIGNMENT_ITEMS, { ...paging(query), assignment_id: assignmentId })
      : list<AssignmentItemRow>(
          `assignments/${assignmentId}/items`,
          'assignment_items',
          query,
          signal,
        ),

  listSubmissions: (assignmentId: string, query: ListQuery, signal?: AbortSignal) =>
    config.devBypass
      ? devList<AssignmentSubmissionRow>(SUBMISSIONS, { ...paging(query), assignment_id: assignmentId })
      : list<AssignmentSubmissionRow>(
          `assignments/${assignmentId}/submissions`,
          'assignment_submissions',
          query,
          signal,
        ),
};
