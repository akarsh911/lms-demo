import type { PageInfo } from '@/types/roster';

export const SCHOOL_CODE = 'DPS-NGP';

const DEFAULT_PAGE = 50;
const MAX_PAGE = 200;
const PAGING = new Set(['limit', 'offset']);

export interface Row {
  id: string;
}

export type Query = Readonly<Record<string, string | number | boolean | undefined>>;

export interface Page<T> {
  rows: T[];
  count: number;
  page: PageInfo;
}

// What a fixture refuses with; `dev()` turns it into the same ApiError a real refusal produces.
export class FixtureError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FixtureError';
  }
}

export function fail(status: number, code: string, message: string, details?: object): never {
  throw new FixtureError(status, code, message, { code, message, ...details });
}

export const notFound = (what = 'record'): never => fail(404, 'not_found', `${what} not found`);

export const byId = <T extends Row>(rows: readonly T[], id: string | undefined): T | undefined =>
  rows.find((row) => row.id === id);

export const must = <T extends Row>(rows: readonly T[], id: string | undefined, what?: string): T =>
  byId(rows, id) ?? notFound(what);

const stamp = (): string => new Date().toISOString();

export function insert<T extends Row>(rows: T[], input: Omit<T, 'id'> & Partial<Row>): T {
  const row = { created_at: stamp(), updated_at: stamp(), ...input, id: input.id ?? crypto.randomUUID() } as unknown as T;
  rows.push(row);
  return row;
}

// Replaces the row with a new object, so a cache comparing references sees the change.
export function patch<T extends Row>(rows: T[], id: string | undefined, change: Partial<T>): T | undefined {
  const at = rows.findIndex((row) => row.id === id);
  const current = rows[at];
  if (!current) return undefined;
  const next = { ...current, ...change, id: current.id, updated_at: stamp() };
  rows[at] = next;
  return next;
}

export function remove<T extends Row>(rows: T[], id: string | undefined): boolean {
  const at = rows.findIndex((row) => row.id === id);
  if (at < 0) return false;
  rows.splice(at, 1);
  return true;
}

// Keeps a row when every query key that is a column on these rows matches; keys that are not columns are ignored.
export function where<T>(rows: readonly T[], query: Query = {}): T[] {
  const filters = Object.entries(query).filter(
    ([key, value]) =>
      !PAGING.has(key) && value !== undefined && value !== '' && rows.some((row) => key in (row as object)),
  );
  return rows.filter((row) =>
    filters.every(([key, value]) => String((row as Record<string, unknown>)[key]) === String(value)),
  );
}

// The list answer every core endpoint gives: has_more is "the page came back full", and a limit over 200 falls back to 50.
export function page<T>(rows: readonly T[], query: Query = {}): Page<T> {
  const asked = Number(query.limit);
  const limit = asked > 0 && asked <= MAX_PAGE ? asked : DEFAULT_PAGE;
  const offset = Math.max(Number(query.offset) || 0, 0);
  const shown = where(rows, query).slice(offset, offset + limit);
  return { rows: shown, count: shown.length, page: { limit, offset, has_more: shown.length === limit } };
}

// A null in a patch clears the column, which is how the real routes treat it.
export const cleared = (change: object): Record<string, unknown> =>
  Object.fromEntries(Object.entries(change).map(([key, value]) => [key, value === null ? undefined : value]));
