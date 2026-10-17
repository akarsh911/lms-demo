'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { debateService, type DebateStatus } from '@/services/debate';
import type { DebateCatalog, DebatePhase, DebateReportEnvelope, DebateSession } from '@/types/debate';

const LIVE_POLL_MS = 4000;
const ENDING_POLL_MS = 1500;

function sessionPoll(phase: DebatePhase | undefined): number | false {
  switch (phase) {
    case 'student_turn':
    case 'processing':
    case 'ai_turn':
      return LIVE_POLL_MS;
    case 'finalizing':
    case 'evaluating':
      return ENDING_POLL_MS;
    case undefined:
    case 'ready':
    case 'host_intro':
    case 'report_ready':
    case 'report_failed':
    case 'cancelled':
      return false;
    default: {
      const unhandled: never = phase;
      return unhandled;
    }
  }
}

export function useDebateStatus() {
  return useQuery<DebateStatus>({
    queryKey: queryKeys.debate.status(),
    queryFn: ({ signal }) => debateService.status(signal),
    staleTime: 30_000,
    retry: false,
  });
}

export function useDebateCatalog(scripted: boolean | undefined) {
  return useQuery<DebateCatalog>({
    queryKey: queryKeys.debate.catalog(scripted ?? false),
    queryFn: ({ signal }) => debateService.catalog(scripted ?? false, signal),
    enabled: scripted !== undefined,
    staleTime: Infinity,
  });
}

export function useDebateSession(id: string | null) {
  const queryClient = useQueryClient();
  const key = queryKeys.debate.session(id ?? '');
  return useQuery<DebateSession>({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const fresh = await debateService.get(id ?? '', signal);
      const held = queryClient.getQueryData<DebateSession>(key);
      return held && held.version > fresh.version ? held : fresh;
    },
    enabled: id !== null,
    refetchInterval: (query) => sessionPoll(query.state.data?.phase),
    refetchOnWindowFocus: false,
  });
}

export function useDebateReport(id: string, enabled: boolean) {
  return useQuery<DebateReportEnvelope>({
    queryKey: queryKeys.debate.report(id),
    queryFn: ({ signal }) => debateService.report(id, signal),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'ready' || status === 'failed' ? false : ENDING_POLL_MS;
    },
    refetchOnWindowFocus: false,
  });
}
