/**
 * What a student has learned, per concept.
 *
 * # Why this exists here and not in the mind-map engine
 *
 * The engine is stateless on purpose: "no learner table, no saved maps, no
 * sessions. Drill results leave as `node_scores` for the LMS to persist. Do not
 * add a database." That leaves a seam, and Emerge is the LMS, so this is the
 * Emerge side of it.
 *
 * # Why not `localStorage`, which is what the engine's own web UI does
 *
 * Its `atlas.v7` key is the right call for a single-file demo and the wrong one
 * for a school. Progress in a browser is progress on one device, lost on a
 * cleared cache, invisible to a teacher, and unmergeable with the score a drill
 * just produced on a different machine. The same three states, stored server
 * side, survive all of that.
 */

/**
 * The four states, ranked. A concept only ever moves UP this ladder, which is
 * the engine's `RANK` rule: having read something and then skipped a question
 * about it does not make it unread.
 */
export type MasteryState = 'read' | 'missed' | 'shaky' | 'known';

export const MASTERY_RANK: Record<MasteryState, number> = {
  read: 1,
  missed: 2,
  shaky: 3,
  known: 4,
};

/** `node_id -> state`, for one chapter. */
export type MasteryMap = Record<string, MasteryState>;

export interface MasteryResponse {
  section_id: string;
  content_item_id: string;
  student_id: string | null;
  tracked: boolean;
  states: MasteryMap;
}

export const READ_STATE: MasteryState = 'read';

/** Apply the ladder: a state never moves down. */
export function raise(current: MasteryState | undefined, next: MasteryState): MasteryState {
  if (!current) return next;
  return MASTERY_RANK[current] >= MASTERY_RANK[next] ? current : next;
}
