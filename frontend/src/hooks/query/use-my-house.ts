'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { houseService } from '@/services/houses';
import type { HouseAward, MyHouse } from '@/types/house';

export const useMyHouse = () => useQuery<MyHouse, ApiError>({ queryKey: queryKeys.house.mine(), queryFn: houseService.mine });

export function useHouseWrite() {
  const queryClient = useQueryClient();
  return useMutation<MyHouse, ApiError, { award: HouseAward } | { office: 'captain' | 'vice'; studentId: string }>({
    mutationFn: (v) => ('award' in v ? houseService.award(v.award) : houseService.captain(v.office, v.studentId)),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.house.mine(), data),
  });
}
