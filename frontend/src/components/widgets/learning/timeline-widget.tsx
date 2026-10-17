'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';

import { LearningScopeGate } from '@/components/learning-scope/learning-scope-gate';
import { TimelineViewer } from '@/components/timeline/timeline-viewer';
import { WidgetFrame } from '@/components/widgets/widget-frame';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { usePlaygroundManifest } from '@/hooks/query/use-playground';
import { TIMELINE_CLASSES, TIMELINE_PARAMS } from '@/constants/timeline';
import { useTimelineData } from '@/hooks/query/use-timeline';
import { timelineClass } from '@/lib/timeline/model';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { WidgetProps } from '@/types/widget';

const PLAYGROUND_ROUTE_KEY = 'learning-playground';

export function TimelineWidget({ title, personaSlug, reachableLinks }: WidgetProps): React.ReactElement {
  const timeline = useTimelineData();
  const manifest = usePlaygroundManifest();
  const playground = ROUTE_INDEX.get(PLAYGROUND_ROUTE_KEY);
  const playgroundHref =
    playground && (reachableLinks ?? []).includes(playground.node.feature) ? paths.personaSection(personaSlug, playground.path) : null;

  const linkedClass = timelineClass(useSearchParams().get(TIMELINE_PARAMS.class));

  if (timeline.data) {
    const data = timeline.data;
    return (
      <LearningScopeGate
        mode="grade-only"
        grades={TIMELINE_CLASSES}
        legacy={{ keys: [TIMELINE_PARAMS.class], resolve: () => (linkedClass === null ? null : { grade: linkedClass, sections: [], learner: null }) }}
        prompt="The timeline opens on this class's history chapters. A search still reaches every class."
        ungated={<TimelineViewer data={data} grade={null} manifest={manifest.data} playgroundHref={playgroundHref} />}
      >
        {(scope) => (
          <TimelineViewer key={scope.grade.level} data={data} grade={scope.grade.level} manifest={manifest.data} playgroundHref={playgroundHref} />
        )}
      </LearningScopeGate>
    );
  }

  return (
    <WidgetFrame title={title} allowFullscreen={false} bodySx={{ p: 2.5 }}>
      {timeline.isError ? <WidgetError error={timeline.error} onRetry={() => void timeline.refetch()} /> : <WidgetLoading rows={8} />}
    </WidgetFrame>
  );
}
