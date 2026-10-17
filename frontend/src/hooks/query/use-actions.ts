import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { actionsService } from '@/services/actions';
import type { ActionDetail, ActionItem, ActionOwner, ActionSummary } from '@/types/actions';

export const useActions = () => useQuery<ActionItem[], ApiError>({ queryKey: queryKeys.actions.list(), queryFn: actionsService.list });

export const useActionSummary = () => useQuery<ActionSummary, ApiError>({ queryKey: queryKeys.actions.summary(), queryFn: actionsService.summary });

export const useAction = (id: string | null) =>
  useQuery<ActionDetail, ApiError>({ queryKey: queryKeys.actions.detail(id ?? ''), queryFn: () => actionsService.detail(id ?? ''), enabled: Boolean(id) });

export const useActionOwners = (enabled: boolean) => useQuery<ActionOwner[], ApiError>({ queryKey: queryKeys.actions.owners(), queryFn: actionsService.owners, enabled, staleTime: 300_000 });
