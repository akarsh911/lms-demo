'use client';

import * as React from 'react';

/**
 * Whether this student has asked their system for less motion.
 *
 * A media query is an external store, so it is read as one: no effect, no
 * setState on mount, and no first render that claims motion is fine before
 * correcting itself. It also keeps up if the preference changes while a bench
 * is open.
 *
 * Most motion on a bench is CSS and never needs this — `bench-motion.ts` stops
 * it with a media query, which is simpler and cannot get out of step. This is
 * for the few places where the PREFERENCE CHANGES THE TIMING rather than just
 * switching an animation off: a demonstration that glides a pointer has to know
 * not to wait for a glide that will never happen.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

const get = (): boolean => window.matchMedia(QUERY).matches;

/** Server-rendered output assumes motion is fine; the client corrects on hydration. */
const getServer = (): boolean => false;

export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribe, get, getServer);
}
