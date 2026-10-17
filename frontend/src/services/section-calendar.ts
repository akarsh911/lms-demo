import { config } from '@/config';
import { calendarWindow } from '@/fixtures/classroom';
import { DEVIATIONS } from '@/fixtures/data/classroom';

import { coreApi } from './api';
import { dev, devCreate, devDelete, devPatch } from './dev-bypass';
import type {
  DeviationCreate,
  DeviationPatch,
  SectionCalendarWindow,
  TimetableDeviationRow,
} from '@/types/section-calendar';

export const SECTION_CALENDAR_MAX_DAYS = 400;

export const sectionCalendarService = {
  getWindow: (sectionId: string, from: string, to: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => calendarWindow(sectionId, from, to))
      : coreApi.get<SectionCalendarWindow>(
          `sections/${sectionId}/calendar`,
          { from, to },
          signal,
        ),

  createDeviation: (body: DeviationCreate) =>
    config.devBypass
      ? devCreate(DEVIATIONS, body)
      : coreApi.post<TimetableDeviationRow>('timetable-deviations', body),

  updateDeviation: (id: string, body: DeviationPatch) =>
    config.devBypass
      ? devPatch(DEVIATIONS, id, body)
      : coreApi.patch<TimetableDeviationRow>(`timetable-deviations/${id}`, body),

  deleteDeviation: (id: string) =>
    config.devBypass ? devDelete(DEVIATIONS, id) : coreApi.delete<void>(`timetable-deviations/${id}`),
};
