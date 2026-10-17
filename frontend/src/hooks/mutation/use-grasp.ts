import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { graspService } from '@/services/grasp';
import type { GraspCheck, GraspCheckSettings, PaperReading } from '@/types/grasp';

function useGraspWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({ mutationFn, onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.grasp.all }) });
}

export const useCreateGraspCheck = () => {
  const queryClient = useQueryClient();
  return useMutation<GraspCheck, ApiError, GraspCheckSettings>({
    mutationFn: graspService.create,
    // Seeded into the cache so the dashboard and its QR open even if the next request lands on another server.
    onSuccess: (check) => queryClient.setQueryData(queryKeys.grasp.detail(check.id), check),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.grasp.list() }),
  });
};

export const useSetGraspStatus = (id: string) => useGraspWrite<GraspCheck, 'live' | 'closed'>((status) => graspService.setStatus(id, status));

export const useResetGraspDemo = () => useGraspWrite<{ ok: true }, void>(() => graspService.reset());

export const useReadPaper = () => useMutation<PaperReading, ApiError, File>({ mutationFn: graspService.readPaper });
