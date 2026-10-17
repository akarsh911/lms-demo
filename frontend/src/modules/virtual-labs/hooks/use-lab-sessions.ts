'use client';

import * as React from 'react';

import {
  NO_SESSIONS,
  sessionsSnapshot,
  subscribeSessions,
} from '@labs/lib/session-store';
import type { LabSessionRecord } from '@labs/lib/session-record';

/**
 * Every unfinished practical on this machine, newest first.
 *
 * Through `useSyncExternalStore` rather than an effect, for the reason it
 * exists: storage is read DURING render from a snapshot the store keeps stable,
 * so there is no first paint with an empty dock followed by a second with a
 * full one. The server snapshot is the shared empty array — there is no storage
 * there, and hydration has to agree with what was rendered.
 */
export function useLabSessions(): readonly LabSessionRecord[] {
  return React.useSyncExternalStore(subscribeSessions, sessionsSnapshot, () => NO_SESSIONS);
}
