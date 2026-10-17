import type { NodeAvailability } from './contract';

export type ThinReasonKey =
  | 'not_indexed'
  | 'stale'
  | 'unpublished'
  | 'unreadable'
  | 'source_deleted';

export interface ThinReason {
  key: ThinReasonKey;
  count: number;
  label: string;
  sentence: string;
  whose: 'teacher' | 'school' | 'platform';
}

const THIN_REASONS: Record<
  ThinReasonKey,
  { label: string; sentence: string; whose: ThinReason['whose'] }
> = {
  not_indexed: {
    label: 'Not indexed yet',
    sentence:
      'The material mapped here has not been handed to the search index, so the solver cannot draw questions from it. The material itself is present and readable. This covers a book that was never submitted for indexing and a book whose indexing was deferred, because your school’s records keep one state for both. Neither is yours to fix alone — ask for those books to be indexed.',
    whose: 'platform',
  },
  stale: {
    label: 'Indexed, source changed since',
    sentence:
      'This material was indexed and then edited, so what the solver can search is older than what the book now says. Re-indexing fixes it; nothing has been lost.',
    whose: 'platform',
  },
  unpublished: {
    label: 'A draft you can read',
    sentence:
      'The material mapped here is a draft, and your account is one of the few that may read drafts at all. For everyone else an unpublished book never reaches this count — it is simply unreadable to them. Publishing it in the library makes it count for the whole school.',
    whose: 'teacher',
  },
  unreadable: {
    label: 'Not yours to read',
    sentence:
      'Material is mapped here that your account may not read, so it cannot contribute to your paper. A book still in draft lands here too for almost everyone, because an unpublished book is not readable rather than merely unpublished. An administrator decides who may read what.',
    whose: 'school',
  },
  source_deleted: {
    label: 'Source removed',
    sentence:
      'The material mapped here has been removed from the library, so the mapping now points at nothing. Mapping a replacement to this topic is the fix.',
    whose: 'school',
  },
};

export function unreadableCount(row: NodeAvailability): number {
  if (typeof row.unreadable === 'number') return Math.max(0, row.unreadable);
  return Math.max(0, row.placements - row.readable);
}

export function reasonCounts(row: NodeAvailability): Record<ThinReasonKey, number> {
  return {
    not_indexed: row.not_indexed,
    stale: row.stale,
    unpublished: row.unpublished,
    unreadable: unreadableCount(row),
    source_deleted: row.source_deleted,
  };
}

export function thinReasons(row: NodeAvailability): ThinReason[] {
  const counts = reasonCounts(row);
  return (Object.keys(THIN_REASONS) as ThinReasonKey[])
    .filter((key) => counts[key] > 0)
    .map((key) => ({
      key,
      count: counts[key],
      label: THIN_REASONS[key].label,
      sentence: THIN_REASONS[key].sentence,
      whose: THIN_REASONS[key].whose,
    }));
}

export function countsAccountForReadable(row: NodeAvailability): boolean {
  return (
    row.indexed + row.stale + row.not_indexed + row.unpublished + row.source_deleted ===
    row.readable
  );
}

export function countsAccountForPlacements(row: NodeAvailability): boolean {
  return row.readable + unreadableCount(row) === row.placements;
}

export function hasNothingMapped(row: NodeAvailability): boolean {
  return row.placements === 0;
}

export interface SupplyState {
  code: string;
  label: string;
  sentence: string;
  measurable: boolean;
  whose: 'teacher' | 'school' | 'platform' | 'nobody';
}

const SUPPLY_STATES: Record<string, SupplyState> = {
  unmapped: {
    code: 'unmapped',
    label: 'Not mapped to a book yet',
    sentence:
      'Nothing has been mapped between this and a book yet, so there is no extent to measure. That is a step nobody has run, not a finding that the material does not exist: the book may well be in your library already, waiting for its chapters to be matched up and confirmed.',
    measurable: false,
    whose: 'teacher',
  },
  restricted: {
    code: 'restricted',
    label: 'Mapped, but not yours to read',
    sentence:
      'Books are mapped here and your account may not read any of them, so none of it can reach your paper. A book still in draft reads this way too, for almost everyone. An administrator decides who may read what.',
    measurable: false,
    whose: 'school',
  },
  curriculum_only: {
    code: 'curriculum_only',
    label: 'Mapped to the whole curriculum',
    sentence:
      'The book behind this is mapped to the curriculum as a whole rather than to this chapter, so nothing records how much of it belongs here. The material is there and readable; what is missing is the chapter-level mapping that would say how much of it is this one. This is the state most schools are in today.',
    measurable: false,
    whose: 'teacher',
  },
  extent_unknown: {
    code: 'extent_unknown',
    label: 'No page range recorded',
    sentence:
      'This is mapped to a book, but no page range was recorded against it, so its size cannot be measured. It reads as zero because the size is unknown, not because there is nothing there.',
    measurable: false,
    whose: 'teacher',
  },
  attributed_to_ancestor: {
    code: 'attributed_to_ancestor',
    label: 'Counted under the parent you also selected',
    sentence:
      'This reads as nothing because the chapter above it, which you also selected, has already taken these pages. The material is in your paper — it is counted once, there, rather than twice. Nothing is missing.',
    measurable: false,
    whose: 'nobody',
  },
  whole_book: {
    code: 'whole_book',
    label: 'A whole book',
    sentence:
      'This is a unit, and a unit stands for a whole book, so it carries no page range by design. A missing page range here is correct rather than a defect.',
    measurable: true,
    whose: 'nobody',
  },
  whole_book_unmeasured: {
    code: 'whole_book_unmeasured',
    label: 'A whole book this paper does not draw from',
    sentence:
      'This unit stands for a book that is not one of the books this paper draws from, so its size is unknown here. That is not emptiness.',
    measurable: false,
    whose: 'teacher',
  },
};

