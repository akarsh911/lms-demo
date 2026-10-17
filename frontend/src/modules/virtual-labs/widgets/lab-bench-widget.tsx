'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';

import type { WidgetProps } from '@/types/widget';

import { WidgetFrame } from '@/components/widgets/widget-frame';
import { WidgetLoading } from '@/components/widgets/widget-states';

/**
 * The bench a student works at, for whichever practical the page has open.
 *
 * Registered `presentation: 'immersive'`: the grid gives it the full row and
 * the viewport's height, and its frame can go fullscreen. Which practical runs
 * is `?practical=` in the URL; the catalogue above sets it.
 *
 * Loaded client-side only, and on demand. A bench is seeded at random, reads
 * local storage and drives animation frames, none of which exists on the
 * server, and the apparatus drawings are the heaviest code on the page.
 *
 * The four states: LOADING is the frame below while the bench's code arrives;
 * ERROR is the `WidgetBoundary` round every widget, plus the bench's own
 * "attempt not saved" line; EMPTY is the "choose a practical" card inside the
 * runner; the rest is DATA.
 */
const BenchRunner = dynamic(() => import('@labs/components/bench-runner').then((m) => m.BenchRunner), {
  ssr: false,
  loading: () => (
    <WidgetFrame title="Virtual lab" allowFullscreen={false} bodySx={{ p: 2 }}>
      <WidgetLoading rows={6} />
    </WidgetFrame>
  ),
});

export function LabBenchWidget(_: WidgetProps): React.ReactElement {
  return <BenchRunner />;
}
