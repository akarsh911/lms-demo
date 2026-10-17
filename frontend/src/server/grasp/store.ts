import 'server-only';

import { randomInt, randomUUID } from 'node:crypto';

import { buildReadback } from '@/lib/grasp/readback';
import { countBands, judge } from '@/lib/grasp/score';
import type { GraspAttempt, GraspCheck, GraspCheckSettings, GraspCheckSummary, GraspJoinView, ReadbackItem, ReadbackResponse, StudentAnswer, Verdict } from '@/types/grasp';

import { claimsFor } from './bank';
import type { StudentContext } from './http';
import { readStore, type Store, writeStore } from './persistence';
import { SAMPLE_DIR, SAMPLE_FILES } from './samples';
import { seedChecks, TEACHER } from './seed';

export class GraspError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const summary = (c: GraspCheck): GraspCheckSummary => ({
  id: c.id,
  code: c.code,
  title: c.title,
  subject: c.subject,
  section: c.section,
  teacher: c.teacher,
  createdAt: c.createdAt,
  status: c.status,
  questionCount: c.questions.length,
  joined: c.attempts.length,
  finished: c.attempts.filter((a) => a.stage === 'done').length,
  bands: countBands(c.attempts.map((a) => a.verdict)),
});

export async function listChecks(): Promise<GraspCheckSummary[]> {
  const { checks } = await readStore();
  return [...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(summary);
}

export async function getCheck(id: string): Promise<GraspCheck> {
  const check = (await readStore()).checks.find((c) => c.id === id);
  if (!check) throw new GraspError(404, 'not_found', 'No such GRASP check.');
  return check;
}

export async function createCheck(settings: GraspCheckSettings): Promise<GraspCheck> {
  return writeStore((store) => {
    const taken = new Set(store.checks.map((c) => c.code));
    let code = '';
    do code = String(randomInt(100000, 999999));
    while (taken.has(code));
    const check: GraspCheck = { ...settings, id: `g-${randomUUID().slice(0, 8)}`, code, teacher: TEACHER, createdAt: new Date().toISOString(), status: 'live', attempts: [] };
    store.checks.push(check);
    return check;
  });
}

export async function setStatus(id: string, status: 'live' | 'closed'): Promise<GraspCheck> {
  return writeStore((store) => {
    const i = store.checks.findIndex((c) => c.id === id);
    const check = store.checks[i];
    if (!check) throw new GraspError(404, 'not_found', 'No such GRASP check.');
    const next = { ...check, status };
    store.checks[i] = next;
    return next;
  });
}

export async function resetDemo(): Promise<void> {
  await writeStore((store) => {
    store.checks = seedChecks();
  });
}

const NOT_FOUND = 'That code does not match a GRASP check. Check the number on the board.';

function findOrAdopt(store: Store, code: string, carried: GraspCheck | null): GraspCheck {
  const digits = code.replace(/\D/g, '');
  const found = store.checks.find((c) => c.code === digits);
  if (found) return found;
  if (!carried || carried.code !== digits) throw new GraspError(404, 'not_found', NOT_FOUND);
  store.checks.push(carried);
  return carried;
}

async function checkFor(code: string, carried: GraspCheck | null): Promise<GraspCheck> {
  const found = (await readStore()).checks.find((c) => c.code === code.replace(/\D/g, ''));
  return found ?? writeStore((store) => findOrAdopt(store, code, carried));
}

export async function joinView(code: string, carried: GraspCheck | null): Promise<GraspJoinView> {
  const c = await checkFor(code, carried);
  const sampleSheets = SAMPLE_FILES.filter((f) => f.kind === 'sheet' && f.setId === c.setId).map((f) => ({ file: `${SAMPLE_DIR}/${f.file}`, label: f.label }));
  return { code: c.code, title: c.title, subject: c.subject, section: c.section, teacher: c.teacher, status: c.status, answerMode: c.answerMode, checkCount: c.checkCount, seconds: c.seconds, questions: c.questions, sampleSheets };
}

export const sheetContext = (code: string, carried: GraspCheck | null): Promise<GraspCheck> => checkFor(code, carried);

const newAttempt = (id: string, name: string, roll: string): GraspAttempt => ({ id, name, roll, stage: 'answering', joinedAt: new Date().toISOString(), submittedAt: null, via: 'typed', sheetNames: [], answers: [], items: [], responses: [], verdict: null });

// Saves the attempt into whatever copy of the store this server holds, creating it if this server never saw the join.
function upsertAttempt(store: Store, check: GraspCheck, attempt: GraspAttempt): void {
  const i = store.checks.findIndex((c) => c.id === check.id);
  const current = store.checks[i];
  if (!current) return;
  store.checks[i] = { ...current, attempts: [...current.attempts.filter((a) => a.id !== attempt.id), attempt] };
}

export async function joinCheck(ctx: StudentContext): Promise<{ attemptId: string }> {
  return writeStore((store) => {
    const check = findOrAdopt(store, ctx.code, ctx.carried);
    if (check.status === 'closed') throw new GraspError(409, 'closed', 'Your teacher has closed this check.');
    const attempt = newAttempt(`a-${randomUUID().slice(0, 12)}`, ctx.name, ctx.roll);
    upsertAttempt(store, check, attempt);
    return { attemptId: attempt.id };
  });
}

// Rebuilt from the student's own answers and the attempt id, so any server derives the same questions.
function readbackFor(check: GraspCheck, attemptId: string, answers: readonly StudentAnswer[]): { kept: StudentAnswer[]; items: ReadbackItem[] } {
  const known = new Set(check.questions.map((q) => q.id));
  const kept = answers.filter((a) => known.has(a.questionId));
  return { kept, items: buildReadback({ questions: check.questions, answers: kept, claims: claimsFor(check.setId), count: check.checkCount, seed: attemptId }) };
}

export interface HandIn {
  answers: readonly StudentAnswer[];
  via: 'typed' | 'sheet';
  sheetNames: readonly string[];
}

export async function submitAnswers(attemptId: string, ctx: StudentContext, hand: HandIn): Promise<{ items: ReadbackItem[]; seconds: number }> {
  return writeStore((store) => {
    const check = findOrAdopt(store, ctx.code, ctx.carried);
    const existing = check.attempts.find((a) => a.id === attemptId);
    if (existing?.stage === 'done') throw new GraspError(409, 'done', 'This work has already been handed in.');
    const { kept, items } = readbackFor(check, attemptId, hand.answers);
    if (items.length === 0) throw new GraspError(422, 'too_short', 'Write a little more so there is something to read back.');
    upsertAttempt(store, check, { ...(existing ?? newAttempt(attemptId, ctx.name, ctx.roll)), stage: 'checking', via: hand.via, sheetNames: [...hand.sheetNames], answers: kept, items });
    return { items, seconds: check.seconds };
  });
}

export async function submitResponses(attemptId: string, ctx: StudentContext, hand: HandIn, responses: readonly ReadbackResponse[]): Promise<Verdict> {
  return writeStore((store) => {
    const check = findOrAdopt(store, ctx.code, ctx.carried);
    const existing = check.attempts.find((a) => a.id === attemptId);
    if (existing?.stage === 'done' && existing.verdict) return existing.verdict;
    const { kept, items } = readbackFor(check, attemptId, hand.answers);
    const ids = new Set(items.map((i) => i.id));
    const answered = responses.filter((r) => ids.has(r.itemId));
    const verdict = judge(items, answered);
    upsertAttempt(store, check, { ...(existing ?? newAttempt(attemptId, ctx.name, ctx.roll)), stage: 'done', via: hand.via, sheetNames: [...hand.sheetNames], answers: kept, items, responses: answered, verdict, submittedAt: new Date().toISOString() });
    return verdict;
  });
}
