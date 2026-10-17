'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { ApiError } from '@/services/api';
import { rosterWriteService } from '@/services/roster';
import { rosteringService } from '@/services/rostering';
import type { EnrollmentWrite } from '@/types/rostering';
import type {
  ProvisionRequest,
  StaffWrite,
  StudentWrite,
  TeacherWrite,
} from '@/types/people-write';

export type AdmissionStep = 'identity' | 'student' | 'staff' | 'teacher' | 'enrolment';

export type StepStatus = 'pending' | 'running' | 'created' | 'reused' | 'failed' | 'blocked';

export interface AdmissionIdentity {
  personId: string;
  casUserId?: string;
  createdInCas: boolean;
  linkedExisting: boolean;
  groups: readonly string[];
  displayName?: string;
  password?: string;
}

export interface AdmissionState {
  order: readonly AdmissionStep[];
  status: Readonly<Partial<Record<AdmissionStep, StepStatus>>>;
  identity?: AdmissionIdentity;
  studentId?: string;
  staffId?: string;
  teacherId?: string;
  enrolmentId?: string;
  failedAt?: AdmissionStep;
  error?: ApiError;
  busy: boolean;
}

export interface StudentAdmission {
  person: ProvisionRequest;
  student: StudentWrite;
  enrolment?: EnrollmentWrite;
}

export interface TeacherAdmission {
  person: ProvisionRequest;
  staff: StaffWrite;
  teacher: TeacherWrite;
}

interface Task {
  step: AdmissionStep;
  settled: (state: AdmissionState) => boolean;
  run: (state: AdmissionState) => Promise<Partial<AdmissionState>>;
}

const IDLE: AdmissionState = { order: [], status: {}, busy: false };

function asApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  return new ApiError(
    0,
    'request_failed',
    cause instanceof Error ? cause.message : 'The request could not be sent.',
  );
}

function identityTask(person: ProvisionRequest): Task {
  return {
    step: 'identity',
    settled: (state) => state.identity !== undefined,
    run: async () => {
      const out = await rosterWriteService.provisionPerson(person);
      const personId = out.person?.id;
      if (!personId) {
        throw new ApiError(
          502,
          'no_person',
          'The identity was accepted but no person record came back, so nothing further can be created against it.',
        );
      }
      const createdInCas = out.created_in_cas === true;
      return {
        identity: {
          personId,
          casUserId: out.cas_user_id,
          createdInCas,
          linkedExisting: out.linked_existing === true,
          groups: out.groups ?? [],
          displayName: out.person?.display_name,
          password: createdInCas ? out.password : undefined,
        },
      };
    },
  };
}

export function useAdmission(): {
  state: AdmissionState;
  admitStudent: (plan: StudentAdmission) => Promise<void>;
  admitTeacher: (plan: TeacherAdmission) => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
} {
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<AdmissionState>(IDLE);
  const pending = React.useRef<readonly Task[]>([]);
  const latest = React.useRef<AdmissionState>(IDLE);

  const commit = (next: AdmissionState): void => {
    latest.current = next;
    setState(next);
  };

  const invalidate = (): void => {
    for (const key of [
      queryKeys.roster.all,
      queryKeys.core.all,
      queryKeys.rostering.all,
      queryKeys.academic.all,
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const execute = async (tasks: readonly Task[], carried: AdmissionState): Promise<void> => {
    pending.current = tasks;

    const order = tasks.map((task) => task.step);
    const status: Partial<Record<AdmissionStep, StepStatus>> = {};
    for (const task of tasks) {
      status[task.step] = task.settled(carried) ? (carried.status[task.step] ?? 'created') : 'pending';
    }

    let current: AdmissionState = {
      ...carried,
      order,
      status,
      failedAt: undefined,
      error: undefined,
      busy: true,
    };
    commit(current);

    for (const task of tasks) {
      if (task.settled(current)) {
        current = {
          ...current,
          status: { ...current.status, [task.step]: current.status[task.step] ?? 'reused' },
        };
        commit(current);
        continue;
      }

      current = { ...current, status: { ...current.status, [task.step]: 'running' } };
      commit(current);

      try {
        const patch = await task.run(current);
        current = {
          ...current,
          ...patch,
          status: { ...current.status, [task.step]: 'created' },
        };
        commit(current);
      } catch (cause) {
        const failure = asApiError(cause);
        const blocked: Partial<Record<AdmissionStep, StepStatus>> = {
          ...current.status,
          [task.step]: 'failed',
        };
        for (const later of tasks.slice(tasks.indexOf(task) + 1)) {
          if (blocked[later.step] === 'pending') blocked[later.step] = 'blocked';
        }
        commit({
          ...current,
          status: blocked,
          failedAt: task.step,
          error: failure,
          busy: false,
        });
        invalidate();
        return;
      }
    }

    commit({ ...current, busy: false });
    invalidate();
  };

  const admitStudent = async (plan: StudentAdmission): Promise<void> => {
    const tasks: Task[] = [
      identityTask(plan.person),
      {
        step: 'student',
        settled: (s) => s.studentId !== undefined,
        run: async (s) => {
          const row = await rosterWriteService.createStudent({
            ...plan.student,
            person_id: s.identity?.personId,
          });
          return { studentId: row.id };
        },
      },
    ];

    if (plan.enrolment) {
      const enrolment = plan.enrolment;
      tasks.push({
        step: 'enrolment',
        settled: (s) => s.enrolmentId !== undefined,
        run: async (s) => {
          const row = await rosteringService.createEnrollment({
            ...enrolment,
            student_id: s.studentId,
          });
          return { enrolmentId: row.id };
        },
      });
    }

    await execute(tasks, latest.current.identity ? latest.current : IDLE);
  };

  const admitTeacher = async (plan: TeacherAdmission): Promise<void> => {
    const tasks: Task[] = [
      identityTask(plan.person),
      {
        step: 'staff',
        settled: (s) => s.staffId !== undefined,
        run: async (s) => {
          const row = await rosterWriteService.createStaff({
            ...plan.staff,
            person_id: s.identity?.personId,
          });
          return { staffId: row.id };
        },
      },
      {
        step: 'teacher',
        settled: (s) => s.teacherId !== undefined,
        run: async (s) => {
          const row = await rosterWriteService.createTeacher({
            ...plan.teacher,
            staff_id: s.staffId,
          });
          return { teacherId: row.id };
        },
      },
    ];

    await execute(tasks, latest.current.identity ? latest.current : IDLE);
  };

  const retry = async (): Promise<void> => {
    if (pending.current.length === 0 || latest.current.busy) return;
    await execute(pending.current, latest.current);
  };

  const reset = (): void => {
    pending.current = [];
    commit(IDLE);
  };

  return { state, admitStudent, admitTeacher, retry, reset };
}
