'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { debateService } from '@/services/debate';
import type { CreateDebateRequest, DebateReportEnvelope, DebateSession } from '@/types/debate';

export function useDebateStep<V>(run: (variables: V) => Promise<DebateSession>) {
  const queryClient = useQueryClient();
  return useMutation<DebateSession, Error, V>({
    mutationFn: run,
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.debate.session(session.id), session);
    },
  });
}

export function useCreateDebate() {
  return useDebateStep(({ request, scripted }: { request: CreateDebateRequest; scripted: boolean }) =>
    debateService.create(request, scripted),
  );
}

export function useRetryReport(id: string) {
  const queryClient = useQueryClient();
  return useMutation<DebateReportEnvelope, Error, void>({
    mutationFn: () => debateService.retryReport(id),
    onSuccess: (envelope) => {
      queryClient.setQueryData(queryKeys.debate.report(id), envelope);
      void queryClient.invalidateQueries({ queryKey: queryKeys.debate.session(id) });
    },
  });
}
