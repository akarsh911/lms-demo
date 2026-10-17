import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { noticesService } from '@/services/notices';
import type { AudienceStaff, AudienceStudent, Notice, NoticeAudience, NoticeDetail, NoticeReach, NoticeSummary, NoticeWrite } from '@/types/notices';

export const useNotices = () => useQuery<Notice[], ApiError>({ queryKey: queryKeys.notices.list(), queryFn: noticesService.list });

export const useNoticeSummary = () => useQuery<NoticeSummary, ApiError>({ queryKey: queryKeys.notices.summary(), queryFn: noticesService.summary });

export const useNotice = (id: string | null) =>
  useQuery<NoticeDetail, ApiError>({ queryKey: queryKeys.notices.detail(id ?? ''), queryFn: () => noticesService.detail(id ?? ''), enabled: Boolean(id) });

export const useNoticeAudience = (enabled: boolean) =>
  useQuery<NoticeAudience, ApiError>({ queryKey: queryKeys.notices.audience(), queryFn: noticesService.audience, enabled });

export const useAudienceStudents = (query: string) =>
  useQuery<AudienceStudent[], ApiError>({
    queryKey: queryKeys.notices.students(query),
    queryFn: () => noticesService.searchStudents(query),
    enabled: query.trim().length >= 2,
    placeholderData: keepPreviousData,
  });

export const useNoticeReach = (body: Pick<NoticeWrite, 'targets' | 'delivery'>) =>
  useQuery<NoticeReach, ApiError>({
    queryKey: queryKeys.notices.reach(JSON.stringify(body)),
    queryFn: () => noticesService.reach(body),
    placeholderData: keepPreviousData,
  });

export const useAudienceStaff = (query: string) =>
  useQuery<AudienceStaff[], ApiError>({
    queryKey: queryKeys.notices.staff(query),
    queryFn: () => noticesService.searchStaff(query),
    enabled: query.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
