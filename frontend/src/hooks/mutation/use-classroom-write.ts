'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { classroomService } from '@/services/classroom';
import type {
  AssignmentCreated,
  AssignmentItemWrite,
  AssignmentWrite,
  StreamCommentRow,
  StreamCommentWrite,
  StreamPostCreated,
  StreamPostWrite,
} from '@/types/classroom';

export function useCreateStreamPost() {
  const queryClient = useQueryClient();
  return useMutation<StreamPostCreated, ApiError, StreamPostWrite>({
    mutationFn: (body) => classroomService.createStreamPost(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.classroom.all });
    },
  });
}

export function useCreateStreamComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation<StreamCommentRow, ApiError, StreamCommentWrite>({
    mutationFn: (body) => classroomService.createStreamComment(postId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.classroom.comments(postId),
      });
    },
  });
}

export interface AssignmentDraft {
  assignment: AssignmentWrite;
  items: AssignmentItemWrite[];
}

export interface AssignmentResult {
  created: AssignmentCreated;
  itemsRefused: number;
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation<AssignmentResult, ApiError, AssignmentDraft>({
    mutationFn: async ({ assignment, items }) => {
      const created = await classroomService.createAssignment(assignment);
      let itemsRefused = 0;
      for (const item of items) {
        try {
          await classroomService.createAssignmentItem(created.assignment.id, item);
        } catch {
          itemsRefused += 1;
        }
      }
      return { created, itemsRefused };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.classroom.all });
    },
  });
}
