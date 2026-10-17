'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import { useSearchParams } from 'next/navigation';

import { TabBar, TabPanel, type TabSpec } from '@/components/classroom/tabbed';
import { LearningScopeGate, type LegacyScope } from '@/components/learning-scope/learning-scope-gate';
import { choiceOfSection, type MultiScope, type SectionSeed } from '@/components/learning-scope/scope-model';
import { useUrlState } from '@/components/school/url-state';
import { useToast } from '@/components/ui/toast';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useFetchOutline, useLessonPlannerContext } from '@/hooks/query/use-lesson-planner';
import { formatShortDate } from '@/lib/dates';
import type { LessonPlan, PlannerOffering } from '@/types/lesson-planner';
import type { WidgetProps } from '@/types/widget';

import { composerStore, patchComposer } from './composer-store';
import { PlanComposer } from './plan-composer';
import { PlanList } from './plan-list';
import { SavedPlan } from './saved-plan';
import { TermPlan } from './term-plan';
import type { PlanRequest } from './term-ribbon';
import { sectionNameOf, useResourceLinks } from './use-resource-links';
import { WeekView } from './week-view';

const ID_PREFIX = 'lesson-planner';
const DEFAULT_TAB = 'term';
const MAX_PERIODS = 8;
const SCOPE_CARRIERS = ['section', 'offering'] as const;
const LINK_PARAMS = { offering: 'offering', chapter: 'chapter', topic: 'topic' } as const;

function inScope(offerings: readonly PlannerOffering[], scope: MultiScope): PlannerOffering[] {
  const ids = new Set(scope.sections.map((section) => section.id));
  return offerings.filter((offering) => ids.has(offering.section_id));
}

function sectionSeeds(offerings: readonly PlannerOffering[]): SectionSeed[] {
  const bySection = new Map(offerings.map((o) => [o.section_id, o]));
  return [...bySection.values()].map((o) => ({ id: o.section_id, grade: o.grade, name: sectionNameOf(o.section_label) }));
}

function termDefault(offerings: readonly PlannerOffering[], requested: string | null): string | null {
  if (offerings.some((o) => o.offering_id === requested)) return requested;
  return (offerings.find((o) => o.mine && o.curriculum_id) ?? offerings.find((o) => o.curriculum_id) ?? offerings[0])?.offering_id ?? null;
}

const TABS: readonly TabSpec[] = [
  { slug: 'term', label: 'Term plan' },
  { slug: 'plan', label: 'New lesson' },
  { slug: 'plans', label: 'Plans' },
  { slug: 'week', label: 'This week' },
];

function savedMessage(plan: LessonPlan): string {
  const first = plan.periods.find((period) => period.slot)?.slot;
  return first ? `Plan saved, first lesson ${formatShortDate(first.date)}` : 'Plan saved, not scheduled'
}

