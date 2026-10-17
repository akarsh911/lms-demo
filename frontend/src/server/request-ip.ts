import 'server-only';

import { headers } from 'next/headers';

/**
 * The caller's IP, as far as this server can honestly establish it.
 *
 * The header is only believed when it was set by infrastructure we control. In
 * a direct-to-Node deployment — which is what Q7 selected — there is no such
 * infrastructure, so nothing is believed and nothing is forwarded.
 *
 * The tempting version of this function reads `x-forwarded-for` and returns the
 * first entry. That entry is the one furthest from us and the most completely
 * attacker-controlled: any client can send `X-Forwarded-For: 1.2.3.4`. Since
 * CAS will shortly be configured to TRUST this app's forwarded header, passing
 * a client value through would let every user pick the IP they are rate-limited
 * and audited as.
 *
 * To enable this behind a real proxy, set `TRUSTED_PROXY_HOPS` to the number of
 * proxies in front of this app and the correct entry is counted from the RIGHT,
 * which is the only end an attacker cannot extend.
 */
export async function trustedClientIp(): Promise<string | undefined> {
  const hops = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '0', 10);
  if (!Number.isFinite(hops) || hops <= 0) return undefined;

  const h = await headers();
  const chain = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length === 0) return undefined;

  // Count from the right: entries there were appended by our own proxies.
  const index = chain.length - hops;
  const candidate = index >= 0 ? chain[index] : chain[0];
  return candidate && isIpLiteral(candidate) ? candidate : undefined;
}

function isIpLiteral(value: string): boolean {
  if (value.length > 45) return false;
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[0-9a-fA-F:]+$/;
  return v4.test(value) || v6.test(value);
}
