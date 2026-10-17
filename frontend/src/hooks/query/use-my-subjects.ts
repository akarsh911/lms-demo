'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { teachingService } from '@/services/teaching';
import type { MySubject } from '@/types/teaching';

export function useMySubjects() {
  return useQuery<MySubject[], ApiError>({
    queryKey: queryKeys.teaching.mine(),
    queryFn: () => teachingService.mySubjects(),
  });
}
