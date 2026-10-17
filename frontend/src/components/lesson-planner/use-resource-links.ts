'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChartGantt, FileCheck, Layers, MessagesSquare, Network, Shapes, Wrench } from 'lucide-react';

import { DEBATE_PARAMS } from '@/constants/debate';
import { FLASHCARDS_LINK_PARAMS } from '@/constants/flashcards';
import { MINDMAP_ROUTE_KEY } from '@/constants/mindmap';
import { PAPER_SETTER_PARAMS, PAPER_SETTER_ROUTE_KEY } from '@/constants/paper-setter';
import { PLAYGROUND_PARAMS } from '@/constants/playground';
import { TIMELINE_PARAMS, TIMELINE_ROUTE_KEY, TIMELINE_TOOL_ID } from '@/constants/timeline';
import type { FeatureKey } from '@/constants/features';
import { usePlaygroundManifest } from '@/hooks/query/use-playground';
import { mindmapQuery } from '@/lib/mindmap/deep-link';
import { bandOfClass, pageIn } from '@/lib/playground/manifest';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { LessonResource } from '@/types/lesson-planner';
import type { PlaygroundManifest } from '@/types/playground';

export interface ResolvedResource {
  key: string;
  href: string;
  label: string;
  Icon: LucideIcon;
}

export interface ResourceContext {
  grade: number;
  subject: string;
  chapterId: string;
  topic: string | null;
  sectionLabel: string;
}

const SECTION_LABEL_SEPARATOR = ' · ';

export const sectionNameOf = (sectionLabel: string): string => sectionLabel.split(SECTION_LABEL_SEPARATOR).at(-1) ?? sectionLabel;

export type ResourceResolver = (resource: LessonResource, context?: ResourceContext) => ResolvedResource | null;

function quizQuery(context: ResourceContext, title: string): string {
  const query = new URLSearchParams({
    [PAPER_SETTER_PARAMS.grade]: String(context.grade),
    [PAPER_SETTER_PARAMS.subject]: context.subject,
    [PAPER_SETTER_PARAMS.chapter]: context.chapterId,
    [PAPER_SETTER_PARAMS.section]: sectionNameOf(context.sectionLabel),
    [PAPER_SETTER_PARAMS.title]: title,
  });
  if (context.topic) query.set(PAPER_SETTER_PARAMS.topic, context.topic);
  return query.toString();
}

const ROUTE_KEYS = {
  mindmap: MINDMAP_ROUTE_KEY,
  playground: 'learning-playground',
  flashcards: 'learning-flashcards',
  paper_setter: PAPER_SETTER_ROUTE_KEY,
  debate: 'learning-debate',
  timeline: TIMELINE_ROUTE_KEY,
} as const;

function routeBase(key: string, personaSlug: string, reachable: readonly FeatureKey[]): string | null {
  const route = ROUTE_INDEX.get(key);
  if (!route || !reachable.includes(route.node.feature)) return null;
  return paths.personaSection(personaSlug, route.path);
}

function playgroundLabel(manifest: PlaygroundManifest | undefined, threadId: string, grade: number): string | null {
  if (!manifest) return null;
  const thread = manifest.threads.find((candidate) => candidate.id === threadId);
  const band = bandOfClass(manifest, grade);
  const page = thread && band ? pageIn(thread, band.id) : null;
  return page ? page.title : null;
}

export function useResourceLinks(personaSlug: string, reachable: readonly FeatureKey[]): ResourceResolver {
  const manifest = usePlaygroundManifest();

  return React.useCallback<ResourceResolver>(
    (resource, context) => {
      switch (resource.kind) {
        case 'mindmap': {
          const base = routeBase(ROUTE_KEYS.mindmap, personaSlug, reachable);
          const range = resource.page_start !== null && resource.page_end !== null ? { from: resource.page_start, to: resource.page_end } : null;
          return base
            ? { key: `mindmap-${resource.item_id}-${resource.section_id}`, href: `${base}?${mindmapQuery({ itemId: resource.item_id, sectionId: resource.section_id, range })}`, label: resource.title, Icon: Network }
            : null;
        }
        case 'playground': {
          const base = routeBase(ROUTE_KEYS.playground, personaSlug, reachable);
          const title = playgroundLabel(manifest.data, resource.thread_id, resource.grade);
          if (!base || !title) return null;
          const query = new URLSearchParams({ [PLAYGROUND_PARAMS.class]: String(resource.grade), [PLAYGROUND_PARAMS.thread]: resource.thread_id });
          return { key: `playground-${resource.thread_id}`, href: `${base}?${query.toString()}`, label: `Playground · ${title}`, Icon: Shapes };
        }
        case 'playground_tool': {
          if (resource.tool_id === TIMELINE_TOOL_ID) {
            const timeline = routeBase(ROUTE_KEYS.timeline, personaSlug, reachable);
            const query = new URLSearchParams({ [TIMELINE_PARAMS.class]: String(resource.grade) });
            return timeline ? { key: 'timeline', href: `${timeline}?${query.toString()}`, label: 'Timeline', Icon: ChartGantt } : null;
          }
          const base = routeBase(ROUTE_KEYS.playground, personaSlug, reachable);
          const tool = manifest.data?.tools.find((candidate) => candidate.id === resource.tool_id && candidate.classes.includes(resource.grade));
          if (!base || !tool) return null;
          const query = new URLSearchParams({ [PLAYGROUND_PARAMS.tool]: tool.id });
          return { key: `tool-${tool.id}`, href: `${base}?${query.toString()}`, label: `Tool · ${tool.title}`, Icon: Wrench };
        }
        case 'flashcards': {
          const base = routeBase(ROUTE_KEYS.flashcards, personaSlug, reachable);
          const query = new URLSearchParams({ [FLASHCARDS_LINK_PARAMS.chapter]: resource.chapter_id });
          return base ? { key: `flashcards-${resource.chapter_id}`, href: `${base}?${query.toString()}`, label: resource.title, Icon: Layers } : null;
        }
        case 'paper_setter': {
          const base = routeBase(ROUTE_KEYS.paper_setter, personaSlug, reachable);
          if (!base) return null;
          return { key: 'paper-setter', href: context ? `${base}?${quizQuery(context, resource.title)}` : base, label: `${resource.title} (${resource.question_count} questions)`, Icon: FileCheck };
        }
        case 'debate': {
          const base = routeBase(ROUTE_KEYS.debate, personaSlug, reachable);
          const query = new URLSearchParams({ [DEBATE_PARAMS.motion]: resource.motion_id });
          return base ? { key: `debate-${resource.motion_id}`, href: `${base}?${query.toString()}`, label: resource.title, Icon: MessagesSquare } : null;
        }
        default: {
          const unreachable: never = resource;
          return unreachable;
        }
      }
    },
    [manifest.data, personaSlug, reachable],
  );
}
