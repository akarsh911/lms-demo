'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { useApplyPlacements } from '@/hooks/mutation/use-library';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useCurricula, useCurriculumNodes } from '@/hooks/query/use-library';
import { capabilityFor, mayWriteField } from '@/lib/core/fields';
import type {
  ContentPlacement,
  Curriculum,
  CurriculumNode,
  PlacementCreate,
  PlacementStatus,
} from '@/types/library';
import type { PlacementApply, PlacementResult } from '@/hooks/mutation/use-library';

export const WHOLE_SYLLABUS = 'curriculum';

export const PLACEMENT_CREATE_KEY = 'core.content_placements.create';
export const PLACEMENT_WRITE_KEY = 'core.content_placements.write';
export const PLACEMENT_DELETE_KEY = 'core.content_placements.delete';
export const PLACEMENT_READ_KEY = 'core.content_placements.read';
export const LIBRARY_READ_KEY = 'core.library.read';

const KIND_TONE: Record<string, ChipTone> = {
  unit: 'violet',
  chapter: 'blue',
  topic: 'grey',
};

export interface PlacementOption {
  value: string;
  label: string;
  kind: string;
  depth: number;
}

export interface PlacementDraft {
  targets: readonly string[];
  pageStart: string;
  pageEnd: string;
}

export const UNPLACED_DRAFT: PlacementDraft = {
  targets: [],
  pageStart: '',
  pageEnd: '',
};

export function draftOf(existing: readonly ContentPlacement[]): PlacementDraft {
  const only = existing.length === 1 ? existing[0] : undefined;
  return {
    targets: existing.map((row) => row.curriculum_node_id ?? WHOLE_SYLLABUS),
    pageStart: only?.page_start == null ? '' : String(only.page_start),
    pageEnd: only?.page_end == null ? '' : String(only.page_end),
  };
}

export function toggleTarget(draft: PlacementDraft, value: string): PlacementDraft {
  if (draft.targets.includes(value)) {
    return { ...draft, targets: draft.targets.filter((held) => held !== value) };
  }
  if (value === WHOLE_SYLLABUS) return { ...draft, targets: [WHOLE_SYLLABUS] };
  return {
    ...draft,
    targets: [...draft.targets.filter((held) => held !== WHOLE_SYLLABUS), value],
  };
}

function nodeIdOf(target: string): string | null {
  return target === WHOLE_SYLLABUS ? null : target;
}

function pageNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1) return undefined;
  return value;
}

export function draftProblem(draft: PlacementDraft): string | null {
  if (draft.targets.length !== 1) return null;

  const start = draft.pageStart.trim();
  const end = draft.pageEnd.trim();
  if (start !== '' && pageNumber(start) === undefined) {
    return 'The first page must be a whole number, 1 or more.';
  }
  if (end !== '' && pageNumber(end) === undefined) {
    return 'The last page must be a whole number, 1 or more.';
  }

  const from = pageNumber(start);
  const to = pageNumber(end);
  if (from !== undefined && to !== undefined && to < from) {
    return 'The last page comes before the first.';
  }
  return null;
}

export interface SubjectCurriculum {
  curriculum: Curriculum | undefined;
  options: PlacementOption[];
  labelOf: (nodeId: string | null | undefined) => string;
  isPending: boolean;
  isError: boolean;
}

export function useSubjectCurriculum({
  subjectId,
  gradeLevelId,
  sessionId,
}: {
  subjectId: string | undefined;
  gradeLevelId: string | undefined;
  sessionId: string | undefined;
}): SubjectCurriculum {
  const curricula = useCurricula();

  const curriculum = React.useMemo(() => {
    const rows = curricula.data?.rows ?? [];
    return rows.find(
      (row) =>
        (!subjectId || row.subject_id === subjectId) &&
        (!gradeLevelId || row.grade_level_id === gradeLevelId) &&
        (!sessionId || row.academic_session_id === sessionId),
    );
  }, [curricula.data, subjectId, gradeLevelId, sessionId]);

  const nodes = useCurriculumNodes(curriculum?.id ?? null);

  const options = React.useMemo(
    () => flattenNodes(nodes.data?.rows ?? []),
    [nodes.data],
  );

  const labelOf = React.useCallback(
    (nodeId: string | null | undefined): string => labelForNode(nodeId, options),
    [options],
  );

  return {
    curriculum,
    options,
    labelOf,
    isPending: curricula.isPending || (Boolean(curriculum) && nodes.isPending),
    isError: curricula.isError || nodes.isError,
  };
}

