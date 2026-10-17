'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { foundationService } from '@/services/foundation';
import { mdmService } from '@/services/mdm';
import { schoolService } from '@/services/school';
import type {
  DocumentState,
  SchoolProfile,
  SchoolProfileWrite,
  WorkingDays,
  WorkingWeek,
  YearEnrollment,
  YearEvent,
  YearEventWrite,
  YearSetupArea,
} from '@/types/foundation';
import type { AcademicSession, AcademicSessionWrite } from '@/types/mdm';
import type { BellSchedule, BellSchedulePeriod, PeriodKind, Room, RoomWrite } from '@/types/school';

// Every foundation answer is derived from the same rows, so a write refreshes all of them and the lists beside them.
function useFoundationWrite<TData, TVars>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.foundation.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.mdm.all });
    },
  });
}

export function useUpdateSchoolProfile() {
  return useFoundationWrite<SchoolProfile, SchoolProfileWrite>((body) => foundationService.updateProfile(body));
}

export function useSaveWorkingWeek(yearId: string) {
  return useFoundationWrite<WorkingWeek, WorkingDays>((days) => foundationService.saveWorkingWeek(yearId, days));
}

export function useBringForward() {
  return useFoundationWrite<YearSetupArea[], { fromId: string; toId: string }>(({ fromId, toId }) =>
    foundationService.bringForward(fromId, toId),
  );
}

export function useActivateYear() {
  return useFoundationWrite<AcademicSession, string>((yearId) => foundationService.activateYear(yearId));
}

export function usePlaceStudent() {
  return useFoundationWrite<YearEnrollment, { enrollmentId: string; sectionId: string }>(({ enrollmentId, sectionId }) =>
    foundationService.placeStudent(enrollmentId, sectionId),
  );
}

export function useCreateEvent(yearId: string) {
  return useFoundationWrite<YearEvent, YearEventWrite>((body) => foundationService.createYearEvent(yearId, body));
}

export function useSetDocument() {
  return useFoundationWrite<YearEnrollment, { enrollmentId: string; key: string; state: DocumentState }>(({ enrollmentId, key, state }) =>
    foundationService.setDocument(enrollmentId, key, state),
  );
}

// A year is a real record; the checklist and the year cards are derived from it, hence the wide refresh.
export function useSaveYear() {
  return useFoundationWrite<AcademicSession, { id?: string; body: AcademicSessionWrite }>(({ id, body }) =>
    id ? mdmService.updateSession(id, body) : mdmService.createSession(body),
  );
}

export interface HolidayDay {
  // The calendar record already on that date, when there is one.
  id?: string;
  date: string;
}

// A holiday is one calendar record per date, so a week off is seven writes: there is no bulk route.
export function useSaveHoliday() {
  return useFoundationWrite<
    void,
    { yearId: string; branchId: string; days: readonly HolidayDay[]; name: string; notes: string }
  >(async ({ yearId, branchId, days, name, notes }) => {
    const closed = { day_type: 'holiday' as const, forenoon_open: false, afternoon_open: false };
    for (const day of days) {
      if (day.id) {
        await schoolService.updateCalendarDay(day.id, { ...closed, name, notes: notes || null });
      } else {
        await schoolService.createCalendarDay({
          ...closed,
          academic_session_id: yearId,
          branch_id: branchId,
          calendar_date: `${day.date}T00:00:00Z`,
          name,
          notes: notes || undefined,
        });
      }
    }
  });
}

// Removing a holiday hands each date back to what the working week says it is.
export function useRemoveHoliday() {
  return useFoundationWrite<void, readonly { id: string; working: boolean }[]>(async (days) => {
    for (const day of days) {
      await schoolService.updateCalendarDay(day.id, {
        day_type: day.working ? 'instructional' : 'weekend',
        forenoon_open: day.working,
        afternoon_open: day.working,
        name: null,
        notes: null,
      });
    }
  });
}

