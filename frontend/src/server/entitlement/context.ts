import 'server-only';

import { BRANCH_PREFIX, GRADE_PREFIX, SECTION_PREFIX } from '@/constants/cas';
import { serviceBaseUrl } from '@/constants/services';
import { orderScopeContext, scopeGroupKey } from '@/lib/entitlement/context';
import { logger } from '@/lib/logger';
import { recordExchange } from '@/server/dev/record';
import { coreIdentity } from '@/server/core/tenant';
import type { SessionPayload } from '@/server/session/cookie';
import type { GroupRef } from '@/types/cas';
import type { CoreIdentity, CoreSection } from '@/types/core';

const MAX_ACADEMIC_SECTIONS = 32;

export interface ScopeContext {
  keys: string[];
  tenantKey: string | null;
  academicKeys: string[];
  membershipKeys: string[];
}

export const EMPTY_SCOPE_CONTEXT: ScopeContext = {
  keys: [],
  tenantKey: null,
  academicKeys: [],
  membershipKeys: [],
};

export async function resolveScopeContext(
  session: SessionPayload,
  groups: readonly GroupRef[],
): Promise<ScopeContext> {
  const identity = await coreIdentity(session).catch((cause) => {
    logger.warn('emerge-core could not be asked for the academic scope', { cause });
    return null;
  });

  const tenantKey = identity?.school?.cas_tenant_id?.trim() || null;
  const academicKeys = await academicScopeKeys(session, identity);
  const membershipKeys = groups
    .map((group) => group.key)
    .filter((key): key is string => typeof key === 'string' && key.trim() !== '');

  return {
    keys: orderScopeContext([...academicKeys, ...membershipKeys], tenantKey),
    tenantKey,
    academicKeys,
    membershipKeys,
  };
}

async function academicScopeKeys(
  session: SessionPayload,
  identity: CoreIdentity | null,
): Promise<string[]> {
  const sectionIds = identity?.roles?.section_ids ?? [];
  if (sectionIds.length === 0) return [];

  const base = serviceBaseUrl('core');
  const schoolId = identity?.school?.school_id;
  if (!base || !schoolId) return [];

  const sections = await Promise.all(
    sectionIds
      .slice(0, MAX_ACADEMIC_SECTIONS)
      .map((id) => fetchSection(base, schoolId, session.accessToken, id)),
  );

  const keys: (string | null)[] = [];
  for (const section of sections) {
    if (!section) continue;
    keys.push(section.code ? scopeGroupKey(SECTION_PREFIX, section.code) : null);
    const grade = section.edges?.grade_level?.code;
    keys.push(grade ? scopeGroupKey(GRADE_PREFIX, grade) : null);
    const branch = section.edges?.branch?.code;
    keys.push(branch ? scopeGroupKey(BRANCH_PREFIX, branch) : null);
  }

  return orderScopeContext(keys);
}

async function fetchSection(
  base: string,
  schoolId: string,
  accessToken: string,
  id: string,
): Promise<CoreSection | null> {
  try {
    const res = await fetch(`${base}/sections/${encodeURIComponent(id)}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-school-id': schoolId,
      },
      cache: 'no-store',
    });
    void recordExchange('core', 'GET', `sections/${id}`, '', res.clone());
    if (!res.ok) {
      logger.warn(
        `emerge-core would not name section ${id} (${res.status}), so its grade ` +
          'and section scope are missing from the evaluate context.',
      );
      return null;
    }
    return (await res.json()) as CoreSection;
  } catch (cause) {
    logger.warn('emerge-core is unreachable while naming a section', { cause });
    return null;
  }
}