export const SUPPLY_NOT_STATED: SupplyState = {
  code: 'not_stated',
  label: 'No reason given',
  sentence:
    'There is nothing to draw on here and the paper service did not say why. The counts in the row are everything that is known about it.',
  measurable: false,
  whose: 'nobody',
};

const SUPPLY_LOCATED: SupplyState = {
  code: 'located',
  label: 'Located',
  sentence: 'There is material here and its extent is known.',
  measurable: true,
  whose: 'nobody',
};

const SUPPLY_STATES_MEASURABLE: Record<string, SupplyState> = {
  located: SUPPLY_LOCATED,
};

export function supplyStateOf(row: NodeAvailability): SupplyState {
  const reported = row.supply;
  if (reported !== undefined && reported !== '') {
    const known = SUPPLY_STATES[reported] ?? SUPPLY_STATES_MEASURABLE[reported];
    if (known) return known;
    return { ...SUPPLY_NOT_STATED, code: reported };
  }

  if (hasNothingMapped(row)) return SUPPLY_STATES.unmapped as SupplyState;
  if (row.readable === 0) return SUPPLY_STATES.restricted as SupplyState;
  if (row.available_share <= 0) return SUPPLY_NOT_STATED;
  return SUPPLY_LOCATED;
}

export type AvailabilityVerdict = 'not_measurable' | 'under_target' | 'met' | 'unweighted';

const UNDER_TARGET_RATIO = 0.75;

export function verdictOf(row: NodeAvailability): AvailabilityVerdict {
  if (!supplyStateOf(row).measurable) return 'not_measurable';
  if (row.target_share <= 0) return 'unweighted';
  if (row.available_share < row.target_share * UNDER_TARGET_RATIO) return 'under_target';
  return 'met';
}

export const VERDICT_SENTENCE: Record<AvailabilityVerdict, string> = {
  not_measurable:
    'There is no figure to set against this target yet, and a zero here is a missing measurement rather than missing material. The reason is named beside the row.',
  under_target:
    'There is far less material here than this has been asked for. The weighting is a soft target, so the paper still generates and the solver gets as close as the material allows.',
  met: 'There is material here to meet the share this has been asked for.',
  unweighted:
    'This is not weighted, so nothing is asked of it. Its material still goes into the pool the paper draws from.',
};

export const MAPPING_NOT_BUILT =
  'Nothing you selected has been matched to a book yet, so every figure below is zero for ' +
  'one reason and one reason only: the matching step has not run. Nothing is broken, ' +
  'nothing is missing from your library, and this is not a verdict on your syllabus. ' +
  'Once a chapter has been matched to its pages and somebody has confirmed it, these ' +
  'numbers fill in.';

export const ATTRIBUTION_RULE =
  'A figure here covers the pages recorded against that chapter or topic itself, plus any ' +
  'from something above it that you did not also select. It never reaches down into what ' +
  'sits beneath it.';

export const NO_DOWNWARD_ROLL_UP =
  'So a chapter whose material was recorded only on its topics reads lower here than it ' +
  'really is. The error only ever runs that way — a chapter is never credited with ' +
  'more than it has.';

export const UNDERSTATED_CHAPTER =
  'This chapter shows nothing of its own while topics inside it show material. Nothing is ' +
  'broken and nothing is missing: the pages were recorded against the topics rather than ' +
  'against the chapter, and a chapter’s figure does not reach down into its topics. ' +
  'Select the topics as well as, or instead of, the chapter and their material is counted.';

export const NO_DOUBLE_COUNTING =
  'Where you selected a chapter and topics inside it, the pages are counted once, under ' +
  'the chapter. The topics then read as nothing and say so.';

export const SHARE_DENOMINATOR =
  'Share of the page extent behind the topics you selected — not of the whole curriculum.';

export function mappingNotBuilt(rows: readonly NodeAvailability[]): boolean {
  return rows.length > 0 && rows.every((row) => row.placements === 0);
}