function labelForNode(
  nodeId: string | null | undefined,
  options: readonly PlacementOption[],
): string {
  if (!nodeId) return 'The whole syllabus';
  return options.find((option) => option.value === nodeId)?.label ?? 'A chapter';
}

function flattenNodes(rows: readonly CurriculumNode[]): PlacementOption[] {
  const children = new Map<string, CurriculumNode[]>();
  for (const row of rows) {
    const key = row.parent_id ?? '';
    const bucket = children.get(key);
    if (bucket) bucket.push(row);
    else children.set(key, [row]);
  }

  const order = (a: CurriculumNode, b: CurriculumNode): number =>
    (a.sequence ?? 0) - (b.sequence ?? 0) ||
    (a.title ?? '').localeCompare(b.title ?? '');

  const known = new Set(rows.map((row) => row.id));
  const roots = rows.filter((row) => !row.parent_id || !known.has(row.parent_id));

  const out: PlacementOption[] = [];
  const walk = (node: CurriculumNode, depth: number): void => {
    out.push({
      value: node.id,
      label: node.title ?? 'Untitled',
      kind: node.kind ?? 'topic',
      depth,
    });
    const below = [...(children.get(node.id) ?? [])].sort(order);
    for (const child of below) walk(child, depth + 1);
  };
  for (const root of [...roots].sort(order)) walk(root, 0);
  return out;
}

export interface PlacementRights {
  settled: boolean;
  mayPlace: boolean;
  mayRevise: boolean;
  mayUnplace: boolean;
  mayRead: boolean;
  mayDecide: boolean;
}

export function usePlacementRights(): PlacementRights {
  const capabilities = useCapabilities();
  const held = capabilities.data?.capabilities;
  const holds = (key: string): boolean =>
    held !== undefined && capabilityFor(held, key) !== undefined;

  return {
    settled: !capabilities.isPending,
    mayPlace: holds(PLACEMENT_CREATE_KEY),
    mayRevise: holds(PLACEMENT_WRITE_KEY),
    mayUnplace: holds(PLACEMENT_DELETE_KEY),
    mayRead: holds(PLACEMENT_READ_KEY) && holds(LIBRARY_READ_KEY),
    mayDecide: mayWriteField(capabilityFor(held, PLACEMENT_WRITE_KEY), 'status'),
  };
}

export function mayChangePlacement(rights: PlacementRights): boolean {
  return rights.mayRevise || rights.mayPlace || rights.mayUnplace;
}

const EMPTY_PLAN: PlacementApply = {
  creates: [],
  revise: null,
  removes: [],
  decides: [],
};

export function isEmptyPlan(plan: PlacementApply): boolean {
  return (
    plan.creates.length === 0 &&
    plan.removes.length === 0 &&
    plan.decides.length === 0 &&
    plan.revise === null
  );
}

export function decidePlan(
  placement: ContentPlacement,
  status: PlacementStatus,
): PlacementApply {
  return {
    creates: [],
    revise: null,
    removes: [],
    decides: [
      { id: placement.id, nodeId: placement.curriculum_node_id ?? null, status },
    ],
  };
}


function createFor(
  curriculumId: string,
  itemId: string,
  nodeId: string | null,
  pages: { page_start?: number; page_end?: number },
): PlacementCreate {
  return {
    curriculum_id: curriculumId,
    content_item_id: itemId,
    grain: nodeId ? 'node' : 'curriculum',
    curriculum_node_id: nodeId ?? undefined,
    page_start: pages.page_start,
    page_end: pages.page_end,
  };
}

function clearsAPage(before: PlacementDraft, after: PlacementDraft): boolean {
  const cleared = (was: string, now: string): boolean =>
    was.trim() !== '' && now.trim() === '';
  return (
    cleared(before.pageStart, after.pageStart) ||
    cleared(before.pageEnd, after.pageEnd)
  );
}

function samePages(a: PlacementDraft, b: PlacementDraft): boolean {
  return a.pageStart.trim() === b.pageStart.trim() && a.pageEnd.trim() === b.pageEnd.trim();
}

