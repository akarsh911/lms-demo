'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { schoolService } from '@/services/school';
import type {
  BellSchedule,
  BellSchedulePeriod,
  PeriodScheme,
  BellScheduleWrite,
  CalendarDay,
  CalendarDayCreate,
  CalendarDayPatch,
  CalendarDaySchedule,
  Period,
  PeriodSchemePatch,
  PeriodSchemeWrite,
  PeriodWrite,
  Room,
  RoomWrite,
  SlotWrite,
  TimetableSlot,
} from '@/types/school';

/**
 * Writes for the school-administrator screens.
 *
 * None of them is optimistic. Every one of these can be REFUSED for a reason
 * the browser could not have predicted — a clash the server computes, a
 * database check constraint on an instructional day with both halves shut, a
 * unique index on (branch, date) — and an optimistic row that appears and then
 * vanishes is a worse account of that than a moment's wait.
 *
 * Invalidation is by prefix. `school.all` covers the grid, the requirements
 * count and the clash report at once, which is right because a single
 * placement changes all three.
 */

function useSchoolWrite<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  onDone?: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
      onDone?.();
    },
  });
}

// --- the year --------------------------------------------------------------

export function useCreateCalendarDay() {
  return useSchoolWrite<CalendarDay, CalendarDayCreate>((body) =>
    schoolService.createCalendarDay(body),
  );
}

export function useUpdateCalendarDay() {
  return useSchoolWrite<CalendarDay, { id: string; patch: CalendarDayPatch }>(
    ({ id, patch }) => schoolService.updateCalendarDay(id, patch),
  );
}

export function useDeleteCalendarDay() {
  return useSchoolWrite<void, string>((id) => schoolService.deleteCalendarDay(id));
}

export function useAttachDaySchedule() {
  return useSchoolWrite<
    CalendarDaySchedule,
    { dayId: string; period_scheme_id: string; bell_schedule_id: string }
  >(({ dayId, period_scheme_id, bell_schedule_id }) =>
    schoolService.attachDaySchedule(dayId, { period_scheme_id, bell_schedule_id }),
  );
}

export function useUpdateDaySchedule() {
  return useSchoolWrite<CalendarDaySchedule, { id: string; bell_schedule_id: string }>(
    ({ id, bell_schedule_id }) =>
      schoolService.updateDaySchedule(id, { bell_schedule_id }),
  );
}

export function useDetachDaySchedule() {
  return useSchoolWrite<void, string>((id) => schoolService.detachDaySchedule(id));
}

// --- the shape of a day ----------------------------------------------------

export function useCreatePeriodScheme() {
  return useSchoolWrite<PeriodScheme, PeriodSchemeWrite>((body) =>
    schoolService.createPeriodScheme(body),
  );
}

export function useUpdatePeriodScheme() {
  return useSchoolWrite<PeriodScheme, { id: string; patch: PeriodSchemePatch }>(
    ({ id, patch }) => schoolService.updatePeriodScheme(id, patch),
  );
}

export function useDeletePeriodScheme() {
  return useSchoolWrite<void, string>((id) => schoolService.deletePeriodScheme(id));
}

export function useCreatePeriod(schemeId: string | null) {
  return useSchoolWrite<Period, PeriodWrite>((body) => {
    if (!schemeId) throw noScheme();
    return schoolService.createPeriod(schemeId, body);
  });
}

export function useUpdatePeriod() {
  return useSchoolWrite<Period, { id: string; patch: PeriodWrite }>(({ id, patch }) =>
    schoolService.updatePeriod(id, patch),
  );
}

export function useDeletePeriod() {
  return useSchoolWrite<void, string>((id) => schoolService.deletePeriod(id));
}

export function useCreateBellSchedule(schemeId: string | null) {
  return useSchoolWrite<BellSchedule, BellScheduleWrite>((body) => {
    if (!schemeId) throw noScheme();
    return schoolService.createBellSchedule(schemeId, body);
  });
}

