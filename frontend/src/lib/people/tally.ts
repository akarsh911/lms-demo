export interface Tallied {
  value: string;
  count: number;
}

export function tally(values: readonly (string | undefined | null)[]): Tallied[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (typeof value !== 'string' || value === '') continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function totalOf(rows: readonly Tallied[]): number {
  return rows.reduce((sum, row) => sum + row.count, 0);
}
