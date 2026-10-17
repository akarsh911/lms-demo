import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { GraspCheck } from '@/types/grasp';

import { seedChecks } from './seed';

export interface Store {
  checks: GraspCheck[];
}

const isStore = (value: unknown): value is Store => typeof value === 'object' && value !== null && Array.isArray((value as { checks?: unknown }).checks);

const parse = (raw: string | null | undefined): Store | null => {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isStore(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

// --- Shared store: Upstash Redis over REST, for hosts with many short-lived instances (Vercel). ---

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const KEY = 'grasp:store';
const REV = 'grasp:rev';

// Writes only if nobody else wrote since we read, so two instances cannot overwrite each other's hand-ins.
const SET_IF_UNCHANGED = "if (redis.call('GET', KEYS[2]) or '0') ~= ARGV[2] then return 0 end redis.call('SET', KEYS[1], ARGV[1]) redis.call('INCR', KEYS[2]) return 1";

async function redis(command: readonly (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL ?? '', { method: 'POST', headers: { authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(command), cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!res.ok || !body || body.error) throw new Error(`[grasp] redis ${String(command[0])} failed: ${body?.error ?? res.status}`);
  return body.result;
}

async function redisRead(): Promise<{ store: Store; rev: string }> {
  const result = await redis(['MGET', KEY, REV]);
  const [raw, rev] = Array.isArray(result) ? result : [];
  const saved = parse(typeof raw === 'string' ? raw : null);
  if (saved) return { store: saved, rev: typeof rev === 'string' ? rev : '0' };
  const fresh: Store = { checks: seedChecks() };
  await redis(['SET', KEY, JSON.stringify(fresh), 'NX']);
  const again = await redis(['MGET', KEY, REV]);
  const [raw2, rev2] = Array.isArray(again) ? again : [];
  return { store: parse(typeof raw2 === 'string' ? raw2 : null) ?? fresh, rev: typeof rev2 === 'string' ? rev2 : '0' };
}

async function redisWrite<T>(change: (store: Store) => T): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { store, rev } = await redisRead();
    const result = change(store);
    if ((await redis(['EVAL', SET_IF_UNCHANGED, 2, KEY, REV, JSON.stringify(store), rev])) === 1) return result;
  }
  throw new Error('[grasp] too many concurrent writes; try again');
}

// --- Local store: a JSON file in the first writable place, else memory. One process, one copy. ---

const DIRS = [process.env.GRASP_DATA_DIR, path.join(process.cwd(), '.grasp-data'), path.join(tmpdir(), 'grasp-data')].filter((d): d is string => Boolean(d));

const shared = globalThis as typeof globalThis & { __grasp?: Promise<Store>; __graspQueue?: Promise<unknown> };
let warned = false;

async function fileSave(store: Store): Promise<void> {
  for (const dir of DIRS) {
    try {
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, 'store.json');
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(store));
      await rename(tmp, file);
      return;
    } catch {
      // Not writable here; try the next place.
    }
  }
  if (!warned) console.warn('[grasp] no writable data directory; demo data is kept in memory only');
  warned = true;
}

async function fileRead(): Promise<Store> {
  shared.__grasp ??= (async () => {
    for (const dir of DIRS) {
      const saved = parse(await readFile(path.join(dir, 'store.json'), 'utf8').catch(() => null));
      if (saved) return saved;
    }
    const fresh: Store = { checks: seedChecks() };
    await fileSave(fresh);
    return fresh;
  })().catch((error: unknown) => {
    shared.__grasp = undefined;
    throw error;
  });
  return shared.__grasp;
}

// Writes run one at a time so two phones submitting together cannot lose each other's work.
async function fileWrite<T>(change: (store: Store) => T): Promise<T> {
  const run = (shared.__graspQueue ?? Promise.resolve()).then(async () => {
    const store = await fileRead();
    const result = change(store);
    await fileSave(store);
    return result;
  });
  shared.__graspQueue = run.catch(() => undefined);
  return run;
}

const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

export const readStore = async (): Promise<Store> => (useRedis ? (await redisRead()).store : fileRead());

export const writeStore = <T>(change: (store: Store) => T): Promise<T> => (useRedis ? redisWrite(change) : fileWrite(change));