export function planFor(
  existing: readonly ContentPlacement[],
  draft: PlacementDraft,
  curriculumId: string | undefined,
  itemId: string,
): PlacementApply {
  if (!curriculumId) return EMPTY_PLAN;

  const wanted = draft.targets.map(nodeIdOf);
  const held = existing.map((row) => ({
    row,
    nodeId: row.curriculum_node_id ?? null,
  }));

  const pages =
    draft.targets.length === 1
      ? { page_start: pageNumber(draft.pageStart), page_end: pageNumber(draft.pageEnd) }
      : {};

  const creates = wanted
    .filter((nodeId) => !held.some((one) => one.nodeId === nodeId))
    .map((nodeId) => createFor(curriculumId, itemId, nodeId, pages));

  const removes = held
    .filter((one) => !wanted.includes(one.nodeId))
    .map((one) => ({ id: one.row.id, nodeId: one.nodeId }));

  if (creates.length > 0 || removes.length > 0) {
    return { creates, revise: null, removes, decides: [] };
  }

  const only = existing.length === 1 ? existing[0] : undefined;
  if (!only || draft.targets.length !== 1) return EMPTY_PLAN;

  const before = draftOf(existing);
  if (samePages(before, draft)) return EMPTY_PLAN;

  const nodeId = only.curriculum_node_id ?? null;
  if (clearsAPage(before, draft)) {
    return {
      creates: [createFor(curriculumId, itemId, nodeId, pages)],
      revise: null,
      removes: [{ id: only.id, nodeId }],
      decides: [],
    };
  }

  return {
    creates: [],
    revise: {
      id: only.id,
      nodeId,
      patch: { page_start: pages.page_start, page_end: pages.page_end },
    },
    removes: [],
    decides: [],
  };
}

export function planAllowed(plan: PlacementApply, rights: PlacementRights): boolean {
  if (plan.creates.length > 0 && !rights.mayPlace) return false;
  if (plan.removes.length > 0 && !rights.mayUnplace) return false;
  if (plan.revise !== null && !rights.mayRevise) return false;
  if (plan.decides.length > 0 && !rights.mayDecide) return false;
  return true;
}

function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function planRefusal(
  plan: PlacementApply,
  rights: PlacementRights,
): string | null {
  const missing: string[] = [];
  if (plan.creates.length > 0 && !rights.mayPlace) {
    missing.push('place material in the syllabus');
  }
  if (plan.revise !== null && !rights.mayRevise) {
    missing.push('change a page range');
  }
  if (plan.removes.length > 0 && !rights.mayUnplace) {
    missing.push('take material out of the syllabus');
  }
  if (plan.decides.length > 0 && !rights.mayDecide) {
    missing.push('settle what has been placed in the syllabus');
  }
  if (missing.length === 0) return null;

  const moving = plan.creates.length > 0 && plan.removes.length > 0;
  return (
    `Your school does not let this account ${listOf(missing)}.` +
    (moving
      ? ' Moving material to a different chapter needs both, because a placement cannot be re-pointed once it is made.'
      : '')
  );
}

function groupByItem(
  rows: readonly ContentPlacement[] | undefined,
  keep: (row: ContentPlacement) => boolean,
): Map<string, ContentPlacement[]> {
  const byItem = new Map<string, ContentPlacement[]>();
  for (const row of rows ?? []) {
    if (!row.content_item_id || !keep(row)) continue;
    const bucket = byItem.get(row.content_item_id);
    if (bucket) bucket.push(row);
    else byItem.set(row.content_item_id, [row]);
  }
  return byItem;
}

export function placementsByItem(
  rows: readonly ContentPlacement[] | undefined,
): Map<string, ContentPlacement[]> {
  return groupByItem(rows, (row) => row.status !== 'rejected');
}

export function rejectedByItem(
  rows: readonly ContentPlacement[] | undefined,
): Map<string, ContentPlacement[]> {
  return groupByItem(rows, (row) => row.status === 'rejected');
}

export function pageRangeLine(placement: ContentPlacement): string | null {
  const from = placement.page_start;
  const to = placement.page_end;
  if (from != null && to != null) return `pages ${from}–${to}`;
  if (from != null) return `from page ${from}`;
  if (to != null) return `to page ${to}`;
  return null;
}

export function placementLine(
  placement: ContentPlacement,
  labelOf: SubjectCurriculum['labelOf'],
): string {
  const where = labelOf(placement.curriculum_node_id);
  const pages = pageRangeLine(placement);
  return pages ? `${where} · ${pages}` : where;
}

