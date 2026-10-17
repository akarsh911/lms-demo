import { config } from '@/config';
import { capabilities, identity, updatePerson } from '@/fixtures/identity';

import { coreApi } from './api';
import { dev } from './dev-bypass';
import type {
  CapabilitiesResponse,
  CoreIdentity,
  CorePerson,
  PersonUpdate,
} from '@/types/core';

/**
 * `emerge-core` — the school's own record.
 *
 * Transport only, like every other service file: endpoints and their types, no
 * caching and no React. Paths are relative to `CORE_API_URL`, which carries the
 * `/api/v1` prefix, so they read as the router writes them.
 *
 * The tenant header these routes require is attached by the proxy from the
 * sealed session and is deliberately not expressible here — see
 * `server/core/tenant.ts`. Nothing in this file, or anything that imports it,
 * can choose a school.
 */
export const coreService = {
  /**
   * The caller: their CAS id, the school, which endpoints to address, and their
   * own person row. Every field is subject to the caller's field policy, so
   * treat an absent one as withheld rather than empty — `lib/core/fields.ts`
   * is where that distinction is drawn.
   */
  getIdentity: (signal?: AbortSignal) =>
    config.devBypass ? dev(identity) : coreApi.get<CoreIdentity>('auth/me', undefined, signal),

  /**
   * What the caller may do, already narrowed to their grants.
   *
   * It DESCRIBES, it never decides. Use it to choose what to offer; never in
   * place of calling the endpoint and handling its refusal.
   */
  getCapabilities: (signal?: AbortSignal) =>
    config.devBypass ? dev(capabilities) : coreApi.get<CapabilitiesResponse>('capabilities', undefined, signal),

  /**
   * Edit a person.
   *
   * A field the caller may not write is a **403 naming the columns**
   * (`not permitted to write: email, phone`), decided before anything is
   * saved — so a refused submission changes nothing. `cas_user_id` is not in
   * `PersonUpdate` at all: the handler accepts the key and never applies it.
   */
  updatePerson: (id: string, patch: PersonUpdate) =>
    config.devBypass ? dev(() => updatePerson(id, patch)) : coreApi.patch<CorePerson>(`persons/${id}`, patch),
};
