/**
 * Seeded randomness for lab benches.
 *
 * Every bench is generated from a four-digit seed, so answers cannot be copied
 * between students and a teacher can reproduce any attempt exactly from the
 * seed carried in its attempt record.
 */

export const SEED_MIN = 1000;
export const SEED_MAX = 9999;

/** Mulberry32: tiny, fast, and good enough to vary a bench. Not for security. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh bench seed. Impure by nature: call it from an event, never a render. */
export function randomSeed(): number {
  return SEED_MIN + Math.floor(Math.random() * (SEED_MAX - SEED_MIN + 1));
}

/** Accepts only a well-formed seed, so a hand-edited URL cannot yield a broken bench. */
export function parseSeed(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= SEED_MIN && n <= SEED_MAX ? n : null;
}

/**
 * A different, deterministic seed derived from another, for sandboxes (a guided
 * build) that must show real values without revealing the student's own bench.
 */
export function siblingSeed(seed: number, offset = 4337): number {
  const span = SEED_MAX - SEED_MIN + 1;
  return SEED_MIN + ((((seed - SEED_MIN + offset) % span) + span) % span);
}