export function PlacementPicker({
  value,
  onChange,
  options,
  loading,
  failed,
  missing,
  canRetarget = true,
  disabled = false,
}: {
  value: PlacementDraft;
  onChange: (next: PlacementDraft) => void;
  options: readonly PlacementOption[];
  loading: boolean;
  failed: boolean;
  missing: boolean;
  canRetarget?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  const problem = draftProblem(value);
  const chosen = value.targets.length;

  if (failed) {
    return (
      <Alert severity="info" variant="outlined">
        The syllabus for this subject could not be read, so this cannot be placed in
        it. Filing the material itself is unaffected.
      </Alert>
    );
  }

  if (missing && !loading) {
    return (
      <Typography variant="body2" color="text.secondary">
        No syllabus has been published for this subject and class yet, so there is no
        chapter to place this against. It stays filed against the subject.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {canRetarget ? (
        <FormControl component="fieldset" variant="standard" fullWidth>
          <FormLabel component="legend" sx={{ fontSize: 14 }}>
            Place in the syllabus
          </FormLabel>

          {loading ? (
            <Typography variant="body2" color="text.secondary">
              Reading the syllabus…
            </Typography>
          ) : (
            <Box
              sx={{
                maxHeight: 260,
                overflowY: 'auto',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                px: 1.25,
                py: 0.5,
                mt: 0.5,
              }}
            >
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={value.targets.includes(WHOLE_SYLLABUS)}
                      onChange={() => onChange(toggleTarget(value, WHOLE_SYLLABUS))}
                      size="small"
                      disabled={disabled}
                    />
                  }
                  label={<Typography variant="body2">The whole syllabus</Typography>}
                />
                {options.map((option) => (
                  <FormControlLabel
                    key={option.value}
                    control={
                      <Checkbox
                        checked={value.targets.includes(option.value)}
                        onChange={() => onChange(toggleTarget(value, option.value))}
                        size="small"
                        disabled={disabled}
                      />
                    }
                    label={
                      <Stack
                        direction="row"
                        spacing={0.75}
                        sx={{ alignItems: 'center' }}
                      >
                        <Typography variant="body2">{option.label}</Typography>
                        <EmergeChip
                          label={option.kind}
                          tone={KIND_TONE[option.kind] ?? 'grey'}
                        />
                      </Stack>
                    }
                    sx={{ pl: option.depth * 2 }}
                  />
                ))}
              </FormGroup>
            </Box>
          )}

          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Optional. Tick nothing and it stays filed against the subject. Tick
            several and the same material is placed against each of them.
          </Typography>

          {!loading && options.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              This syllabus has no chapters entered yet, so only the syllabus as a
              whole can be ticked.
            </Typography>
          ) : null}
        </FormControl>
      ) : (
        <Typography variant="body2">
          Placed at {labelForNode(nodeIdOf(value.targets[0] ?? ''), options)}. Only
          the page range can be changed here, because a placement cannot be
          re-pointed once it is made.
        </Typography>
      )}

      {chosen === 1 ? (
        <>
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="First page"
              value={value.pageStart}
              onChange={(event) => onChange({ ...value, pageStart: event.target.value })}
              size="small"
              type="number"
              disabled={disabled}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              helperText="Optional"
            />
            <TextField
              label="Last page"
              value={value.pageEnd}
              onChange={(event) => onChange({ ...value, pageEnd: event.target.value })}
              size="small"
              type="number"
              disabled={disabled}
              slotProps={{ htmlInput: { min: 1, step: 1 } }}
              helperText="Optional"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            A page range lets one book be placed against several chapters, one
            placement at a time.
          </Typography>
        </>
      ) : null}

      {chosen > 1 ? (
        <Typography variant="body2" color="text.secondary">
          A page range belongs to one chapter, so it is not offered while several are
          ticked. Each of the {chosen} is placed without one.
        </Typography>
      ) : null}

      {problem ? (
        <Alert severity="warning" variant="outlined">
          {problem}
        </Alert>
      ) : null}
    </Stack>
  );
}

