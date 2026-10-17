import { ApiError } from '@/services/api';
import type { BankSet, GraspCheck, GraspCheckSettings, GraspCheckSummary, GraspJoinView, PaperReading, ReadbackPrompt, ReadbackResponse, SampleFile, SheetReading, StudentAnswer } from '@/types/grasp';

// GRASP is answered by this app's own route handlers, so it works the same under the dev bypass and in real mode.
async function request<T>(path: string, init?: { method?: string; json?: unknown; form?: FormData }): Promise<T> {
  const res = await fetch(`/api/grasp/${path}`, {
    method: init?.method ?? (init?.json !== undefined || init?.form ? 'POST' : 'GET'),
    headers: init?.json !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.form ?? (init?.json !== undefined ? JSON.stringify(init.json) : undefined),
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const payload: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const p = (typeof payload === 'object' && payload !== null ? payload : {}) as { code?: unknown; message?: unknown };
    throw new ApiError(res.status, typeof p.code === 'string' ? p.code : 'request_failed', typeof p.message === 'string' ? p.message : `Request failed with status ${res.status}`, payload);
  }
  return payload as T;
}

// The phone sends who it is and what it handed in with every step, so any server instance can finish the flow.
export interface Student {
  code: string;
  carry: string;
  name: string;
  roll: string;
}

export interface HandIn {
  answers: readonly StudentAnswer[];
  via: 'typed' | 'sheet';
  sheetNames: readonly string[];
}

const filesForm = (files: readonly File[]): FormData => {
  const form = new FormData();
  for (const f of files) form.append('file', f);
  return form;
};

export interface GraspHost {
  origins: string[];
  interfaces?: { name: string; origin: string }[];
}

export const graspService = {
  list: (): Promise<GraspCheckSummary[]> => request('checks'),
  detail: (id: string): Promise<GraspCheck> => request(`checks/${encodeURIComponent(id)}`),
  create: (settings: GraspCheckSettings): Promise<GraspCheck> => request('checks', { json: settings }),
  setStatus: (id: string, status: 'live' | 'closed'): Promise<GraspCheck> => request(`checks/${encodeURIComponent(id)}`, { method: 'PATCH', json: { status } }),
  bank: (): Promise<{ sets: BankSet[]; samples: SampleFile[] }> => request('bank'),
  readPaper: (file: File): Promise<PaperReading> => request('read-paper', { form: filesForm([file]) }),
  reset: (): Promise<{ ok: true }> => request('reset', { method: 'POST' }),
  host: (): Promise<GraspHost> => request('host'),
  joinView: (code: string, carry: string): Promise<GraspJoinView> => request(`join/${encodeURIComponent(code)}${carry ? `?c=${encodeURIComponent(carry)}` : ''}`),
  join: (student: Student): Promise<{ attemptId: string }> => request(`join/${encodeURIComponent(student.code)}`, { json: student }),
  readSheet: (attemptId: string, files: readonly File[], student: Student): Promise<SheetReading> => {
    const form = filesForm(files);
    form.append('code', student.code);
    form.append('carry', student.carry);
    return request(`attempts/${attemptId}/sheet`, { form });
  },
  submitAnswers: (attemptId: string, student: Student, hand: HandIn): Promise<ReadbackPrompt[]> => request(`attempts/${attemptId}/answers`, { json: { ...student, ...hand } }),
  submitResponses: (attemptId: string, student: Student, hand: HandIn, responses: readonly ReadbackResponse[]): Promise<{ ok: true }> => request(`attempts/${attemptId}/responses`, { json: { ...student, ...hand, responses } }),
};
