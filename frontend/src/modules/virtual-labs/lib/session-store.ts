/**
 * WHERE THE UNFINISHED PRACTICALS ARE KEPT.
 *
 * One key per practical, so two benches left open are two resumable benches and
 * neither overwrites the other, and so a record that turns out to be unreadable
 * can be dropped without taking the rest with it.
 *
 * There is one subscription, and everything that shows a session reads through
 * it — the dock in the corner of every page, the catalogue's Resume line, the
 * history list. `storage` events only fire in OTHER tabs, so a local write
 * notifies listeners itself; between the two, a bench saved in one tab updates
 * the dock in the next without either knowing the other exists.
 *
 * The record format, and the three gates a stored state has to pass before any
 * of this hands it to a reducer, are in `session-record.ts`.
 */

import { safeStorage } from '@/lib/safe-storage';

import {
  SESSION_VERSION,
  isDrawable,
  isResumable,
  type LabSessionRecord,
} from './session-record';

const PREFIX = 'emerge.lab.session.';

function keyFor(bench: string): string {
  return `${PREFIX}${bench}`;
}

// --- the subscription -------------------------------------------------------

const listeners = new Set<() => void>();

/**
 * The last list built, held until something changes it.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders until
 * two agree, so a getter that parsed the store afresh on every call would spin
 * forever. Caching is therefore not an optimisation here, it is the contract —
 * and every path that can change a record clears it before announcing.
 */
let cache: LabSessionRecord[] | null = null;

function announce(): void {
  cache = null;
  for (const listener of listeners) listener();
}

/** Another tab wrote: both caches are now guesses, so throw them away. */
function invalidateAll(): void {
  historyCache = null;
  announce();
}

/** Notified on every local write AND on another tab's. */
export function subscribeSessions(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener('storage', onOtherTab);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onOtherTab);
    }
  };
}

function onOtherTab(event: StorageEvent): void {
  // `key` is null when a whole store is cleared, which concerns us too.
  if (event.key === null || event.key.startsWith(PREFIX) || event.key === HISTORY_KEY) {
    invalidateAll();
  }
}

// --- reading and writing ----------------------------------------------------

export function readSession(bench: string): LabSessionRecord | null {
  const record = safeStorage.json<unknown>(keyFor(bench));
  if (!isDrawable(record) || record.bench !== bench) return null;
  return record;
}

/** Whether it landed. A bench whose session cannot be saved says so once. */
export function writeSession(record: LabSessionRecord): boolean {
  const ok = safeStorage.set(keyFor(record.bench), JSON.stringify(record));
  if (ok) announce();
  return ok;
}

export function dropSession(bench: string): void {
  safeStorage.remove(keyFor(bench));
  announce();
}

/**
 * Every readable session, newest first.
 *
 * Anything that fails `isDrawable` is REMOVED as it is found rather than
 * skipped: it was written by a build that no longer exists, nothing will ever
 * read it again, and left alone it would be re-parsed on every render of the
 * dock for the life of the browser profile.
 */
export function listSessions(): LabSessionRecord[] {
  const out: LabSessionRecord[] = [];
  for (const key of safeStorage.keys(PREFIX)) {
    const record = safeStorage.json<unknown>(key);
    if (isDrawable(record)) out.push(record);
    else safeStorage.remove(key);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** The cached list. Stable between changes, which is what a subscriber needs. */
export function sessionsSnapshot(): LabSessionRecord[] {
  if (cache === null) cache = listSessions();
  return cache;
}

/** There is no storage on the server, and a dock must not differ on first paint. */
export const NO_SESSIONS: LabSessionRecord[] = [];

/** The one the dock offers: most recent, still unfinished, not dismissed. */
export function activeSession(sessions: readonly LabSessionRecord[]): LabSessionRecord | null {
  return sessions.find((s) => isResumable(s) && !s.dismissedAt) ?? null;
}

/**
 * Take the dock down for this session WITHOUT throwing the work away.
 *
 * The two are deliberately different acts. Dismissing says "stop following me
 * around"; the record stays, and opening that practical again still offers to
 * pick it up where it was left. Only finishing the practical, or starting a
 * fresh bench, actually discards it.
 */
export function dismissSession(bench: string, at: number): void {
  const record = readSession(bench);
  if (!record) return;
  writeSession({ ...record, dismissedAt: at });
}

/** The blank a caller fills in; keeps `SESSION_VERSION` in one place. */
export function newRecord(
  fields: Omit<LabSessionRecord, 'v' | 'dismissedAt'>,
): LabSessionRecord {
  return { ...fields, v: SESSION_VERSION };
}

// --- what the student has already done --------------------------------------

/**
 * THE PRACTICAL FILE.
 *
 * A session is the bench a student is standing at; this is the list of the ones
 * they have finished, and it is a different thing with different rules. There
 * is one session per practical, replaced as they work; there are many entries
 * here, appended and never edited, because doing the same practical twice is
 * two pieces of work and a student should be able to see that the second went
 * better than the first.
 *
 * It is a LOCAL copy, not the record of account — the school's record is the
 * attempt posted to the labs service, and that is what a teacher marks from.
 * This exists so the student's own history opens instantly, reads the same when
 * the service is down, and survives a build that changes the attempt shape.
 * Nothing is ever read back out of it into a bench.
 */
export const HISTORY_VERSION = 1;

/** Roughly a year of one practical a week, and a few kilobytes. */
const HISTORY_CAP = 60;

const HISTORY_KEY = 'emerge.lab.history';

export interface LabHistoryPart {
  label: string;
  earned: number;
  max: number;
}

export interface LabHistoryEntry {
  v: number;
  /** Unique per attempt, so a re-render or a double submit cannot duplicate a row. */
  id: string;
  bench: string;
  title: string;
  subtitle: string;
  seed: number | null;
  finishedAt: number;
  elapsedMs: number;
  score: number;
  max: number;
  /** The engine's own one-line verdict on the attempt. */
  summary: string;
  parts: readonly LabHistoryPart[];
}

let historyCache: LabHistoryEntry[] | null = null;

function isEntry(value: unknown): value is LabHistoryEntry {
  if (value === null || typeof value !== 'object') return false;
  const e = value as Partial<LabHistoryEntry>;
  return (
    e.v === HISTORY_VERSION &&
    typeof e.id === 'string' &&
    typeof e.bench === 'string' &&
    typeof e.finishedAt === 'number' &&
    typeof e.score === 'number' &&
    typeof e.max === 'number'
  );
}

/** Newest first. Anything unreadable is dropped rather than shown as a blank row. */
export function readHistory(): LabHistoryEntry[] {
  if (historyCache) return historyCache;
  const raw = safeStorage.json<unknown>(HISTORY_KEY);
  const rows = Array.isArray(raw) ? raw.filter(isEntry) : [];
  historyCache = rows.sort((a, b) => b.finishedAt - a.finishedAt);
  return historyCache;
}

/**
 * Append one finished attempt.
 *
 * Idempotent on `id`, because the workspace posts an attempt the instant an
 * action completes the practical and React may run that path more than once.
 */
export function addHistory(entry: Omit<LabHistoryEntry, 'v'>): void {
  const rows = readHistory();
  if (rows.some((r) => r.id === entry.id)) return;
  const next = [{ ...entry, v: HISTORY_VERSION }, ...rows].slice(0, HISTORY_CAP);
  if (safeStorage.set(HISTORY_KEY, JSON.stringify(next))) {
    historyCache = next;
    announce();
  }
}

export function clearHistory(): void {
  safeStorage.remove(HISTORY_KEY);
  historyCache = null;
  announce();
}
