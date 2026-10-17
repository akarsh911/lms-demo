/**
 * HOW THE CURRENT IS VARIED.
 *
 * The Laboratory Manual's own method is the CELLS: the holder is tapped between
 * every cell, and the student moves one lead from stud to stud to put one, two,
 * three or four cells behind the same resistor (the manual's "points A and B",
 * then "A and C", and so on). The RHEOSTAT is the manual's sanctioned
 * alternative, offered in its Note for the Teacher for a bench driven by an
 * accumulator or a battery instead of cells.
 *
 * The method decides which apparatus is on the bench at all — the terminals,
 * the drawing, the circuit the assistant asks for, the solver's own source and
 * the viva's wording all follow from it.
 *
 * WHY A MODULE-LEVEL DEFAULT EXISTS AS WELL AS `state.method`.
 *
 * The method a student chose has to survive three things the reducer never
 * sees: `BenchEngine.init`, which the workspace calls with a fixed options
 * shape when it starts a tour's sandbox bench or a fresh bench; `engine.steps`,
 * whose rail prompts name the control that varies the current; and
 * `engine.marks`, whose procedure basis names the deduction by that control's
 * name. None of the three is handed a state.
 *
 * So the CHOICE lives here and the SNAPSHOT lives in the state. `newLabState`
 * reads this when it is not told otherwise, and the `setMethod` action writes
 * both. Everything that decides a mark reads `state.method` and stays a pure
 * function of it; this cell only decides which apparatus the NEXT bench is
 * built with, and the wording of two lines of prose.
 */
export type LabMethod = 'cells' | 'rheostat';

let chosen: LabMethod = 'cells';

/** The method the next bench will be built with. */
export function currentMethod(): LabMethod {
  return chosen;
}

export function setCurrentMethod(method: LabMethod): void {
  chosen = method;
}

/** Reads better than `method === 'cells'` at every call site. */
export function usesCells(method: LabMethod): boolean {
  return method === 'cells';
}
