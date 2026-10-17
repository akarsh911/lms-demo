import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { graspService, type GraspHost } from '@/services/grasp';
import type { BankSet, GraspCheck, GraspCheckSummary, GraspJoinView, SampleFile } from '@/types/grasp';

const LIVE_MS = 1500;

export const useGraspChecks = () => useQuery<GraspCheckSummary[], ApiError>({ queryKey: queryKeys.grasp.list(), queryFn: graspService.list, refetchInterval: 5000 });

export const useGraspCheck = (id: string) => useQuery<GraspCheck, ApiError>({ queryKey: queryKeys.grasp.detail(id), queryFn: () => graspService.detail(id), refetchInterval: LIVE_MS });

export const useGraspBank = () => useQuery<{ sets: BankSet[]; samples: SampleFile[] }, ApiError>({ queryKey: queryKeys.grasp.bank(), queryFn: graspService.bank, staleTime: Infinity });

export const useGraspHost = () => useQuery<GraspHost, ApiError>({ queryKey: queryKeys.grasp.host(), queryFn: graspService.host, staleTime: Infinity });

export const useGraspJoinView = (code: string, carry: string) => useQuery<GraspJoinView, ApiError>({ queryKey: queryKeys.grasp.join(code), queryFn: () => graspService.joinView(code, carry), retry: 1 });
