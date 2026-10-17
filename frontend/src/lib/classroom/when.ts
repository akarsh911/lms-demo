export function toInstant(local: string): string | undefined {
  if (local === '') return undefined;
  const at = new Date(local);
  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

export function isFuture(local: string): boolean {
  if (local === '') return false;
  const at = new Date(local);
  return !Number.isNaN(at.getTime()) && at.getTime() > Date.now();
}
