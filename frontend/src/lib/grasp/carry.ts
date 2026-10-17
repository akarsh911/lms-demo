import type { GraspCheck } from '@/types/grasp';

// A check folded into its own join link, so any server can open it even if it never saw the check being created.
export function encodeCarry(check: GraspCheck): string {
  const compact = {
    i: check.id,
    k: check.code,
    tc: check.teacher,
    t: check.title,
    s: check.subject,
    se: check.section,
    m: check.answerMode,
    n: check.checkCount,
    sec: check.seconds,
    set: check.setId,
    q: check.questions.map((q) => [q.id, q.text, q.marks]),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCarry(raw: string): unknown {
  try {
    const binary = atob(raw.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0))));
  } catch {
    return null;
  }
}
