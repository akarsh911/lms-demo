import { MAX_EVALUATE_KEYS } from '@/constants/features';

/**
 * Split keys into batches CAS will accept.
 *
 * `POST /v1/features/evaluate` rejects more than 64 keys with a 400
 * (`CAS/internal/handler/features.go:21`). The registry is far under that
 * today, but the cap is a server limit rather than a guideline, and a product
 * that grows past it would start failing entirely rather than degrading.
 */
export function chunkKeys<T>(keys: readonly T[], size = MAX_EVALUATE_KEYS): T[][] {
  if (size < 1) throw new Error('chunk size must be >= 1');
  const out: T[][] = [];
  for (let i = 0; i < keys.length; i += size) {
    out.push(keys.slice(i, i + size));
  }
  return out;
}
