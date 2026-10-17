/**
 * A minimal synchronous store: one reducer, one state, many subscribers.
 *
 * Used where a widget's state changes from several sources that are not React
 * events (an animation frame, a physics interval, a guided tour's watcher) and
 * where an event handler needs the state that its own dispatch produced, which
 * `useReducer` cannot give it. `hooks/use-store.ts` binds it to React through
 * `useSyncExternalStore`, so a render always sees one consistent state.
 *
 * Pure: no React, no DOM. The reducer must return the SAME object when nothing
 * changed, which is what lets an idle interval tick without re-rendering.
 */
export interface Store<S, A> {
  getState: () => S;
  /** Applies the action and returns the resulting state, synchronously. */
  dispatch: (action: A) => S;
  /** Replaces the state outright, e.g. to swap in a sandbox copy. */
  replace: (next: S) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createStore<S, A>(reducer: (state: S, action: A) => S, initial: S): Store<S, A> {
  let state = initial;
  const listeners = new Set<() => void>();

  const commit = (next: S): void => {
    if (Object.is(next, state)) return;
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    dispatch: (action) => {
      commit(reducer(state, action));
      return state;
    },
    replace: commit,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
