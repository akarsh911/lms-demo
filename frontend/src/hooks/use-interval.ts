'use client';

import * as React from 'react';

/**
 * Run `callback` every `ms` while `active`. The callback is an effect event,
 * so it always sees the latest props and state without restarting the timer
 * each time they change.
 */
export function useInterval(callback: () => void, ms: number, active = true): void {
  const tick = React.useEffectEvent(callback);
  React.useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(tick, ms);
    return () => window.clearInterval(id);
  }, [ms, active]);
}
