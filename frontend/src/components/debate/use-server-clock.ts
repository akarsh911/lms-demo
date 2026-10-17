'use client';

import * as React from 'react';

import type { DebateSession } from '@/types/debate';

const TICK_MS = 250;
const RUNNING: readonly DebateSession['phase'][] = ['student_turn', 'processing', 'ai_turn'];

export function useServerClock(session: DebateSession, onExpire: () => void): number {
  const [remaining, setRemaining] = React.useState(session.remaining_ms);
  const expire = React.useRef(onExpire);
  const fired = React.useRef<string | null>(null);
  const { server_now: serverNow, deadline_at: deadlineAt, remaining_ms: remainingMs, phase } = session;

  React.useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);

  React.useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const deadline = deadlineAt ? Date.parse(deadlineAt) : null;
    const running = RUNNING.includes(phase) && deadline !== null;
    const tick = (): void => {
      const left = running && deadline !== null ? Math.max(0, deadline - (Date.now() + offset)) : remainingMs;
      setRemaining(left);
      if (running && left === 0 && fired.current !== deadlineAt) {
        fired.current = deadlineAt;
        expire.current();
      }
    };
    const first = window.setTimeout(tick, 0);
    const id = running ? window.setInterval(tick, TICK_MS) : undefined;
    return () => {
      window.clearTimeout(first);
      if (id !== undefined) window.clearInterval(id);
    };
  }, [serverNow, deadlineAt, remainingMs, phase]);

  return remaining;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
