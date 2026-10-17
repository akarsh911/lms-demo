'use client';

import * as React from 'react';

// Seconds left until an ISO time, ticking once a second; null until mounted or when there is no time.
export function useRemaining(iso: string | undefined): number | null {
  const target = iso ? Date.parse(iso) : Number.NaN;
  const running = Number.isFinite(target);
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!running) return;
    const tick = (): void => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [running, target]);

  if (!running || now === null) return null;
  return Math.max(0, Math.round((target - now) / 1000));
}

export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
