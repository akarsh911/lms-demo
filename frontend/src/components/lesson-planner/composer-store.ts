import { createStore } from '@/lib/store';
import type { DraftPlan, GenerateRequest } from '@/types/lesson-planner';

export interface Objective {
  text: string;
  chosen: boolean;
  custom: boolean;
}

export type ComposerPhase =
  | { kind: 'setup' }
  | { kind: 'generating'; request: GenerateRequest }
  | { kind: 'draft'; request: GenerateRequest; draft: DraftPlan };

export interface ComposerState {
  offeringId: string | null;
  chapterId: string | null;
  topicIds: string[];
  focusTitles: string[];
  periodCount: number | null;
  objectives: Objective[];
  objectivesFor: string | null;
  title: string;
  startDate: string | null;
  phase: ComposerPhase;
}

export type ComposerAction = { kind: 'patch'; change: Partial<ComposerState> } | { kind: 'reset'; keep?: Partial<ComposerState> };

const INITIAL: ComposerState = {
  offeringId: null,
  chapterId: null,
  topicIds: [],
  focusTitles: [],
  periodCount: null,
  objectives: [],
  objectivesFor: null,
  title: '',
  startDate: null,
  phase: { kind: 'setup' },
};

function reduce(state: ComposerState, action: ComposerAction): ComposerState {
  switch (action.kind) {
    case 'patch':
      return { ...state, ...action.change };
    case 'reset':
      return { ...INITIAL, ...action.keep };
    default: {
      const unknown: never = action;
      return unknown;
    }
  }
}

export const composerStore = createStore<ComposerState, ComposerAction>(reduce, INITIAL);

export const patchComposer = (change: Partial<ComposerState>): void => {
  composerStore.dispatch({ kind: 'patch', change });
};
