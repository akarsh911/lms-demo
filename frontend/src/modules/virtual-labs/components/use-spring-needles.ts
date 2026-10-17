'use client';

import * as React from 'react';

import { DIAL_STOP } from './analog-dial';

/**
 * Meter needles with inertia: they swing towards their reading, overshoot a
 * little and settle, and bounce off the end stops when over-ranged. A real
 * moving-coil meter does exactly this, and "wait for the needle to settle" is
 * part of reading one.
 *
 * Animated by writing each needle's `transform` directly, once per frame, NOT
 * through React state: sixty renders a second of a whole bench to move two
 * lines would be all cost. Several needles can show one meter (the bench and
 * its close-up lens), so each meter keeps a set of elements.
 *
 * With `prefers-reduced-motion`, needles jump straight to their reading.
 *
 * Returns one callback ref per meter, created once: `ref={needles.am}`. The
 * SAME ref may be given to several elements — a dial on the bench and its
 * magnified copy in the console — and all of them move together.
 *
 * That last part is why each ref returns a CLEANUP rather than tracking "the
 * element I am attached to". A callback ref holding one element cannot serve
 * two: the second to mount evicts the first, which then sits frozen at zero for
 * the rest of the practical, and nothing announces it. React 19 calls the
 * returned cleanup for the element that is actually going away, so the set
 * stays honest however many needles share a meter.
 */
/** A callback ref that returns React 19's detach cleanup. */
export type NeedleRef = (el: SVGGElement | null) => (() => void) | undefined;

export function useSpringNeedles<K extends string>(
  targets: Readonly<Record<K, number>>,
): Readonly<Record<K, NeedleRef>> {
  const targetsRef = React.useRef(targets);
  React.useEffect(() => {
    targetsRef.current = targets;
  }, [targets]);

  const elements = React.useRef(new Map<K, Set<SVGGElement>>());

  // Created once. Each callback only touches the element map when React
  // attaches or detaches a needle, never during render.
  const [refs] = React.useState(() => {
    const out = {} as Record<K, NeedleRef>;
    for (const meter of Object.keys(targets) as K[]) {
      out[meter] = (el) => {
        if (!el) return undefined;
        let set = elements.current.get(meter);
        if (!set) {
          set = new Set();
          elements.current.set(meter, set);
        }
        set.add(el);
        return () => {
          set.delete(el);
        };
      };
    }
    return out;
  });

  React.useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const physics = new Map<K, { th: number; w: number }>();
    let last = performance.now();
    let frame = 0;

    const loop = (t: number): void => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      for (const [meter, els] of elements.current) {
        const target = targetsRef.current[meter];
        let n = physics.get(meter);
        if (!n) {
          n = { th: target, w: 0 };
          physics.set(meter, n);
        }
        if (reduce) {
          n.th = target;
        } else {
          n.w += (160 * (target - n.th) - 13 * n.w) * dt;
          n.th += n.w * dt;
          if (n.th > DIAL_STOP) {
            n.th = DIAL_STOP;
            n.w = -n.w * 0.3;
          }
          if (n.th < -DIAL_STOP) {
            n.th = -DIAL_STOP;
            n.w = -n.w * 0.3;
          }
        }
        const transform = `rotate(${n.th.toFixed(2)} 100 118)`;
        for (const el of els) el.setAttribute('transform', transform);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return refs;
}