export function PlacementReport({
  result,
  options,
}: {
  result: PlacementResult;
  options: readonly PlacementOption[];
}): React.ReactElement | null {
  if (result.failures.length === 0) return null;

  const landed = [
    ...result.created.map((row) => labelForNode(row.curriculum_node_id, options)),
    ...result.removed.map(
      (nodeId) => `${labelForNode(nodeId, options)} (taken out)`,
    ),
    ...result.decided.map(
      (row) =>
        `${labelForNode(row.curriculum_node_id, options)} (${row.status ?? 'settled'})`,
    ),
  ];

  return (
    <Alert severity="warning" variant="outlined">
      <Typography variant="body2">
        {landed.length > 0
          ? `${listOf(landed)} went through and has been kept.`
          : 'Nothing went through.'}
      </Typography>
      <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5 }}>
        {result.failures.map((failure) => (
          <li key={`${failure.action}-${failure.nodeId ?? WHOLE_SYLLABUS}`}>
            <Typography variant="body2">
              {labelForNode(failure.nodeId, options)} — {failure.message}
            </Typography>
          </li>
        ))}
      </Box>
      <Typography variant="body2" sx={{ mt: 1 }}>
        Saving again tries only what is still outstanding.
      </Typography>
    </Alert>
  );
}

export function PlacementDialog({
  open,
  onClose,
  itemId,
  itemTitle,
  curriculumId,
  options,
  loading,
  failed,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  itemId: string;
  itemTitle: string;
  curriculumId: string | undefined;
  options: readonly PlacementOption[];
  loading: boolean;
  failed: boolean;
  existing: readonly ContentPlacement[];
}): React.ReactElement {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      {open ? (
        <PlacementForm
          key={itemId}
          onClose={onClose}
          itemId={itemId}
          itemTitle={itemTitle}
          curriculumId={curriculumId}
          options={options}
          loading={loading}
          failed={failed}
          existing={existing}
        />
      ) : null}
    </Dialog>
  );
}

function PlacementForm({
  onClose,
  itemId,
  itemTitle,
  curriculumId,
  options,
  loading,
  failed,
  existing,
}: {
  onClose: () => void;
  itemId: string;
  itemTitle: string;
  curriculumId: string | undefined;
  options: readonly PlacementOption[];
  loading: boolean;
  failed: boolean;
  existing: readonly ContentPlacement[];
}): React.ReactElement {
  const apply = useApplyPlacements();
  const rights = usePlacementRights();

  const [draft, setDraft] = React.useState<PlacementDraft>(() => draftOf(existing));

  const placed = existing.length > 0;
  const problem = draftProblem(draft);
  const plan = planFor(existing, draft, curriculumId, itemId);
  const allowed = planAllowed(plan, rights);
  const refusal = allowed ? null : planRefusal(plan, rights);
  const usable = !isEmptyPlan(plan) && problem === null && allowed && !apply.isPending;

  const pagesOnly = placed && !rights.mayPlace && !rights.mayUnplace;

  const save = (): void => {
    if (!usable) return;
    apply.mutate(plan, {
      onSuccess: (result) => {
        if (result.failures.length === 0) onClose();
      },
    });
  };

  return (
    <>
      <DialogTitle>
        {placed
          ? `Where ${itemTitle} sits in the syllabus`
          : `Place ${itemTitle} in the syllabus`}
        <Typography variant="body2" color="text.secondary">
          {placed
            ? 'Unticking everything leaves it filed against the subject, as it was.'
            : 'Optional. Leaving it unticked keeps it filed against the subject, where it is now.'}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <PlacementPicker
            value={draft}
            onChange={setDraft}
            options={options}
            loading={loading}
            failed={failed}
            missing={!curriculumId}
            canRetarget={!pagesOnly}
            disabled={apply.isPending}
          />

          {plan.creates.length > 0 && plan.removes.length > 0 && allowed ? (
            <Typography variant="body2" color="text.secondary">
              A placement cannot be re-pointed once it is made, so saving files the
              new ones first and removes the old afterwards.
            </Typography>
          ) : null}

          {refusal ? (
            <Alert severity="info" variant="outlined">
              {refusal}
            </Alert>
          ) : null}

          {apply.data ? <PlacementReport result={apply.data} options={options} /> : null}

          {apply.isError ? (
            <Alert severity="error" variant="outlined">
              {apply.error.message}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={apply.isPending}>
          {apply.data && apply.data.failures.length > 0 ? 'Close' : 'Cancel'}
        </Button>
        <Button variant="contained" onClick={save} disabled={!usable}>
          {apply.isPending ? 'Saving' : 'Save'}
        </Button>
      </DialogActions>
    </>
  );
}
