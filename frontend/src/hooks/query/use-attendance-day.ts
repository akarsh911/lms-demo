'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { attendanceService } from '@/services/attendance';
import type { RegisterProgress, StudentLeave } from '@/types/attendance';

export const useStudentLeaves = (classId: string | null, date: string) =>
  useQuery<StudentLeave[], ApiError>({ queryKey: queryKeys.attendance.leaves(classId ?? '', date), queryFn: () => attendanceService.leaves(classId ?? '', date), enabled: Boolean(classId) });

export const useRegisters = (date: string) =>
  useQuery<RegisterProgress[], ApiError>({ queryKey: queryKeys.attendance.registers(date), queryFn: () => attendanceService.registers(date), placeholderData: keepPreviousData });
