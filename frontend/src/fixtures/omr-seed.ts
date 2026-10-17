import type { OmrAnswerKey, OmrSheetIn } from '@/types/answer-checker';

import { bubbleSheets, extraSetterPaper, objectiveKey } from './answer-checker-paper';
import { DEMO_PAPER_IDS } from './data/answer-checker-demo';

export interface OmrSeed {
  paperId: string;
  key: OmrAnswerKey;
  sheets: OmrSheetIn[];
}

export function demoOmrSeed(): OmrSeed | null {
  const paper = extraSetterPaper(DEMO_PAPER_IDS.omrScored);
  if (!paper) return null;
  return { paperId: paper.paper_id, key: objectiveKey(paper).key, sheets: bubbleSheets(paper, 'G10A') };
}