export interface BellSlotInput {
  // Set when an existing row is being edited.
  periodId?: string;
  bellPeriodId?: string;
  label: string;
  kind: PeriodKind;
  start: number;
  end: number;
  code: string;
  sequence: number;
}

// A slot is two records: the period (its name and type, shared by every schedule of the day) and this schedule's time for it.
export function useSaveBellSlot(schemeId: string | null, bellId: string | null) {
  return useFoundationWrite<void, BellSlotInput>(async (slot) => {
    if (!schemeId || !bellId) throw new ApiError(400, 'no_schedule', 'Choose a bell schedule first.');
    const period = slot.periodId
      ? await schoolService.updatePeriod(slot.periodId, { name: slot.label, kind: slot.kind })
      : await schoolService.createPeriod(schemeId, { name: slot.label, code: slot.code, kind: slot.kind, sequence: slot.sequence });
    const time = { start_minute: slot.start, end_minute: slot.end, runs: true };
    if (slot.bellPeriodId) await schoolService.updateBellPeriod(slot.bellPeriodId, time);
    else await schoolService.createBellPeriod(bellId, { period_id: period.id, ...time });
  });
}

export function useRemoveBellSlot() {
  return useFoundationWrite<void, string>((bellPeriodId) => schoolService.deleteBellPeriod(bellPeriodId));
}

// A year with no schedule yet has no "shape of the day" to hang one on, so the first schedule creates that too.
export function useCreateSchedule() {
  return useFoundationWrite<
    BellSchedule,
    { yearId: string; branchId: string; schemeId: string | null; name: string; isDefault: boolean; copy: readonly BellSchedulePeriod[] }
  >(async ({ yearId, branchId, schemeId, name, isDefault, copy }) => {
    const scheme =
      schemeId ??
      (await schoolService.createPeriodScheme({ academic_session_id: yearId, branch_id: branchId, name: 'School day', code: 'DAY' })).id;
    const code = name.replace(/[^a-z0-9]+/gi, '').slice(0, 6).toUpperCase() || 'BELL';
    const bell = await schoolService.createBellSchedule(scheme, { name, code, is_default: isDefault, status: 'active' });
    for (const row of copy) {
      if (row.period_id === undefined || row.start_minute === undefined || row.end_minute === undefined) continue;
      await schoolService.createBellPeriod(bell.id, {
        period_id: row.period_id,
        start_minute: row.start_minute,
        end_minute: row.end_minute,
        runs: row.runs,
      });
    }
    return bell;
  });
}

export function useRenameSchedule() {
  return useFoundationWrite<BellSchedule, { id: string; name: string }>(({ id, name }) =>
    schoolService.updateBellSchedule(id, { name }),
  );
}

// One default at a time: the old one is stood down before the new one is raised.
export function useSetDefaultSchedule() {
  return useFoundationWrite<BellSchedule, { id: string; previousId?: string }>(async ({ id, previousId }) => {
    if (previousId && previousId !== id) await schoolService.updateBellSchedule(previousId, { is_default: false });
    return schoolService.updateBellSchedule(id, { is_default: true });
  });
}

export function useDeleteSchedule() {
  return useFoundationWrite<void, string>((id) => schoolService.deleteBellSchedule(id));
}

// A room is a real record; who uses it and what is wrong with it are derived, hence the wide refresh.
export function useSaveRoom() {
  return useFoundationWrite<Room, { id?: string; body: RoomWrite }>(({ id, body }) =>
    id ? schoolService.updateRoom(id, body) : schoolService.createRoom(body),
  );
}

// There is no bulk route, so a bulk change is the same change to each room in turn.
export function useSaveRooms() {
  return useFoundationWrite<void, { ids: readonly string[]; patch: RoomWrite }>(async ({ ids, patch }) => {
    for (const id of ids) await schoolService.updateRoom(id, patch);
  });
}