export function LessonPlannerWidget({ personaSlug, reachableLinks = [] }: WidgetProps): React.ReactElement {
  const { get, put } = useUrlState();
  const notify = useToast();
  const context = useLessonPlannerContext();
  const resolve = useResourceLinks(personaSlug, reachableLinks);
  const fetchOutline = useFetchOutline();

  const params = useSearchParams();
  const linkOffering = params.get(LINK_PARAMS.offering);
  const linkChapter = params.get(LINK_PARAMS.chapter);
  const linkTopics = JSON.stringify(params.getAll(LINK_PARAMS.topic).map((value) => value.trim()).filter(Boolean));
  const offeringsLoaded = context.data?.offerings;

  React.useEffect(() => {
    if (!linkChapter || !offeringsLoaded) return;
    const offering = offeringsLoaded.find((o) => o.offering_id === linkOffering);
    const clear = { chapter: null, topic: null };
    if (!offering?.curriculum_id) {
      put(clear);
      return;
    }
    let cancelled = false;
    void fetchOutline(offering.curriculum_id).then((outline) => {
      if (cancelled) return;
      const chapter = outline.chapters.find((candidate) => candidate.id === linkChapter);
      const wanted: string[] = JSON.parse(linkTopics);
      const matched = chapter ? chapter.topics.filter((topic) => wanted.includes(topic.id) || wanted.includes(topic.title)) : [];
      const topicIds = matched.map((topic) => topic.id);
      const focusTitles = wanted.filter((value) => !matched.some((topic) => topic.id === value || topic.title === value));
      composerStore.dispatch({ kind: 'reset' });
      patchComposer({
        offeringId: offering.offering_id,
        ...(chapter
          ? {
              chapterId: chapter.id,
              topicIds,
              focusTitles,
              periodCount: Math.min(wanted.length > 0 ? wanted.length : chapter.suggested_periods, MAX_PERIODS),
              objectives: chapter.objectives.map((text) => ({ text, chosen: true, custom: false })),
              objectivesFor: chapter.id,
            }
          : {}),
      });
      put({ ...clear, tab: 'plan', plan: null, section: offering.section_id, grade: null, sections: null });
    });
    return () => {
      cancelled = true;
    };
  }, [linkChapter, linkTopics, linkOffering, offeringsLoaded, fetchOutline, put]);

  const requested = get('tab');
  const tab = TABS.some((spec) => spec.slug === requested) ? (requested ?? DEFAULT_TAB) : DEFAULT_TAB;
  const planId = get('plan');

  const openPlan = (id: string): void => put({ tab: 'plans', plan: id });
  const toComposer = (offering: PlannerOffering | undefined): void =>
    put({ tab: 'plan', plan: null, ...(offering ? { section: offering.section_id, grade: null, sections: null } : {}) });

  const planChapter = async (offering: PlannerOffering, request: PlanRequest): Promise<void> => {
    const outline = await fetchOutline(offering.curriculum_id ?? '');
    const chapter = outline.chapters.find((candidate) => candidate.id === request.chapterId);
    if (!chapter) return;
    composerStore.dispatch({ kind: 'reset' });
    patchComposer({
      offeringId: offering.offering_id,
      chapterId: chapter.id,
      periodCount: Math.min(Math.max(request.periods, 1), MAX_PERIODS),
      objectives: chapter.objectives.map((text) => ({ text, chosen: true, custom: false })),
      objectivesFor: chapter.id,
      startDate: request.firstDate,
    });
    toComposer(offering);
  };

  const planFor = (offeringId: string): void => {
    composerStore.dispatch({ kind: 'reset' });
    patchComposer({ offeringId });
    toComposer(context.data?.offerings.find((o) => o.offering_id === offeringId));
  };

  const body = (): React.ReactNode => {
    if (context.isPending) return <WidgetLoading rows={6} />;
    if (context.isError) return <WidgetError error={context.error} onRetry={() => void context.refetch()} />;
    if (context.data.offerings.length === 0) {
      return <WidgetEmpty message="No classes on the timetable" />;
    }
    const { offerings, today } = context.data;
    const grades = [...new Set(offerings.map((o) => o.grade))].sort((a, b) => a - b);
    const carried = get('section') ?? offerings.find((o) => o.offering_id === get('offering'))?.section_id ?? null;
    const legacy: LegacyScope = { keys: SCOPE_CARRIERS, resolve: (options) => choiceOfSection(options, carried) };
    const seeds = sectionSeeds(offerings);
    const termPlan = (choices: readonly PlannerOffering[]): React.ReactNode => (
      <TermPlan
        offerings={choices}
        offeringId={termDefault(choices, get('offering'))}
        onOffering={(offeringId) => put({ offering: offeringId })}
        onPlan={(offering, request) => void planChapter(offering, request)}
      />
    );
    const composer = (choices: readonly PlannerOffering[]): React.ReactNode => (
      <PlanComposer
        offerings={choices}
        every={offerings}
        today={today}
        resolve={resolve}
        onSaved={(plan) => {
          notify(savedMessage(plan));
          openPlan(plan.id);
        }}
      />
    );
    const plans = (offeringIds: ReadonlySet<string> | null): React.ReactNode => <PlanList personaSlug={personaSlug} today={today} offeringIds={offeringIds} onOpen={openPlan} />;
    const week = (sectionIds: readonly string[] | null): React.ReactNode => <WeekView sectionIds={sectionIds} today={today} onOpenPlan={openPlan} onPlanFor={planFor} />;
    return (
      <>
        <TabPanel slug="term" current={tab} idPrefix={ID_PREFIX}>
          <LearningScopeGate mode="multi" grades={grades} legacy={legacy} fallback={seeds} ungated={termPlan(offerings)} prompt="Pick the sections whose term you are pacing.">
            {(scope) => termPlan(inScope(offerings, scope))}
          </LearningScopeGate>
        </TabPanel>
        <TabPanel slug="plan" current={tab} idPrefix={ID_PREFIX}>
          <LearningScopeGate mode="single" grades={grades} legacy={legacy} fallback={seeds} ungated={composer(offerings)} prompt="Pick the section you are planning a lesson for.">
            {(scope) => composer(inScope(offerings, scope))}
          </LearningScopeGate>
        </TabPanel>
        <TabPanel slug="plans" current={tab} idPrefix={ID_PREFIX}>
          {planId ? (
            <SavedPlan key={planId} planId={planId} personaSlug={personaSlug} resolve={resolve} onBack={() => put({ plan: null })} />
          ) : (
            <LearningScopeGate mode="multi" preferMine grades={grades} legacy={legacy} fallback={seeds} ungated={plans(null)} prompt="Pick the sections whose plans you want to see.">
              {(scope) => plans(new Set(inScope(offerings, scope).map((o) => o.offering_id)))}
            </LearningScopeGate>
          )}
        </TabPanel>
        <TabPanel slug="week" current={tab} idPrefix={ID_PREFIX}>
          <LearningScopeGate mode="multi" preferMine grades={grades} legacy={legacy} fallback={seeds} ungated={week(null)} prompt="Pick the sections whose week you want to see.">
            {(scope) => week(scope.grade ? scope.sections.map((section) => section.id) : null)}
          </LearningScopeGate>
        </TabPanel>
      </>
    );
  };

  return (
    <Stack>
      <TabBar tabs={TABS} current={tab} onSelect={(slug) => put({ tab: slug, plan: null })} idPrefix={ID_PREFIX} />
      {body()}
    </Stack>
  );
}
