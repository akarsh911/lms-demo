import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { noticesService } from '@/services/notices';
import type { Notice, NoticeDetail, NoticeWrite } from '@/types/notices';

function useNoticeWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notices.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.classroom.all });
    },
  });
}

export const useSaveNotice = () =>
  useNoticeWrite<Notice, { id: string | null; body: NoticeWrite }>(({ id, body }) => (id ? noticesService.update(id, body) : noticesService.create(body)));

export const usePinNotice = () => useNoticeWrite<Notice, { id: string; pinned: boolean }>(({ id, pinned }) => noticesService.pin(id, pinned));

export const useArchiveNotice = () => useNoticeWrite<void, string>((id) => noticesService.archive(id));

export const useCommentOnNotice = (id: string) => useNoticeWrite<NoticeDetail, string>((body) => noticesService.comment(id, body));
