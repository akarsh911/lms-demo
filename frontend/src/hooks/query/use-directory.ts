import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { directoryService } from '@/services/directory';
import type { TeacherEntry } from '@/types/directory';

export function useTeacherDirectory(yearId: string | undefined) {
  return useQuery<TeacherEntry[], ApiError>({
    queryKey: queryKeys.directory.teachers(yearId ?? ''),
    queryFn: () => directoryService.listTeachers(yearId ?? ''),
    enabled: Boolean(yearId),
  });
}

