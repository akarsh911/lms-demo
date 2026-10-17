import 'server-only';

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { logger } from '@/lib/logger';

const RAW_DIR = path.join(process.cwd(), '.fixtures-raw');

export function isRecording(): boolean {
  return process.env.RECORD_FIXTURES === '1' && process.env.NODE_ENV !== 'production';
}

function fileName(method: string, route: string, query: string): string {
  const base = `${method}__${route.replace(/^\/+|\/+$/g, '').replace(/\//g, '~')}`;
  if (!query) return `${base}.json`;
  const hash = createHash('sha1').update(query).digest('hex').slice(0, 8);
  return `${base}__${hash}.json`;
}

export async function recordExchange(
  source: string,
  method: string,
  route: string,
  query: string,
  response: Response,
): Promise<void> {
  if (!isRecording()) return;
  if (!response.headers.get('content-type')?.includes('json')) return;
  try {
    const body: unknown = await response.json();
    const dir = path.join(RAW_DIR, source);
    await mkdir(dir, { recursive: true });
    const entry = { method, route, query, status: response.status, recordedAt: new Date().toISOString(), body };
    await writeFile(path.join(dir, fileName(method, route, query)), JSON.stringify(entry, null, 2));
  } catch (cause) {
    logger.warn('fixture recording failed', { source, route, cause });
  }
}
