'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import {
  WidgetDegraded,
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import { useResequenceCurriculumNodes } from '@/hooks/mutation/use-library';
import { useCurricula, useCurriculumNodes } from '@/hooks/query/use-library';
import { useGradingSchemes } from '@/hooks/query/use-school';
import type { ApiError } from '@/services/api';
import type { CurriculumNode, CurriculumNodeKind } from '@/types/library';
import type { GradingScheme } from '@/types/school';

import {
  CURRICULUM_KIND_LABEL,
  CurriculumDialog,
  CurriculumNodeDialog,
  type NodeDraft,
} from './curriculum-dialog';
import { ResultCompositionCard } from './result-composition-card';
import type { ScopeState } from './scope-state';

interface TreeNode {
  row: CurriculumNode;
  children: TreeNode[];
}

const KIND_TONE: Record<string, 'blue' | 'violet' | 'grey'> = {
  unit: 'violet',
  chapter: 'blue',
  topic: 'grey',
};

const CHILD_KIND: Record<CurriculumNodeKind, CurriculumNodeKind | undefined> = {
  unit: 'chapter',
  chapter: 'topic',
  topic: undefined,
};

const ROOT_KINDS = ['unit', 'chapter'] as const satisfies readonly CurriculumNodeKind[];

type RootKind = (typeof ROOT_KINDS)[number];

const ROOT_KIND_HINT: Record<RootKind, string> = {
  unit: 'A part of the subject with a book of its own, like Chemistry, holding its chapters.',
  chapter: 'Straight into the syllabus, for a subject taught from one book with no units.',
};

interface NodeActions {
  onAddChild: (parent: TreeNode, kind: CurriculumNodeKind) => void;
  onEdit: (node: TreeNode) => void;
  onMove: (siblings: readonly TreeNode[], index: number, delta: -1 | 1) => void;
}

