import { config } from '@/config';
import type { ServiceName } from '@/constants/services';
import { FixtureError, insert, must, page, patch, remove, type Page, type Query, type Row } from '@/fixtures/rows';
import { logger } from '@/lib/logger';

import { ApiError } from './api';

const LATENCY_MS = 120;

export function liveUnderBypass(service: ServiceName): boolean {
  return config.devBypass && config.devLiveServices.includes(service);
}

export function fixtureServed(service: ServiceName): boolean {
  return config.devBypass && !config.devLiveServices.includes(service);
}

function unanswered(cause: unknown): boolean {
  if (cause instanceof ApiError) return cause.status >= 500;
  return cause instanceof TypeError;
}

export async function liveOrFixture<T>(
  service: ServiceName,
  call: string,
  live: () => Promise<T>,
  fixture: () => T | Promise<T>,
): Promise<T> {
  if (fixtureServed(service)) return fixture();
  if (!liveUnderBypass(service) || !config.devLiveFallback) return live();
  try {
    return await live();
  } catch (cause) {
    if (!unanswered(cause)) throw cause;
    logger.warn(`dev bypass: ${service} ${call} fell back to its fixture`, cause);
    return fixture();
  }
}

// Runs a fixture as if it were a request: a short wait, and a refusal surfaces as the ApiError a real one would.
export function dev<T>(answer: () => T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(answer());
      } catch (cause) {
        reject(
          cause instanceof FixtureError ? new ApiError(cause.status, cause.code, cause.message, cause.details) : cause,
        );
      }
    }, ms);
  });
}

export const devList = <T>(rows: readonly T[], query?: Query): Promise<Page<T>> => dev(() => page(rows, query));

export const devGet = <T extends Row>(rows: readonly T[], id: string): Promise<T> => dev(() => must(rows, id));

export const devCreate = <T extends Row>(rows: T[], body: object): Promise<T> =>
  dev(() => insert(rows, body as Omit<T, 'id'>));

export const devPatch = <T extends Row>(rows: T[], id: string, body: object): Promise<T> =>
  dev(() => patch(rows, id, body as Partial<T>) ?? must(rows, id));

export const devDelete = <T extends Row>(rows: T[], id: string): Promise<void> =>
  dev(() => {
    if (!remove(rows, id)) must(rows, id);
  });
