'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
  useCreateCurriculum,
  useCreateCurriculumNode,
  useUpdateCurriculumNode,
} from '@/hooks/mutation/use-library';
import type {
  CurriculumNode,
  CurriculumNodeKind,
  CurriculumNodeStatus,
} from '@/types/library';

export const CURRICULUM_KIND_LABEL: Record<CurriculumNodeKind, string> = {
  unit: 'Unit',
  chapter: 'Chapter',
  topic: 'Topic',
};

export interface NodeDraft {
  kind: CurriculumNodeKind;
  parentId: string | undefined;
  parentTitle: string | undefined;
  nextSequence: number;
}

export interface CurriculumNodeDialogProps {
  open: boolean;
  onClose: () => void;
  curriculumId: string | null;
  node: CurriculumNode | undefined;
  draft: NodeDraft | undefined;
}

export function CurriculumNodeDialog(props: CurriculumNodeDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <NodeForm key={props.node?.id ?? 'new'} {...props} /> : null}
    </Dialog>
  );
}

function NodeForm({
  onClose,
  curriculumId,
  node,
  draft,
}: CurriculumNodeDialogProps): React.ReactElement {
  const create = useCreateCurriculumNode(curriculumId);
  const update = useUpdateCurriculumNode(curriculumId);

  const kind = (node?.kind as CurriculumNodeKind | undefined) ?? draft?.kind ?? 'topic';
  const status = (node?.status as CurriculumNodeStatus | undefined) ?? 'active';

  const [title, setTitle] = React.useState(node?.title ?? '');
  const [description, setDescription] = React.useState(node?.description ?? '');

  const busy = create.isPending || update.isPending;
  const failure = create.error ?? update.error;
  const usable = title.trim() !== '' && Boolean(curriculumId);

  const label = CURRICULUM_KIND_LABEL[kind];

  const save = (): void => {
    if (node) {
      update.mutate(
        {
          id: node.id,
          patch: { title: title.trim(), description: description.trim() },
        },
        { onSuccess: onClose },
      );
      return;
    }
    create.mutate(
      {
        title: title.trim(),
        kind,
        sequence: draft?.nextSequence ?? 1,
        parent_id: draft?.parentId,
        description: description.trim() === '' ? undefined : description.trim(),
      },
      { onSuccess: onClose },
    );
  };

  const toggleStatus = (): void => {
    if (!node) return;
    update.mutate(
      { id: node.id, patch: { status: status === 'active' ? 'inactive' : 'active' } },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>{node ? `Edit ${label.toLowerCase()}` : `Add a ${label.toLowerCase()}`}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Title"
            size="small"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            autoFocus
          />
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            helperText="Optional. What this covers, in a sentence."
          />

          {!node && draft?.parentTitle ? (
            <Typography variant="body2" color="text.secondary">
              Goes under {draft.parentTitle}, at position {draft.nextSequence}.
            </Typography>
          ) : null}

          {!node && !draft?.parentTitle ? (
            <Typography variant="body2" color="text.secondary">
              Goes at the end of the syllabus, at position {draft?.nextSequence ?? 1}.
            </Typography>
          ) : null}

          {node ? (
            <Typography variant="body2" color="text.secondary">
              Order is changed with the arrows in the tree, not here.
            </Typography>
          ) : null}

          {node && status === 'inactive' ? (
            <Alert severity="info" variant="outlined">
              This {label.toLowerCase()} is inactive. It is still recorded and anything
              filed against it is kept, but it is no longer part of the syllabus being
              taught.
            </Alert>
          ) : null}

          {failure ? (
            <Alert severity="error" variant="outlined">
              {failure.status === 403
                ? `Your school does not let this account change the syllabus. ${failure.message}`
                : failure.message}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {node ? (
            <Button
              size="small"
              color={status === 'active' ? 'error' : 'primary'}
              disabled={busy}
              onClick={toggleStatus}
            >
              {status === 'active' ? 'Deactivate' : 'Reactivate'}
            </Button>
          ) : null}
        </span>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={save} disabled={busy || !usable}>
            Save
          </Button>
        </Stack>
      </DialogActions>
    </>
  );
}

export interface CurriculumDialogProps {
  open: boolean;
  onClose: () => void;
  subjectId: string | undefined;
  gradeLevelId: string | undefined;
  sessionId: string | undefined;
  suggestedName: string;
}

export function CurriculumDialog(props: CurriculumDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <CurriculumForm {...props} /> : null}
    </Dialog>
  );
}

function CurriculumForm({
  onClose,
  subjectId,
  gradeLevelId,
  sessionId,
  suggestedName,
}: CurriculumDialogProps): React.ReactElement {
  const create = useCreateCurriculum();

  const [name, setName] = React.useState(suggestedName);
  const [code, setCode] = React.useState('');
  const [board, setBoard] = React.useState('');
  const [description, setDescription] = React.useState('');

  const placed = Boolean(subjectId && gradeLevelId && sessionId);
  const usable = name.trim() !== '' && code.trim() !== '' && placed;

  const save = (): void => {
    if (!subjectId || !gradeLevelId || !sessionId) return;
    create.mutate(
      {
        name: name.trim(),
        code: code.trim(),
        academic_session_id: sessionId,
        subject_id: subjectId,
        grade_level_id: gradeLevelId,
        board: board.trim() === '' ? undefined : board.trim(),
        description: description.trim() === '' ? undefined : description.trim(),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>Start a curriculum</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoFocus
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            helperText="Short, and unique across this school."
          />
          <TextField
            label="Board"
            size="small"
            value={board}
            onChange={(event) => setBoard(event.target.value)}
            helperText="Optional. CBSE, ICSE, IB, or the school's own."
          />
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
          />

          <Typography variant="body2" color="text.secondary">
            It is attached to this subject, this class and this academic year, and none
            of those three can be changed afterwards.
          </Typography>

          {!placed ? (
            <Alert severity="warning" variant="outlined">
              This subject, class or academic year has not loaded, so there is nothing to
              attach a curriculum to yet.
            </Alert>
          ) : null}

          {create.error ? (
            <Alert severity="error" variant="outlined">
              {create.error.status === 403
                ? `Your school does not let this account create a curriculum. ${create.error.message}`
                : create.error.message}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={create.isPending || !usable}>
          Create
        </Button>
      </DialogActions>
    </>
  );
}
