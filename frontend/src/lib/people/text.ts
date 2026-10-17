const SEPARATOR = ' · ';

export function joinFacts(
  parts: readonly (string | null | undefined | false)[],
): string | undefined {
  const kept = parts.filter((part): part is string => typeof part === 'string' && part !== '');
  return kept.length > 0 ? kept.join(SEPARATOR) : undefined;
}
