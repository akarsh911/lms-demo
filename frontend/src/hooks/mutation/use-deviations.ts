'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { sectionCalendarService } from '@/services/section-calendar';
import type {
  DeviationCreate,
  DeviationPatch,
  TimetableDeviationRow,
} from '@/types/section-calendar';

function useDeviationWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.classroom.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.person.all });
    },
  });
}

export function useCreateDeviation() {
  return useDeviationWrite<TimetableDeviationRow, DeviationCreate>((body) =>
    sectionCalendarService.createDeviation(body),
  );
}

export function useUpdateDeviation() {
  return useDeviationWrite<TimetableDeviationRow, { id: string; patch: DeviationPatch }>(
    ({ id, patch }) => sectionCalendarService.updateDeviation(id, patch),
  );
}

export function useDeleteDeviation() {
  return useDeviationWrite<void, string>((id) =>
    sectionCalendarService.deleteDeviation(id),
  );
}
