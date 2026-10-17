'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { schoolService } from '@/services/school';
import type { GenerationJob, GenerationRequest } from '@/types/timetable-generation';

export function useGenerateTimetable(timetableId: string | null) {
  const queryClient = useQueryClient();

  return useMutation<GenerationJob, ApiError, GenerationRequest>({
    mutationFn: (body) => {
      if (!timetableId) {
        throw new ApiError(0, 'no_timetable', 'Choose a draft timetable to fill in first.');
      }
      return schoolService.generateTimetable(timetableId, body);
    },
    onSuccess: (job) => {
      queryClient.setQueryData(
        queryKeys.school.generation(job.timetable_id, job.id),
        job,
      );
    },
  });
}
