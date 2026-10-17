import { config } from '@/config';
import { today } from '@/fixtures/daily';

import { timetableApi } from './api';
import { dev } from './dev-bypass';
import type { TimetableDay } from '@/types/timetable';

export const timetableService = {
  getToday: (signal?: AbortSignal) =>
    config.devBypass ? dev(today) : timetableApi.get<TimetableDay>('today', undefined, signal),
};
