'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { WidgetFrame } from '@/components/widgets/widget-frame';

import { BenchBoundary } from './bench-boundary';
import { BenchCatalogue } from './bench-catalogue';
import { benchById } from './bench-registry';
import { BenchWorkspace } from './bench-workspace';
import { LabFeaturesProvider } from './lab-features';

/**
 * Virtual labs: the practical file, or the bench for whichever practical the
 * URL names (`?practical=ohms-law`).
 *
 * One widget with two states rather than two widgets: with nothing open the
 * space a bench would fill is spent on choosing one, and with a bench open the
 * catalogue is a switcher in its header. A separate catalogue card above the
 * bench pushed the apparatus below the fold and left a viewport of white
 * whenever nothing was chosen.
 *
 * Which practical is open lives in the URL, so a teacher can link a class
 * straight to "do practical 4" and it opens on the bench.
 */
/**
 * The moment before a bench opens. Deliberately the empty frame and nothing
 * else: the apparatus is drawn once, fully, rather than assembled in front of
 * the student out of skeletons of equipment that do not exist yet.
 */
function BenchLoading(): React.ReactElement {
  return (
    <WidgetFrame
      title="Opening the bench…"
      eyebrow="Class 10 Science · CBSE practical file"
      allowFullscreen={false}
      bodySx={{ backgroundColor: (t) => t.brand.canvas }}
    >
      <span />
    </WidgetFrame>
  );
}

export function BenchRunner(): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get('practical');
  const bench = benchById(requested);

  const open = React.useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params);
      if (id) next.set('practical', id);
      else next.delete('practical');
      // A different practical is a different bench: drop the old one's seed.
      next.delete('bench');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  if (!bench) return <BenchCatalogue onOpen={open} unknownId={requested} />;

  const id = bench.engine.meta.id;

  // Keyed by practical: a bench is a separate attempt with its own apparatus,
  // seed and clock, and nothing should survive a switch. The flags are fetched
  // around it rather than inside, because the workspace reads them on its very
  // first render to decide whether the tutorial opens.
  return (
    <LabFeaturesProvider key={id} bench={id} pending={<BenchLoading />}>
      {/* Outside the workspace, so it survives whatever took the workspace
          down, and inside the provider, so "try again" remounts the bench
          without re-fetching the flags. */}
      <BenchBoundary bench={id} title={bench.engine.meta.title} onLeave={() => open(null)}>
        <BenchWorkspace definition={bench} onChoosePractical={open} />
      </BenchBoundary>
    </LabFeaturesProvider>
  );
}
