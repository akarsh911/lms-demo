'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';

import { LearningScopeGate } from '@/components/learning-scope/learning-scope-gate';
import { PlaygroundViewer } from '@/components/playground/playground-viewer';
import { WidgetFrame } from '@/components/widgets/widget-frame';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { PLAYGROUND_PARAMS } from '@/constants/playground';
import { TIMELINE_ROUTE_KEY } from '@/constants/timeline';
import { usePlaygroundManifest } from '@/hooks/query/use-playground';
import { classParam } from '@/lib/playground/manifest';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { WidgetProps } from '@/types/widget';

export function PlaygroundWidget({ title, personaSlug, reachableLinks }: WidgetProps): React.ReactElement {
  const manifest = usePlaygroundManifest();
  const timeline = ROUTE_INDEX.get(TIMELINE_ROUTE_KEY);
  const timelineHref =
    timeline && (reachableLinks ?? []).includes(timeline.node.feature) ? paths.personaSection(personaSlug, timeline.path) : null;

  const linkedClass = classParam(useSearchParams().get(PLAYGROUND_PARAMS.class));

  if (manifest.data && manifest.data.threads.length + manifest.data.tools.length > 0) {
    const data = manifest.data;
    return (
      <LearningScopeGate
        mode="grade-only"
        grades={data.bands.flatMap((band) => band.classes)}
        legacy={{ keys: [PLAYGROUND_PARAMS.class], resolve: () => (linkedClass === null ? null : { grade: linkedClass, sections: [], learner: null }) }}
        prompt="Each class opens the playground pitched at its own band, from Tiny to Theorist."
        ungated={<PlaygroundViewer manifest={data} grade={null} timelineHref={timelineHref} />}
      >
        {(scope) => <PlaygroundViewer manifest={data} grade={scope.grade.level} timelineHref={timelineHref} />}
      </LearningScopeGate>
    );
  }

  return (
    <WidgetFrame title={title} allowFullscreen={false} bodySx={{ p: 2.5 }}>
      {manifest.isPending ? (
        <WidgetLoading rows={6} />
      ) : manifest.isError ? (
        <WidgetError error={manifest.error} onRetry={() => void manifest.refetch()} />
      ) : (
        <WidgetEmpty message="No playground pages are installed on this server yet." />
      )}
    </WidgetFrame>
  );
}
