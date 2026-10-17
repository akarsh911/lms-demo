import type { CaptureAdded, CaptureFinished, CaptureSession, CaptureSessionDetail, CapturedPage } from '@/types/answer-checker';

import * as checker from './answer-checker';
import { fail } from './rows';

const PAGES_PER_BOOKLET = 3;

interface Held {
  examId: string;
  state: CaptureSession['state'];
  booklets: { pages: CapturedPage[]; supplementary: boolean; closed: boolean }[];
  started: string;
  updated: string;
  target: number;
}

const SESSIONS = new Map<string, Held>();
let sequence = 0;

const now = (): string => `${new Date().toISOString().slice(0, 19)}+00:00`;
const refuse = (status: number, detail: string): never => fail(status, 'request_failed', detail, { detail });

function held(examId: string, sessionId: string): Held {
  const session = SESSIONS.get(sessionId);
  if (!session || session.examId !== examId) return refuse(404, 'no such session');
  return session;
}

function current(session: Held): Held['booklets'][number] {
  const last = session.booklets[session.booklets.length - 1];
  if (last && !last.closed) return last;
  const fresh = { pages: [], supplementary: false, closed: false };
  session.booklets.push(fresh);
  return fresh;
}

function summary(id: string, session: Held): CaptureSession {
  const open = current(session);
  return {
    id,
    state: session.state,
    booklets: session.booklets.filter((booklet) => booklet.pages.length > 0 && !booklet.supplementary).length,
    pages: session.booklets.reduce((sum, booklet) => sum + booklet.pages.length, 0),
    duplicates_skipped: 0,
    current_booklet_pages: open.pages.length,
    current_is_supplementary: open.supplementary,
    started_at: session.started,
    updated_at: session.updated,
    needs_attention: [],
  };
}

function addPage(session: Held): CapturedPage {
  sequence += 1;
  const page: CapturedPage = { id: `pg${sequence.toString(16).padStart(5, '0')}`, verdict: 'accepted', issues: [], from_spread: false };
  current(session).pages.push(page);
  session.updated = now();
  return page;
}

function nextBooklet(session: Held, supplementary: boolean): void {
  const open = current(session);
  if (open.pages.length === 0) {
    open.supplementary = supplementary;
    return;
  }
  open.closed = true;
  session.booklets.push({ pages: [], supplementary, closed: false });
}

function simulate(session: Held): void {
  if (session.state !== 'active') return;
  const done = session.booklets.filter((booklet) => booklet.pages.length >= PAGES_PER_BOOKLET).length;
  if (done >= session.target) return;
  if (current(session).pages.length >= PAGES_PER_BOOKLET) nextBooklet(session, false);
  addPage(session);
}

export const clearSessions = (): void => SESSIONS.clear();

export function startSession(examId: string): CaptureSession {
  const roster = checker.rosterOf(examId);
  sequence += 1;
  const id = `cc${Date.now().toString(16).slice(-6)}${sequence.toString(16)}`;
  const session: Held = { examId, state: 'active', booklets: [], started: now(), updated: now(), target: Math.max(0, roster.length - 2) };
  SESSIONS.set(id, session);
  return summary(id, session);
}

export function getSession(examId: string, sessionId: string): CaptureSessionDetail {
  const session = held(examId, sessionId);
  simulate(session);
  return {
    ...summary(sessionId, session),
    booklet_detail: session.booklets.map((booklet, index) => ({ id: `${sessionId}-b${index + 1}`, closed: booklet.closed, is_supplementary: booklet.supplementary, pages: booklet.pages })),
  };
}

export function sessionPage(examId: string, sessionId: string): CaptureAdded {
  const session = held(examId, sessionId);
  if (session.state !== 'active') return refuse(409, 'this session has been finished');
  const page = addPage(session);
  return { pages: [page], session: summary(sessionId, session) };
}

export function sessionNext(examId: string, sessionId: string, supplementary: boolean): CaptureSession {
  const session = held(examId, sessionId);
  nextBooklet(session, supplementary);
  return summary(sessionId, session);
}

export function sessionUndo(examId: string, sessionId: string): { removed: string | null; session: CaptureSession } {
  const session = held(examId, sessionId);
  const removed = current(session).pages.pop() ?? null;
  return { removed: removed?.id ?? null, session: summary(sessionId, session) };
}

export function finishSession(examId: string, sessionId: string): CaptureFinished {
  const session = held(examId, sessionId);
  session.state = 'finished';
  const captured = session.booklets.filter((booklet) => booklet.pages.length > 0 && !booklet.supplementary).length;
  const roster = checker.rosterOf(examId);
  const present = roster.filter((_, index) => index !== 4 && index !== roster.length - 3).slice(0, captured);
  const kept = new Set(present.map((member) => member.roll));
  const job = checker.uploadScans(examId, [`scan ${sessionId}`], { source: `scan ${sessionId}`, absentRolls: new Set(roster.filter((member) => !kept.has(member.roll)).map((member) => member.roll)) });
  return { session: summary(sessionId, session), job };
}
