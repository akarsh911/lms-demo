import { config } from '@/config';
import {
  archiveNotice,
  commentOnNotice,
  createNotice,
  listNotices,
  noticeDetail,
  noticeSummary,
  previewReach,
  setNoticePinned,
  updateNotice,
} from '@/fixtures/notices';
import { noticeAudience, searchAudienceStaff, searchAudienceStudents } from '@/fixtures/audience';
import type { NoticeWrite } from '@/types/notices';

import { ApiError } from './api';
import { dev } from './dev-bypass';

// Announcements sit on stream posts; category, parents, acknowledgement and reading figures have no endpoint yet.
const fixtureOnly = <T>(answer: () => T): Promise<T> =>
  config.devBypass ? dev(answer) : Promise.reject(new ApiError(501, 'not_built', 'Announcements are not connected to your school yet.'));

export const noticesService = {
  list: () => fixtureOnly(listNotices),
  summary: () => fixtureOnly(noticeSummary),
  detail: (id: string) => fixtureOnly(() => noticeDetail(id)),
  audience: () => fixtureOnly(noticeAudience),
  searchStudents: (query: string) => fixtureOnly(() => searchAudienceStudents(query)),
  searchStaff: (query: string) => fixtureOnly(() => searchAudienceStaff(query)),
  reach: (body: Pick<NoticeWrite, 'targets' | 'delivery'>) => fixtureOnly(() => previewReach(body)),
  create: (body: NoticeWrite) => fixtureOnly(() => createNotice(body)),
  update: (id: string, body: NoticeWrite) => fixtureOnly(() => updateNotice(id, body)),
  pin: (id: string, pinned: boolean) => fixtureOnly(() => setNoticePinned(id, pinned)),
  archive: (id: string) => fixtureOnly(() => archiveNotice(id)),
  comment: (id: string, body: string) => fixtureOnly(() => commentOnNotice(id, body)),
};
