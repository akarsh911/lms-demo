'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { playgroundService } from '@/services/playground';
import type { PlaygroundManifest } from '@/types/playground';

export function usePlaygroundManifest() {
  return useQuery<PlaygroundManifest>({
    queryKey: queryKeys.playground.manifest(),
    queryFn: ({ signal }) => playgroundService.manifest(signal),
    staleTime: Infinity,
  });
}
