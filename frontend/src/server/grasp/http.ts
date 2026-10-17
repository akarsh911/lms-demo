import 'server-only';

import { NextResponse } from 'next/server';

import { decodeCarry } from '@/lib/grasp/carry';
import { getSession } from '@/server/dal';
import type { AnswerMode, GraspCheck, GraspCheckSettings, GraspQuestion, ReadbackResponse, StudentAnswer } from '@/types/grasp';

import { GraspError } from './store';

export async function handle(run: () => Promise<unknown>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (error) {
    if (error instanceof GraspError) return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    console.error('[grasp]', error);
    return NextResponse.json({ code: 'grasp_failed', message: 'Something went wrong. Try again.' }, { status: 500 });
  }
}

export async function requireTeacher(): Promise<void> {
  if (!(await getSession())) throw new GraspError(401, 'unauthorized', 'Sign in to manage GRASP checks.');
}

const bad = (message: string): GraspError => new GraspError(400, 'invalid', message);

const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw bad('Expected an object.');
  return value as Record<string, unknown>;
};

export const text = (value: unknown, field: string, max = 4000): string => {
  if (typeof value !== 'string' || value.trim().length === 0) throw bad(`${field} is required.`);
  return value.trim().slice(0, max);
};

const list = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) throw bad(`${field} must be a list.`);
  return value;
};

export async function body(request: Request): Promise<Record<string, unknown>> {
  return record(await request.json().catch(() => null));
}

export function parseSettings(raw: Record<string, unknown>): GraspCheckSettings {
  const modes: readonly AnswerMode[] = ['typed', 'sheet', 'either'];
  const answerMode = modes.find((m) => m === raw.answerMode);
  if (!answerMode) throw bad('Choose how students answer.');
  const questions = list(raw.questions, 'questions').map((q, i): GraspQuestion => {
    const r = record(q);
    return { id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `q${i + 1}`, number: i + 1, text: text(r.text, `Question ${i + 1}`, 1200), marks: typeof r.marks === 'number' && r.marks > 0 ? Math.min(20, Math.round(r.marks)) : 2 };
  });
  if (questions.length === 0 || questions.length > 12) throw bad('Add between 1 and 12 questions.');
  return {
    title: text(raw.title, 'Title', 120),
    subject: text(raw.subject, 'Subject', 60),
    section: text(raw.section, 'Class', 60),
    answerMode,
    checkCount: raw.checkCount === 3 ? 3 : 4,
    seconds: typeof raw.seconds === 'number' ? Math.min(15, Math.max(5, Math.round(raw.seconds))) : 7,
    questions,
    setId: typeof raw.setId === 'string' ? raw.setId : null,
  };
}

export function parseAnswers(raw: Record<string, unknown>): { answers: StudentAnswer[]; via: 'typed' | 'sheet'; sheetNames: string[] } {
  const answers = list(raw.answers, 'answers').map((a): StudentAnswer => {
    const r = record(a);
    return { questionId: text(r.questionId, 'questionId', 40), text: typeof r.text === 'string' ? r.text.slice(0, 6000) : '' };
  });
  const sheetNames = Array.isArray(raw.sheetNames) ? raw.sheetNames.filter((n): n is string => typeof n === 'string').slice(0, 10) : [];
  return { answers, via: raw.via === 'sheet' ? 'sheet' : 'typed', sheetNames };
}

export function parseResponses(raw: Record<string, unknown>): ReadbackResponse[] {
  return list(raw.responses, 'responses').map((x): ReadbackResponse => {
    const r = record(x);
    const choice = typeof r.choice === 'number' && Number.isInteger(r.choice) && r.choice >= 0 ? r.choice : null;
    return { itemId: text(r.itemId, 'itemId', 120), choice, ms: typeof r.ms === 'number' ? Math.max(0, Math.min(600_000, Math.round(r.ms))) : 0 };
  });
}

export async function uploadedFiles(request: Request): Promise<{ bytes: Buffer; name: string }[]> {
  const form = await request.formData().catch(() => null);
  if (!form) throw bad('Attach a file.');
  const files = form.getAll('file').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f);
  if (files.length === 0) throw bad('Attach a file.');
  if (files.some((f) => f.size > 25 * 1024 * 1024)) throw bad('Each file must be under 25 MB.');
  return Promise.all(files.slice(0, 10).map(async (f) => ({ bytes: Buffer.from(await f.arrayBuffer()), name: f.name })));
}

// The check carried in a join link, trusted only to recreate a check this server has never seen.
export function parseCarried(raw: unknown, code: string): GraspCheck | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 12_000) return null;
  try {
    const c = record(decodeCarry(raw));
    if (c.k !== code || typeof c.i !== 'string' || !/^g-[a-z0-9-]{3,40}$/.test(c.i)) return null;
    const questions = list(c.q, 'questions').map((q) => (Array.isArray(q) ? { id: q[0], text: q[1], marks: q[2] } : q));
    const settings = parseSettings({ title: c.t, subject: c.s, section: c.se, answerMode: c.m, checkCount: c.n, seconds: c.sec, setId: c.set, questions });
    return { ...settings, id: c.i, code, teacher: typeof c.tc === 'string' ? c.tc.slice(0, 60) : 'Your teacher', createdAt: new Date().toISOString(), status: 'live', attempts: [] };
  } catch {
    return null;
  }
}

export interface StudentContext {
  code: string;
  carried: GraspCheck | null;
  name: string;
  roll: string;
}

export function parseStudent(raw: Record<string, unknown>): StudentContext {
  const code = text(raw.code, 'code', 12).replace(/\D/g, '');
  return { code, carried: parseCarried(raw.carry, code), name: text(raw.name, 'Your name', 60), roll: typeof raw.roll === 'string' ? raw.roll.trim().slice(0, 12) : '' };
}

export const attemptIdOf = (raw: string): string => {
  if (!/^a-[a-z0-9-]{4,40}$/.test(raw)) throw bad('Unknown attempt.');
  return raw;
};
