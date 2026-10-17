import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { homeworkService } from '@/services/homework';
import type { GradeWrite, HandIn, Homework, HomeworkDetail, HomeworkWrite, MyWork } from '@/types/homework';

function useHomeworkWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.homework.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.classroom.all });
    },
  });
}

export const useSaveHomework = () =>
  useHomeworkWrite<Homework[], { id: string | null; body: HomeworkWrite }>(async ({ id, body }) => (id ? [await homeworkService.update(id, body)] : homeworkService.create(body)));

export const useExtendHomework = (id: string) => useHomeworkWrite<Homework, string>((dueAt) => homeworkService.extend(id, dueAt));

export const useCloseHomework = (id: string) => useHomeworkWrite<Homework, boolean>((closed) => homeworkService.close(id, closed));

export const useDeleteHomework = () => useHomeworkWrite<void, string>((id) => homeworkService.remove(id));

export const useRemindMissing = (id: string) => useHomeworkWrite<number, void>(() => homeworkService.remind(id));

export const useGradeWork = (id: string) => useHomeworkWrite<HomeworkDetail, GradeWrite>((body) => homeworkService.grade(id, body));

export const useExcuseWork = (id: string) => useHomeworkWrite<HomeworkDetail, { studentId: string; excused: boolean }>(({ studentId, excused }) => homeworkService.excuse(id, studentId, excused));

export const useReturnAll = (id: string) => useHomeworkWrite<number, void>(() => homeworkService.returnAll(id));

export const useHandIn = (id: string) => useHomeworkWrite<MyWork, HandIn>((body) => homeworkService.handIn(id, body));