export function supplyStatesPresent(rows: readonly NodeAvailability[]): SupplyState[] {
  const seen = new Map<string, SupplyState>();
  for (const row of rows) {
    const supply = supplyStateOf(row);
    if (supply.measurable) continue;
    if (!seen.has(supply.code)) seen.set(supply.code, supply);
  }
  return [...seen.values()];
}

export function reasonsPresent(rows: readonly NodeAvailability[]): ThinReasonKey[] {
  const keys = new Set<ThinReasonKey>();
  for (const row of rows) {
    for (const reason of thinReasons(row)) keys.add(reason.key);
  }
  return [...keys];
}

export function shortfallShare(row: NodeAvailability): number {
  return Math.max(0, row.target_share - row.available_share);
}

export function underTargetNodes(rows: readonly NodeAvailability[]): NodeAvailability[] {
  return rows.filter((row) => verdictOf(row) === 'under_target');
}

export function unmeasurableNodes(rows: readonly NodeAvailability[]): NodeAvailability[] {
  return rows.filter((row) => verdictOf(row) === 'not_measurable');
}

export function availabilityBlocksGeneration(): boolean {
  return false;
}

export function formatShare(share: number): string {
  return `${Math.round(share * 1000) / 10}%`;
}

export interface UnplaceableReason {
  code: string;
  label: string;
  sentence: string;
  whose: 'teacher' | 'school' | 'platform' | 'nobody';
}

const UNPLACEABLE_REASONS: Record<string, UnplaceableReason> = {
  no_page_range: {
    code: 'no_page_range',
    label: 'No page range recorded',
    sentence:
      'The book behind this is mapped, but nothing records which pages belong to this chapter, so a share of the paper cannot be aimed at it. The material is in your library; the page range is the missing piece. This is the usual reason today.',
    whose: 'teacher',
  },
  document_not_in_set: {
    code: 'document_not_in_set',
    label: 'In a book this paper does not draw from',
    sentence:
      'The pages behind this sit in a book that is not one of the books this paper draws from, so the share cannot be placed. Selecting the unit that book belongs to would bring it in.',
    whose: 'teacher',
  },
  no_document_id: {
    code: 'no_document_id',
    label: 'Book not indexed, so it cannot be matched',
    sentence:
      'The book behind this has not been indexed, so it carries no search id and cannot be matched to a chapter. It has its full page extent and is not missing — it simply cannot be aimed at until it is indexed. Ask for that book to be indexed.',
    whose: 'platform',
  },
  no_chapter_overlap: {
    code: 'no_chapter_overlap',
    label: 'Pages fall in no chapter of the book',
    sentence:
      'The recorded pages do not fall inside any chapter the book declares, so there is no chapter for the share to land on. Either the page range or the book’s own chapter list needs correcting.',
    whose: 'school',
  },
  no_material: {
    code: 'no_material',
    label: 'Nothing mapped',
    sentence:
      'Nothing has been mapped between this and a book yet, so there is nowhere for its share to go. That is a step nobody has run rather than a finding that the material does not exist.',
    whose: 'teacher',
  },
  document_withheld: {
    code: 'document_withheld',
    label: 'Indexed, but its id is withheld',
    sentence:
      'The book behind this is in your library with its pages, and it has been indexed — but your school’s records are withholding its search id, so nothing can join the chapter to the index and the share cannot be aimed at it. Nothing is missing and nothing is yours to fix; the id is released when the hold on that book is lifted.',
    whose: 'platform',
  },
  not_selected: {
    code: 'not_selected',
    label: 'Weighted but not selected',
    sentence:
      'A share was recorded against something that is not in the selection, so there is nothing for it to apply to. Tick it on the chapters step, or clear its share.',
    whose: 'teacher',
  },
};

export function unplaceableReasons(codes: readonly string[] | undefined): UnplaceableReason[] {
  if (!codes || codes.length === 0) return [];
  const seen = new Map<string, UnplaceableReason>();
  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.set(
      code,
      UNPLACEABLE_REASONS[code] ?? {
        code,
        label: 'A reason this screen has no wording for',
        sentence:
          'The paper service gave a reason this build does not recognise. It is shown rather than hidden, because a reason dropped is a reason nobody can act on.',
        whose: 'nobody',
      },
    );
  }
  return [...seen.values()];
}

const ALL_OF_IT = 0.999;

export function unplaceableSentence(share: number | undefined): string | null {
  if (share === undefined || share <= 0) return null;
  if (share >= ALL_OF_IT) {
    return 'None of your weighting could be placed in a chapter of the books this paper draws from, so the paper will be set as though you had asked for no weighting at all. It is reported rather than quietly ignored. The reason is named below, and on most schools today it is that no page ranges have been recorded yet.';
  }
  return `${formatShare(
    share,
  )} of your weighting could not be placed in any chapter of the books this paper draws from. It is reported rather than shared out among the rest, so you are not handed a paper that is quietly light on a topic.`;
}
