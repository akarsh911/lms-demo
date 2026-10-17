'use client';

import * as React from 'react';

import { newRecord, writeSession } from '@labs/lib/session-store';
import type { BenchEngine } from '@labs/types/lab-bench';

/**
 * KEEP THE BENCH, so that closing the tab is not the same as throwing the
 * practical away.
 *
 * WHY IT IS DEBOUNCED AND NOT WRITTEN ON EVERY ACTION. Several benches tick at
 * 10 Hz, and a `JSON.stringify` of the whole state on every tick would be a
 * measurable cost for no gain — a student cannot lose a tenth of a second of
 * work. Waiting until the actions STOP writes once per burst instead, so
 * dragging a rheostat from one end to the other is one save rather than sixty,
 * and what is on disk is never more than a second behind.
 *
 * WHY THE CLEANUP SAVES TOO. A debounce alone loses the last burst whenever a
 * student navigates away inside the window — which is precisely the moment the
 * save was for. So the timer covers working, and unmount and `pagehide` cover
 * leaving. `pagehide` rather than `beforeunload`: it is the one that fires when
 * a phone browser is backgrounded, which is how a tab most often ends.
 *
 * The state handed in must be the PRACTICAL's. A tour and the trainer run on a
 * sandbox copy, and saving that would resume the student into a rehearsal.
 */

const SAVE_AFTER_MS = 900;

export function useBenchSession<S, A>({
  engine,
  state,
  shape,
  seed,
  startedAt,
  endedAt,
  done,
  enabled,
}: {
  engine: BenchEngine<S, A>;
  /** The practical, never a tour's sandbox. */
  state: S;
  /** Fingerprint of a FRESH bench from this build. See `session-record.ts`. */
  shape: string;
  seed: number | null;
  /**
   * The bench's clock, as the two timestamps rather than a duration.
   *
   * A duration computed in the render body would be the elapsed time AT THE
   * LAST RENDER, and this saves long after that — a bench that has not
   * re-rendered for a minute would record a minute less than the student has
   * actually spent. The subtraction therefore happens at save time, here.
   */
  startedAt: number | null;
  /** Set once the practical is over, which freezes the clock where it stopped. */
  endedAt: number | null;
  done: boolean;
  /** False switches saving off entirely — no record is written or updated. */
  enabled: boolean;
}): void {
  const save = React.useEffectEvent((): void => {
    if (!enabled) return;
    const at = Date.now();
    const marks = engine.marks;
    writeSession(
      newRecord({
        bench: engine.meta.id,
        shape,
        seed,
        savedAt: at,
        title: engine.meta.title,
        subtitle: engine.meta.subtitle,
        step: engine.step(state),
        steps: engine.steps.length,
        score: engine.score(state).total,
        max: marks.reduce((a, m) => a + m.max, 0),
        elapsedMs: startedAt === null ? 0 : Math.max(0, (endedAt ?? at) - startedAt),
        done,
        state,
      }),
    );
  });

  // The burst: every change restarts the clock, so one write per pause.
  React.useEffect(() => {
    if (!enabled) return undefined;
    const id = window.setTimeout(save, SAVE_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [state, enabled]);

  // Leaving: the tab going away, and this bench being unmounted or switched.
  React.useEffect(() => {
    if (!enabled) return undefined;
    const flush = (): void => save();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [enabled]);
}
