'use client';

import * as React from 'react';

import { DEBATE_PARAMS } from '@/constants/debate';
import type { FeatureKey } from '@/constants/features';
import { FLASHCARDS_LINK_PARAMS } from '@/constants/flashcards';
import { MINDMAP_ROUTE_KEY } from '@/constants/mindmap';
import { PAPER_SETTER_PARAMS, PAPER_SETTER_ROUTE_KEY } from '@/constants/paper-setter';
import { PLAYGROUND_PARAMS } from '@/constants/playground';
import { mindmapQuery } from '@/lib/mindmap/deep-link';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { GapAction, GapRef } from '@/types/gap-analyzer';

import { reteachQuery, type ReteachTarget } from './deep-link';

const ROUTE_KEYS = {
  mindmap: MINDMAP_ROUTE_KEY,
  flashcards: 'learning-flashcards',
  playground: 'learning-playground',
  debate: 'learning-debate',
  quiz: PAPER_SETTER_ROUTE_KEY,
  reteach: 'learning-lesson-planner',
  answerSheets: 'learning-answer-sheets',
  grades: 'grades',
} as const;

export interface GapLinks {
  action: (action: GapAction) => string | null;
  evidence: (ref: GapRef, actions: readonly GapAction[]) => string | null;
  reteach: (target: ReteachTarget) => string | null;
}

const withQuery = (base: string | null, query: Record<string, string>): string | null => (base ? `${base}?${new URLSearchParams(query).toString()}` : null);

export function useGapLinks(personaSlug: string, reachable: readonly FeatureKey[]): GapLinks {
  return React.useMemo<GapLinks>(() => {
    const base = (key: string): string | null => {
      const route = ROUTE_INDEX.get(key);
      return route && reachable.includes(route.node.feature) ? paths.personaSection(personaSlug, route.path) : null;
    };

    const action = (target: GapAction): string | null => {
      switch (target.kind) {
        case 'mindmap': {
          const range = target.page_start !== null && target.page_end !== null ? { from: target.page_start, to: target.page_end } : null;
          const root = base(ROUTE_KEYS.mindmap);
          return root ? `${root}?${mindmapQuery({ itemId: target.item_id, sectionId: target.section_id, range })}` : null;
        }
        case 'flashcards':
          return withQuery(base(ROUTE_KEYS.flashcards), { [FLASHCARDS_LINK_PARAMS.chapter]: target.chapter_id, [FLASHCARDS_LINK_PARAMS.topic]: target.topic });
        case 'playground':
          return withQuery(base(ROUTE_KEYS.playground), { [PLAYGROUND_PARAMS.class]: String(target.grade), [PLAYGROUND_PARAMS.thread]: target.thread_id });
        case 'debate':
          return withQuery(base(ROUTE_KEYS.debate), { [DEBATE_PARAMS.motion]: target.motion_id });
        case 'quiz':
          return withQuery(base(ROUTE_KEYS.quiz), {
            [PAPER_SETTER_PARAMS.subject]: target.subject_code,
            [PAPER_SETTER_PARAMS.grade]: String(target.grade),
            [PAPER_SETTER_PARAMS.chapter]: target.chapter_id,
            [PAPER_SETTER_PARAMS.topic]: target.topic_title,
          });
        case 'reteach':
          return withQuery(base(ROUTE_KEYS.reteach), { tab: 'term', offering: target.offering_id });
        default: {
          const unreachable: never = target;
          return unreachable;
        }
      }
    };

    const evidence = (ref: GapRef, actions: readonly GapAction[]): string | null => {
      const via = (kind: GapAction['kind']): string | null => {
        const found = actions.find((candidate) => candidate.kind === kind);
        return found ? action(found) : null;
      };
      switch (ref.kind) {
        case 'exam_mark': {
          const grades = base(ROUTE_KEYS.grades);
          const student = grades ? `${grades}/students/${encodeURIComponent(ref.student_id)}` : null;
          return ref.exam_id ? withQuery(student, { exam: ref.exam_id }) : student;
        }
        case 'answer_sheet':
        case 'omr_sheet':
          return ref.paper_id ? withQuery(base(ROUTE_KEYS.answerSheets), { paper: ref.paper_id }) : base(ROUTE_KEYS.answerSheets);
        case 'practice_paper':
          return base(ROUTE_KEYS.quiz);
        case 'mastery':
          return via('mindmap') ?? base(ROUTE_KEYS.mindmap);
        case 'flashcard_report':
          return via('flashcards') ?? base(ROUTE_KEYS.flashcards);
        case 'debate_report':
          return via('debate') ?? base(ROUTE_KEYS.debate);
        default: {
          const unreachable: never = ref.kind;
          return unreachable;
        }
      }
    };

    const reteach = (target: ReteachTarget): string | null => {
      const root = base(ROUTE_KEYS.reteach);
      return root ? `${root}?${reteachQuery(target)}` : null;
    };

    return { action, evidence, reteach };
  }, [personaSlug, reachable]);
}
