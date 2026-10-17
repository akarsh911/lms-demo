import { SCOPE_GROUP_PREFIXES, type ScopeGroupPrefix } from '@/constants/cas';

export function scopeSlug(code: string): string {
  return code
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function scopeGroupKey(prefix: ScopeGroupPrefix, code: string): string | null {
  const slug = scopeSlug(code);
  return slug === '' ? null : `${prefix}${slug}`;
}

const UNPREFIXED_RANK = SCOPE_GROUP_PREFIXES.length;
const TENANT_RANK = UNPREFIXED_RANK + 1;

function rankOf(key: string, tenantKey: string | null): number {
  const prefixed = SCOPE_GROUP_PREFIXES.findIndex((prefix) => key.startsWith(prefix));
  if (prefixed !== -1) return prefixed;
  return tenantKey !== null && key === tenantKey ? TENANT_RANK : UNPREFIXED_RANK;
}

export function orderScopeContext(
  keys: readonly (string | null | undefined)[],
  tenantKey: string | null = null,
): string[] {
  const seen = new Set<string>();
  const ranked: { key: string; rank: number; at: number }[] = [];

  for (const raw of keys) {
    const key = raw?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    ranked.push({ key, rank: rankOf(key, tenantKey), at: ranked.length });
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map((entry) => entry.key);
}