export function CurriculumTab({
  subjectId,
  gradeLevelId,
  sessionId,
  gradingSchemeId,
  resultSchemeId,
  scopeState,
  mayEdit,
  mayCreate,
}: {
  subjectId: string | undefined;
  gradeLevelId: string | undefined;
  sessionId: string | undefined;
  gradingSchemeId: string | undefined;
  resultSchemeId: string | undefined;
  scopeState: ScopeState;
  mayEdit: boolean;
  mayCreate: boolean;
}): React.ReactElement {
  const curricula = useCurricula();
  const schemes = useGradingSchemes(sessionId);

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
  const resequence = useResequenceCurriculumNodes(curriculum?.id ?? null);

  const tree = React.useMemo(() => buildTree(nodes.data?.rows ?? []), [nodes.data]);
  const counts = React.useMemo(() => countKinds(nodes.data?.rows ?? []), [nodes.data]);

  const scheme = React.useMemo(() => {
    const rows = schemes.data?.rows ?? [];
    return rows.find((row) => row.id === gradingSchemeId);
  }, [schemes.data, gradingSchemeId]);

  const [editing, setEditing] = React.useState<CurriculumNode | null>(null);
  const [draft, setDraft] = React.useState<NodeDraft | null>(null);
  const [startingCurriculum, setStartingCurriculum] = React.useState(false);

  const actions: NodeActions = {
    onAddChild: (parent, kind) =>
      setDraft({
        kind,
        parentId: parent.row.id,
        parentTitle: parent.row.title,
        nextSequence: nextSequenceOf(parent.children),
      }),
    onEdit: (node) => setEditing(node.row),
    onMove: (siblings, index, delta) => {
      const moves = renumberAfterMove(siblings, index, delta);
      if (moves.length > 0) resequence.mutate(moves);
    },
  };

  const closeNodeDialog = (): void => {
    setEditing(null);
    setDraft(null);
  };

  return (
    <Stack spacing={2.5}>
      {curricula.isPending ? <WidgetLoading rows={4} /> : null}
      {curricula.isError ? (
        <WidgetError error={curricula.error} onRetry={() => void curricula.refetch()} />
      ) : null}

      {curricula.data && !curriculum ? (
        <Stack spacing={1.25} sx={{ alignItems: 'flex-start' }}>
          <WidgetEmpty message="No curriculum has been published for this subject and class yet." />
          {mayCreate ? (
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => setStartingCurriculum(true)}
            >
              Start a curriculum
            </Button>
          ) : null}
        </Stack>
      ) : null}

      {curriculum ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.25}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: 'center', flexWrap: 'wrap' }}
              >
                <Typography variant="h4" component="h3">
                  {curriculum.name ?? curriculum.code}
                </Typography>
                {curriculum.board ? <EmergeChip label={curriculum.board} tone="blue" /> : null}
                <EmergeChip
                  label={curriculum.status ?? 'draft'}
                  tone={curriculum.status === 'active' ? 'green' : 'grey'}
                  dot
                />
              </Stack>

              {curriculum.description ? (
                <Typography variant="body2" color="text.secondary">
                  {curriculum.description}
                </Typography>
              ) : null}

              <Typography variant="body2" color="text.secondary">
                {counts.unit} {counts.unit === 1 ? 'unit' : 'units'} · {counts.chapter}{' '}
                {counts.chapter === 1 ? 'chapter' : 'chapters'} · {counts.topic}{' '}
                {counts.topic === 1 ? 'topic' : 'topics'}
              </Typography>

              {!mayEdit && !mayCreate ? (
                <Typography variant="caption" color="text.secondary">
                  You can read this syllabus but not change it.
                </Typography>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      <ResultCompositionCard
        resultSchemeId={resultSchemeId}
        sessionId={sessionId}
        scopeState={scopeState}
      />

      <GradingCard
        scheme={scheme}
        pending={schemes.isPending}
        error={schemes.error}
        attached={Boolean(gradingSchemeId)}
      />

      {curriculum ? (
        <Box>
          <SectionHeader
            title="Syllabus"
            actions={
              mayCreate ? (
                <AddRootNodeButton
                  onPick={(kind) =>
                    setDraft({
                      kind,
                      parentId: undefined,
                      parentTitle: undefined,
                      nextSequence: nextSequenceOf(tree),
                    })
                  }
                />
              ) : null
            }
          />

          {resequence.isError ? (
            <Alert severity="error" variant="outlined" sx={{ mb: 1.5 }}>
              {resequence.error.status === 403
                ? `Your school does not let this account reorder the syllabus. ${resequence.error.message}`
                : resequence.error.message}
            </Alert>
          ) : null}

          {nodes.isPending ? <WidgetLoading rows={6} /> : null}
          {nodes.isError ? (
            <WidgetError error={nodes.error} onRetry={() => void nodes.refetch()} />
          ) : null}
          {nodes.data && tree.length === 0 ? (
            <WidgetEmpty
              message={
                mayCreate
                  ? 'This curriculum has no chapters entered yet. Start with a unit if the subject is taught in parts, or with a chapter if it is not.'
                  : 'This curriculum has no chapters entered yet.'
              }
            />
          ) : null}
          {tree.length > 0 ? (
            <Stack spacing={1}>
              {tree.map((node, index) => (
                <NodeRow
                  key={node.row.id}
                  node={node}
                  depth={0}
                  siblings={tree}
                  index={index}
                  mayEdit={mayEdit}
                  mayCreate={mayCreate}
                  busy={resequence.isPending}
                  actions={actions}
                />
              ))}
            </Stack>
          ) : null}
        </Box>
      ) : null}

      <CurriculumNodeDialog
        open={editing !== null || draft !== null}
        onClose={closeNodeDialog}
        curriculumId={curriculum?.id ?? null}
        node={editing ?? undefined}
        draft={draft ?? undefined}
      />

      <CurriculumDialog
        open={startingCurriculum}
        onClose={() => setStartingCurriculum(false)}
        subjectId={subjectId}
        gradeLevelId={gradeLevelId}
        sessionId={sessionId}
        suggestedName="Syllabus"
      />
    </Stack>
  );
}

