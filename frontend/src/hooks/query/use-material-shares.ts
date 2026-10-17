'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { materialShareService } from '@/services/material-shares';
import type { MaterialShare, MaterialShareWrite } from '@/types/material-share';

export const useMaterialShares = (offeringId: string) => useQuery<MaterialShare[], ApiError>({ queryKey: queryKeys.materialShares.offering(offeringId), queryFn: () => materialShareService.list(offeringId) });

export function useShareMaterial(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation<MaterialShare, ApiError, MaterialShareWrite>({ mutationFn: materialShareService.share, onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.materialShares.offering(offeringId) }) });
}

export function useRemoveShare(offeringId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({ mutationFn: materialShareService.remove, onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.materialShares.offering(offeringId) }) });
}
