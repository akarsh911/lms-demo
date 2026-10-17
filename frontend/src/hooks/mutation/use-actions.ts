import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { actionsService } from '@/services/actions';
import type { ActionDetail } from '@/types/actions';

function useActionWrite<TVars>(mutationFn: (vars: TVars) => Promise<ActionDetail>) {
  const queryClient = useQueryClient();
  return useMutation<ActionDetail, ApiError, TVars>({ mutationFn, onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.actions.all }) });
}

export const useAssignAction = (id: string) => useActionWrite<string | null>((ownerId) => actionsService.assign(id, ownerId));
export const useSnoozeAction = (id: string) => useActionWrite<string>((until) => actionsService.snooze(id, until));
export const useResolveAction = (id: string) => useActionWrite<string>((note) => actionsService.resolve(id, note));
export const useReopenAction = (id: string) => useActionWrite<void>(() => actionsService.reopen(id));
export const useNoteAction = (id: string) => useActionWrite<string>((text) => actionsService.note(id, text));
export const useQuickAction = (id: string) => useActionWrite<void>(() => actionsService.quick(id));
