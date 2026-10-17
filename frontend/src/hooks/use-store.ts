'use client';

import * as React from 'react';

import type { Store } from '@/lib/store';

/**
 * Subscribe a component to a `lib/store` store. It re-renders only when the
 * reducer returned a new state, which is why reducers there return the same
 * object for a no-op.
 */
export function useStore<S, A>(store: Store<S, A>): S {
  return React.useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
