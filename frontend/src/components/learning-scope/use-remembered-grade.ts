'use client';

import * as React from 'react';

import { useIdentity } from '@/hooks/query/use-identity';

import { recallScope } from './scope-memory';

const noSubscription = (): (() => void) => () => undefined;

export function useRememberedGrade(): number | null {
  const userId = useIdentity().data?.cas_user_id ?? null;
  return React.useSyncExternalStore(
    noSubscription,
    () => (userId ? (recallScope(userId)?.grade ?? null) : null),
    () => null,
  );
}
