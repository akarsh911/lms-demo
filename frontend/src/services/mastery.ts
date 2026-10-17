import { config } from '@/config';
import { readMastery, writeMastery } from '@/fixtures/engines';

import { coreApi } from './api';
import { dev } from './dev-bypass';
import { chapterPath } from './mindmap';
import { READ_STATE, type MasteryMap, type MasteryResponse, type MasteryState } from '@/types/mastery';

const masteryPath = (itemId: string, sectionId: string): string =>
  `${chapterPath(itemId, sectionId)}/mastery`;

/**
 * Concept mastery, per student per chapter of one book.
 *
 * Carried by emerge-core beside the map it belongs to: it is Emerge's own
 * record of a student, not something either study engine owns. The mind-map
 * engine deliberately holds no learner state and must not grow one.
 */
export const masteryService = {
  forChapter: (itemId: string, sectionId: string, signal?: AbortSignal) =>
    config.devBypass
      ? dev(() => readMastery(itemId, sectionId))
      : coreApi.get<MasteryResponse>(masteryPath(itemId, sectionId), undefined, signal),

  /**
   * Record that concepts were opened. `read` is the only state a client may
   * send: graded states are written by the server while it relays a drill's
   * result, so the two writers cannot erase each other.
   */
  markRead: (itemId: string, sectionId: string, nodeIds: readonly string[]) => {
    const states: MasteryMap = {};
    for (const nodeId of nodeIds) states[nodeId] = READ_STATE;
    return config.devBypass
      ? dev(() => writeMastery(itemId, sectionId, states))
      : coreApi.put<MasteryResponse>(masteryPath(itemId, sectionId), { states });
  },
};

export type { MasteryState };