function AddRootNodeButton({
  onPick,
}: {
  onPick: (kind: RootKind) => void;
}): React.ReactElement {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const close = (): void => setAnchor(null);

  return (
    <>
      <Button
        size="small"
        startIcon={<Plus size={16} />}
        endIcon={<ChevronDown size={14} />}
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
      >
        Add to syllabus
      </Button>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {ROOT_KINDS.map((kind) => (
          <MenuItem
            key={kind}
            onClick={() => {
              close();
              onPick(kind);
            }}
          >
            <ListItemText
              primary={`Add a ${CURRICULUM_KIND_LABEL[kind].toLowerCase()}`}
              secondary={ROOT_KIND_HINT[kind]}
              sx={{ maxWidth: 360 }}
              slotProps={{ secondary: { sx: { whiteSpace: 'normal' } } }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

function GradingCard({
  scheme,
  pending,
  error,
  attached,
}: {
  scheme: GradingScheme | undefined;
  pending: boolean;
  error: ApiError | null;
  attached: boolean;
}): React.ReactElement | null {
  if (error) {
    return (
      <WidgetDegraded
        error={error}
        denied="This account cannot read grading schemes, so how this subject is marked is not shown."
        unavailable="Grading schemes could not be loaded, so how this subject is marked is not shown."
      />
    );
  }
  if (pending) return <WidgetLoading rows={3} />;
  if (!attached) {
    return (
      <Alert severity="info" variant="outlined">
        No grading scheme is attached to this subject yet, so marks have no scale to be read
        against.
      </Alert>
    );
  }
  if (!scheme) return null;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="h4" component="h3">
              {scheme.name ?? scheme.code}
            </Typography>
            <EmergeChip label={scheme.kind ?? 'marks'} tone="violet" />
          </Stack>

          {scheme.description ? (
            <Typography variant="body2" color="text.secondary">
              {scheme.description}
            </Typography>
          ) : null}

          {scheme.maximum_marks !== undefined ? (
            <Typography variant="body2">
              Out of {scheme.maximum_marks}
              {scheme.pass_marks !== undefined ? `, pass at ${scheme.pass_marks}` : ''}
            </Typography>
          ) : null}

          {scheme.scale_json && scheme.scale_json.length > 0 ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Grade</TableCell>
                    <TableCell>Range</TableCell>
                    <TableCell>Points</TableCell>
                    <TableCell>Means</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {scheme.scale_json.map((band) => (
                    <TableRow key={band.label}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {band.label}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {band.min_percent}–{band.max_percent}%
                      </TableCell>
                      <TableCell>{band.points ?? '—'}</TableCell>
                      <TableCell>{band.description ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function NodeRow({
  node,
  depth,
  siblings,
  index,
  mayEdit,
  mayCreate,
  busy,
  actions,
}: {
  node: TreeNode;
  depth: number;
  siblings: readonly TreeNode[];
  index: number;
  mayEdit: boolean;
  mayCreate: boolean;
  busy: boolean;
  actions: NodeActions;
}): React.ReactElement {
  const [open, setOpen] = React.useState(depth < 1);
  const kind = (node.row.kind ?? 'topic') as CurriculumNodeKind;
  const hasChildren = node.children.length > 0;
  const inactive = node.row.status === 'inactive';
  const childKind = CHILD_KIND[kind];
  const title = node.row.title ?? 'Untitled';

  return (
    <Box>
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', pl: depth * 2.5, minHeight: 34 }}
      >
        {hasChildren ? (
          <IconButton
            size="small"
            onClick={() => setOpen((on) => !on)}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 30 }} />
        )}

        <Typography
          variant="body2"
          sx={{
            fontWeight: kind === 'topic' ? 400 : 700,
            flex: 1,
            minWidth: 0,
            opacity: inactive ? 0.55 : 1,
            textDecoration: inactive ? 'line-through' : 'none',
          }}
        >
          {title}
        </Typography>

        {inactive ? <EmergeChip label="inactive" tone="grey" /> : null}
        <EmergeChip label={kind} tone={KIND_TONE[kind] ?? 'grey'} />

        {mayEdit || mayCreate ? (
          <Stack direction="row" spacing={0.25} sx={{ flex: 'none' }}>
            {mayEdit ? (
              <MoveButtons
                title={title}
                siblings={siblings}
                index={index}
                busy={busy}
                onMove={actions.onMove}
              />
            ) : null}
            {mayCreate && childKind ? (
              <Tooltip title={`Add a ${CURRICULUM_KIND_LABEL[childKind].toLowerCase()} under ${title}`}>
                <IconButton
                  size="small"
                  onClick={() => {
                    setOpen(true);
                    actions.onAddChild(node, childKind);
                  }}
                  aria-label={`Add a ${CURRICULUM_KIND_LABEL[childKind].toLowerCase()} under ${title}`}
                >
                  <Plus size={15} />
                </IconButton>
              </Tooltip>
            ) : null}
            {mayEdit ? (
              <Tooltip title={`Edit ${title}`}>
                <IconButton
                  size="small"
                  onClick={() => actions.onEdit(node)}
                  aria-label={`Edit ${title}`}
                >
                  <Pencil size={15} />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        ) : null}
      </Stack>

      {hasChildren ? (
        <Collapse in={open} unmountOnExit>
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {node.children.map((child, childIndex) => (
              <NodeRow
                key={child.row.id}
                node={child}
                depth={depth + 1}
                siblings={node.children}
                index={childIndex}
                mayEdit={mayEdit}
                mayCreate={mayCreate}
                busy={busy}
                actions={actions}
              />
            ))}
          </Stack>
        </Collapse>
      ) : null}
    </Box>
  );
}

function MoveButtons({
  title,
  siblings,
  index,
  busy,
  onMove,
}: {
  title: string;
  siblings: readonly TreeNode[];
  index: number;
  busy: boolean;
  onMove: NodeActions['onMove'];
}): React.ReactElement {
  return (
    <>
      <Tooltip title={`Move ${title} up`}>
        <span>
          <IconButton
            size="small"
            disabled={busy || index === 0}
            onClick={() => onMove(siblings, index, -1)}
            aria-label={`Move ${title} up`}
          >
            <ArrowUp size={15} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={`Move ${title} down`}>
        <span>
          <IconButton
            size="small"
            disabled={busy || index === siblings.length - 1}
            onClick={() => onMove(siblings, index, 1)}
            aria-label={`Move ${title} down`}
          >
            <ArrowDown size={15} />
          </IconButton>
        </span>
      </Tooltip>
    </>
  );
}

function buildTree(rows: readonly CurriculumNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const row of rows) byId.set(row.id, { row, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.row.parent_id ? byId.get(node.row.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const order = (a: TreeNode, b: TreeNode): number =>
    (a.row.sequence ?? 0) - (b.row.sequence ?? 0) ||
    (a.row.title ?? '').localeCompare(b.row.title ?? '');

  const sortDeep = (nodes: TreeNode[]): void => {
    nodes.sort(order);
    for (const node of nodes) sortDeep(node.children);
  };
  sortDeep(roots);
  return roots;
}

function countKinds(rows: readonly CurriculumNode[]): Record<string, number> {
  const out: Record<string, number> = { unit: 0, chapter: 0, topic: 0 };
  for (const row of rows) {
    const kind = row.kind ?? 'topic';
    out[kind] = (out[kind] ?? 0) + 1;
  }
  return out;
}

function nextSequenceOf(siblings: readonly TreeNode[]): number {
  if (siblings.length === 0) return 1;
  return Math.max(...siblings.map((node) => node.row.sequence ?? 0)) + 1;
}

function renumberAfterMove(
  siblings: readonly TreeNode[],
  index: number,
  delta: -1 | 1,
): { id: string; sequence: number }[] {
  const target = index + delta;
  const moved = siblings[index];
  if (!moved || target < 0 || target >= siblings.length) return [];

  const reordered = siblings.filter((_, position) => position !== index);
  reordered.splice(target, 0, moved);

  const moves: { id: string; sequence: number }[] = [];
  reordered.forEach((node, position) => {
    const sequence = position + 1;
    if ((node.row.sequence ?? -1) !== sequence) moves.push({ id: node.row.id, sequence });
  });
  return moves;
}