export function useUpdateBellSchedule() {
  return useSchoolWrite<BellSchedule, { id: string; patch: BellScheduleWrite }>(
    ({ id, patch }) => schoolService.updateBellSchedule(id, patch),
  );
}

export function useDeleteBellSchedule() {
  return useSchoolWrite<void, string>((id) => schoolService.deleteBellSchedule(id));
}

export function useSaveBellPeriod(bellId: string | null) {
  return useSchoolWrite<
    BellSchedulePeriod,
    {
      id?: string;
      period_id: string;
      start_minute: number;
      end_minute: number;
      runs?: boolean;
    }
  >(({ id, period_id, start_minute, end_minute, runs }) => {
    if (id) return schoolService.updateBellPeriod(id, { start_minute, end_minute, runs });
    if (!bellId) {
      throw new ApiError(
        400,
        'no_bell_schedule',
        'Choose a bell schedule before setting a time.',
      );
    }
    return schoolService.createBellPeriod(bellId, {
      period_id,
      start_minute,
      end_minute,
      runs,
    });
  });
}

export function useDeleteBellPeriod() {
  return useSchoolWrite<void, string>((id) => schoolService.deleteBellPeriod(id));
}

export function useAttachSchemeGrades() {
  return useSchoolWrite<{ attached: number }, { schemeId: string; gradeLevelIds: string[] }>(
    ({ schemeId, gradeLevelIds }) =>
      schoolService.attachSchemeGrades(schemeId, gradeLevelIds),
  );
}

export function useDetachSchemeGrade() {
  return useSchoolWrite<void, string>((id) => schoolService.detachSchemeGrade(id));
}

export function useClonePeriodScheme() {
  return useSchoolWrite<
    PeriodScheme,
    { schemeId: string; name: string; code: string; gradeLevelIds?: string[] }
  >(({ schemeId, name, code, gradeLevelIds }) =>
    schoolService.clonePeriodScheme(schemeId, {
      name,
      code,
      grade_level_ids: gradeLevelIds,
    }),
  );
}

// --- rooms -----------------------------------------------------------------

export function useCreateRoom() {
  return useSchoolWrite<Room, RoomWrite>((body) => schoolService.createRoom(body));
}

export function useUpdateRoom() {
  return useSchoolWrite<Room, { id: string; patch: RoomWrite }>(({ id, patch }) =>
    schoolService.updateRoom(id, patch),
  );
}

export function useDeleteRoom() {
  return useSchoolWrite<void, string>((id) => schoolService.deleteRoom(id));
}

// --- the week --------------------------------------------------------------

/**
 * Place a slot.
 *
 * A clash is refused with 409 and `code: "timetable_clash"`, and the refusal
 * CARRIES the clashing parties. `ApiError.details` keeps that body, so the
 * caller can name who collided with what without asking a second time.
 *
 * Sending `clash_override` requires a non-empty `clash_override_reason` — an
 * empty one is a 422 — and the override itself needs `core.timetable.override`,
 * which is a separate grant from `core.timetable.write`: arranging a week and
 * forcing a double-booking are different powers, and a caller who holds only
 * the first gets a 403 naming the second.
 */
export function usePlaceSlot(timetableId: string | null) {
  return useSchoolWrite<TimetableSlot, SlotWrite>((body) => {
    if (!timetableId) throw noTimetable();
    return schoolService.createSlot(timetableId, body);
  });
}

export function useMoveSlot() {
  return useSchoolWrite<TimetableSlot, { id: string; patch: SlotWrite }>(({ id, patch }) =>
    schoolService.updateSlot(id, patch),
  );
}

export function useRemoveSlot() {
  return useSchoolWrite<void, string>((id) => schoolService.deleteSlot(id));
}

function noScheme(): ApiError {
  return new ApiError(400, 'no_scheme', 'Choose a period scheme first.');
}

function noTimetable(): ApiError {
  return new ApiError(400, 'no_timetable', 'Choose a timetable first.');
}
