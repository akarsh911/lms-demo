'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { ApiError } from '@/services/api';
import { teachingService } from '@/services/teaching';
import type { ExtraClass, ExtraClassWrite } from '@/types/extra-class';

function useWeekWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({ mutationFn, onSettled: () => void queryClient.invalidateQueries({ queryKey: ['teaching'] }) });
}

export const useScheduleExtra = () => useWeekWrite<ExtraClass, ExtraClassWrite>((body) => teachingService.scheduleExtra(body));
export const useCancelExtra = () => useWeekWrite<void, string>((id) => teachingService.cancelExtra(id));
