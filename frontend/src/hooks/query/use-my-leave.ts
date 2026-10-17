'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import type { ApiError } from '@/services/api';
import { leaveService } from '@/services/leave';
import type { MyLeave } from '@/types/leave';

export const useMyLeave = () => useQuery<MyLeave, ApiError>({ queryKey: queryKeys.leave.mine(), queryFn: leaveService.mine });
