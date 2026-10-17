'use client';

import * as React from 'react';

import { useGenerateLessonPlan } from '@/hooks/mutation/use-lesson-planner';
import { useLessonOutline, useLessonPlans } from '@/hooks/query/use-lesson-planner';
import { useStore } from '@/hooks/use-store';
import type { GenerateRequest, LessonPlan, PlannerChapter, PlannerOffering } from '@/types/lesson-planner';

import { composerStore, patchComposer } from './composer-store';
import { DraftReview } from './draft-review';
import { GenerateProgress } from './generate-progress';
import { PlanSetup } from './plan-setup';
import type { ResourceResolver } from './use-resource-links';

function stagesFor(chapter: PlannerChapter, count: number): string[] {
  return [
    'Reading the curriculum',
    chapter.citations.length > 0 ? 'Citing textbook pages' : 'Checking the library',
    'Linking resources',
    `Sequencing ${count} ${count === 1 ? 'period' : 'periods'}`,
    'Writing blocks',
  ];
}

function subjectFor(choices: readonly PlannerOffering[], every: readonly PlannerOffering[], plans: readonly LessonPlan[], current: string | null): PlannerOffering | null {
  const planned = choices.filter((o) => o.curriculum_id);
  const previous = every.find((o) => o.offering_id === current);
  const sameSubject = previous ? planned.find((o) => o.subject_id === previous.subject_id) : undefined;
  const latest = [...plans].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).find((plan) => planned.some((o) => o.offering_id === plan.offering_id));
  const recent = latest ? planned.find((o) => o.offering_id === latest.offering_id) : undefined;
  return sameSubject ?? planned.find((o) => o.mine) ?? recent ?? (planned.length === 1 ? (planned[0] ?? null) : null);
}

export function PlanComposer({
  offerings,
  every,
  today,
  resolve,
  onSaved,
}: {
  offerings: readonly PlannerOffering[];
  every: readonly PlannerOffering[];
  today: string;
  resolve: ResourceResolver;
  onSaved: (plan: LessonPlan) => void;
}): React.ReactElement {
  const state = useStore(composerStore);
  const plans = useLessonPlans();
  const inSetup = state.phase.kind === 'setup';

  React.useEffect(() => {
    if (!inSetup || plans.isPending || offerings.some((o) => o.offering_id === state.offeringId)) return;
    const next = subjectFor(offerings, every, plans.data ?? [], state.offeringId)?.offering_id ?? null;
    if (next === state.offeringId) return;
    patchComposer({ offeringId: next, chapterId: null, topicIds: [], focusTitles: [], objectives: [], objectivesFor: null, periodCount: null });
  }, [inSetup, offerings, every, plans.isPending, plans.data, state.offeringId]);
  const generate = useGenerateLessonPlan();
  const [generating, setGenerating] = React.useState<GenerateRequest | null>(null);

  const offering = offerings.find((candidate) => candidate.offering_id === state.offeringId) ?? null;
  const outline = useLessonOutline(offering?.curriculum_id ?? null);
  const chapter = outline.data?.chapters.find((candidate) => candidate.id === state.chapterId) ?? null;

  const start = (request: GenerateRequest): void => {
    setGenerating(request);
    generate.reset();
    generate.mutate(request);
  };

  const requestFromSetup = (): GenerateRequest | null => {
    if (!offering || !chapter) return null;
    return {
      offering_id: offering.offering_id,
      curriculum_node_id: chapter.id,
      topic_ids: state.topicIds,
      focus_topics: state.focusTitles,
      period_count: state.periodCount ?? chapter.suggested_periods,
      objectives: state.objectives.filter((objective) => objective.chosen).map((objective) => objective.text),
    };
  };

  if (generating && offering && chapter) {
    return (
      <GenerateProgress
        heading={`Planning ${chapter.title}`}
        stages={stagesFor(chapter, generating.period_count)}
        done={generate.isSuccess}
        error={generate.error}
        onRetry={() => start(generating)}
        onBack={() => setGenerating(null)}
        onFinished={() => {
          const draft = generate.data;
          if (!draft) return;
          const kept = composerStore.getState();
          patchComposer({
            phase: { kind: 'draft', request: generating, draft },
            title: kept.phase.kind === 'draft' && kept.title.trim() ? kept.title : `${draft.topic_titles.length > 0 ? draft.topic_titles.join(', ') : draft.chapter_title}: ${draft.periods.length} ${draft.periods.length === 1 ? 'period' : 'periods'}`,
            startDate: kept.startDate ?? today,
          });
          setGenerating(null);
        }}
      />
    );
  }

  if (state.phase.kind === 'draft') {
    const { request, draft } = state.phase;
    return (
      <DraftReview
        draft={draft}
        title={state.title}
        startDate={state.startDate ?? today}
        resolve={resolve}
        onBack={() => patchComposer({ phase: { kind: 'setup' } })}
        onRegenerateAll={() => start(request)}
        onSaved={(plan) => {
          composerStore.dispatch({ kind: 'reset' });
          onSaved(plan);
        }}
      />
    );
  }

  return (
    <PlanSetup
      offerings={offerings}
      state={state}
      chapter={chapter}
      resolve={resolve}
      onGenerate={() => {
        const request = requestFromSetup();
        if (request) start(request);
      }}
    />
  );
}
