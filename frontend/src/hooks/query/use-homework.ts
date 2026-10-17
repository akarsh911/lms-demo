import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { homeworkService } from '@/services/homework';
import type { Homework, HomeworkDetail, HomeworkOptions, HomeworkSummary, MyWork } from '@/types/homework';

export const useHomeworkList = () => useQuery<Homework[], ApiError>({ queryKey: queryKeys.homework.list(), queryFn: homeworkService.list });

export const useHomeworkSummary = () => useQuery<HomeworkSummary, ApiError>({ queryKey: queryKeys.homework.summary(), queryFn: homeworkService.summary });

export const useHomework = (id: string) => useQuery<HomeworkDetail, ApiError>({ queryKey: queryKeys.homework.detail(id), queryFn: () => homeworkService.detail(id) });

export const useHomeworkOptions = (enabled: boolean) =>
  useQuery<HomeworkOptions, ApiError>({ queryKey: queryKeys.homework.options(), queryFn: homeworkService.options, enabled, staleTime: 60_000 });

export const useMyWork = () => useQuery<MyWork[], ApiError>({ queryKey: queryKeys.homework.mine(), queryFn: homeworkService.mine });
