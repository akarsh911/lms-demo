'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Paperclip } from 'lucide-react';

import { CONTENT_KINDS, MAX_ASSET_BYTES } from '@/constants/library';
import { useApplyPlacements } from '@/hooks/mutation/use-library';
import {
  UPLOAD_STAGE_LABEL,
  useFileMaterial,
  type UploadStage,
} from '@/hooks/mutation/use-library-write';
import { fileSizeLine, isDigestible } from '@/lib/library/checksum';
import { isPdfFileName } from '@/lib/library/preview';
import { ApiError } from '@/services/api';
import { AssetUploadError } from '@/services/library';
import type { ContentKind, ContentPlacement } from '@/types/library';

import { IngestModeChoice, type IngestChoice } from './ingest-mode-choice';
import {
  PlacementPicker,
  PlacementReport,
  UNPLACED_DRAFT,
  draftProblem,
  isEmptyPlan,
  planFor,
  type PlacementDraft,
  type PlacementOption,
} from './placement-picker';

export interface MaterialDialogProps {
  open: boolean;
  onClose: () => void;
  offeringId: string;
  subjectId: string | undefined;
  subjectName: string;
  curriculumId: string | undefined;
  options: readonly PlacementOption[];
  syllabusPending: boolean;
  syllabusFailed: boolean;
  mayPlace: boolean;
}

export function MaterialDialog(props: MaterialDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <MaterialForm {...props} /> : null}
    </Dialog>
  );
}

function MaterialForm({
  onClose,
  offeringId,
  subjectId,
  subjectName,
  curriculumId,
  options,
  syllabusPending,
  syllabusFailed,
  mayPlace,
}: MaterialDialogProps): React.ReactElement {
  const file = useFileMaterial();
  const place = useApplyPlacements();
  const [chosen, setChosen] = React.useState<File | null>(null);
  const [title, setTitle] = React.useState('');
  const [kind, setKind] = React.useState<ContentKind>('document');
  const [description, setDescription] = React.useState('');
  const [publish, setPublish] = React.useState(true);
  const [ingest, setIngest] = React.useState<IngestChoice>('prepared');
  const [stage, setStage] = React.useState<UploadStage>('idle');
  const [placement, setPlacement] = React.useState<PlacementDraft>(UNPLACED_DRAFT);
  const [filedId, setFiledId] = React.useState<string | null>(null);
  const [placedRows, setPlacedRows] = React.useState<ContentPlacement[]>([]);

  const pick = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.files?.[0] ?? null;
    event.target.value = '';
    setChosen(next);
    if (next && title.trim() === '') {
      setTitle(next.name.replace(/\.[^.]+$/, ''));
    }
  };

  const oversized = chosen !== null && chosen.size > MAX_ASSET_BYTES;
  const emptyFile = chosen !== null && chosen.size === 0;
  const deferrable = chosen !== null && isPdfFileName(chosen.name);
  const immediate = deferrable && ingest === 'immediate';
  const problem = draftProblem(placement);
  const busy = file.isPending || place.isPending;
  const filed = filedId !== null;
  const usable =
    title.trim() !== '' && problem === null && !busy && !oversized && !emptyFile;

  const placeIt = (itemId: string): void => {
    const plan = planFor(placedRows, placement, curriculumId, itemId);
    if (isEmptyPlan(plan)) {
      onClose();
      return;
    }
    place.mutate(plan, {
      onSuccess: (result) => {
        setPlacedRows((rows) => [...rows, ...result.created]);
        if (result.failures.length === 0) onClose();
      },
    });
  };

  const submit = (): void => {
    if (!usable) return;
    if (filedId !== null) {
      placeIt(filedId);
      return;
    }
    file.mutate(
      {
        file: chosen,
        onStage: setStage,
        item: {
          title: title.trim(),
          audience: 'offering',
          kind,
          subject_offering_id: offeringId,
          subject_id: subjectId,
          description: description.trim() === '' ? undefined : description.trim(),
          status: publish ? 'published' : 'draft',
          ...(immediate ? { ingest_mode: 'now' as const } : {}),
        },
      },
      {
        onSuccess: (item) => {
          setStage('idle');
          setFiledId(item.id);
          placeIt(item.id);
        },
        onError: () => setStage('idle'),
      },
    );
  };

  const unusableBrowser = chosen !== null && !isDigestible();

  return (
    <>
      <DialogTitle>
        Add material to {subjectName}
        <Typography variant="body2" color="text.secondary">
          Filed against this class only. Pupils in other classes taking the same
          subject will not see it.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Box>
            <Stack direction="row" spacing={1}>
              <Button
                component="label"
                variant="outlined"
                startIcon={<Paperclip size={16} />}
                disabled={busy || filed}
              >
                {chosen ? 'Choose a different file' : 'Choose a file'}
                <input type="file" hidden onChange={pick} />
              </Button>
              {chosen ? (
                <Button onClick={() => setChosen(null)} disabled={busy || filed}>
                  Clear the file
                </Button>
              ) : null}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {chosen
                ? `${chosen.name} — ${fileSizeLine(chosen.size)}`
                : 'Optional. Without one this files a title and a note that pupils can read.'}
            </Typography>
          </Box>

          {oversized && chosen ? (
            <Alert severity="error" variant="outlined">
              {`This file is ${fileSizeLine(chosen.size)}. The largest file your school ` +
                `accepts is ${fileSizeLine(MAX_ASSET_BYTES)}, so it will not be sent. ` +
                'Choose a smaller file, or clear it and file a title and a note on their own.'}
            </Alert>
          ) : null}

          {emptyFile ? (
            <Alert severity="error" variant="outlined">
              {'This file is empty, so there is nothing to send. A file usually ends up ' +
                'this way when an export or a download did not finish. Check it on your ' +
                'computer and choose it again, or clear it and file a title and a note on ' +
                'their own.'}
            </Alert>
          ) : null}

          {unusableBrowser ? (
            <Alert severity="error" variant="outlined">
              This page is not on a secure connection, so the browser will not
              compute the checksum your school requires for an upload.
            </Alert>
          ) : null}

          <TextField
            label="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            size="small"
            fullWidth
            required
            disabled={filed}
            helperText="What a pupil will see in the list."
          />

          <TextField
            select
            label="What this is"
            value={kind}
            onChange={(event) => setKind(event.target.value as ContentKind)}
            size="small"
            fullWidth
            disabled={filed}
          >
            {CONTENT_KINDS.map((row) => (
              <MenuItem key={row.value} value={row.value}>
                {row.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            size="small"
            fullWidth
            multiline
            minRows={2}
            disabled={filed}
            helperText="Optional. What it covers, or what to do with it."
          />

          <FormControlLabel
            control={
              <Switch
                checked={publish}
                onChange={(event) => setPublish(event.target.checked)}
                size="small"
                disabled={filed}
              />
            }
            label="Let the class see it straight away"
          />

          {chosen ? (
            <IngestModeChoice
              value={ingest}
              onChange={setIngest}
              deferrable={deferrable}
              disabled={busy || filed}
            />
          ) : null}

          {mayPlace ? (
            <PlacementPicker
              value={placement}
              onChange={setPlacement}
              options={options}
              loading={syllabusPending}
              failed={syllabusFailed}
              missing={!curriculumId}
              disabled={busy}
            />
          ) : null}

          {filed ? (
            <Alert severity="success" variant="outlined">
              The material is filed against this class. Only its place in the syllabus
              is outstanding, and it can be left out.
            </Alert>
          ) : null}

          {busy ? (
            <Stack spacing={1}>
              <LinearProgress />
              <Typography variant="body2" color="text.secondary" aria-live="polite">
                {place.isPending
                  ? 'Placing it in the syllabus…'
                  : UPLOAD_STAGE_LABEL[stage]}
              </Typography>
            </Stack>
          ) : null}

          {file.isError ? (
            <Alert severity="error" variant="outlined">
              {file.error instanceof ApiError && file.error.status === 503
                ? 'Your school has no file store switched on yet, so a file cannot be ' +
                  'kept. A title and a description can still be filed without one.'
                : file.error.message}
              {file.error instanceof AssetUploadError ? (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  You can still file this without the file: clear the file and press
                  File it again.
                </Typography>
              ) : null}
            </Alert>
          ) : null}

          {place.data ? (
            <PlacementReport result={place.data} options={options} />
          ) : null}

          {place.isError ? (
            <Alert severity="warning" variant="outlined">
              {`The material is filed, but it was not placed in the syllabus. ${place.error.message}`}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {filed ? 'Close' : 'Cancel'}
        </Button>
        <Button variant="contained" onClick={submit} disabled={!usable}>
          {primaryLabel(filed, busy)}
        </Button>
      </DialogActions>
    </>
  );
}

function primaryLabel(filed: boolean, busy: boolean): string {
  if (filed) return busy ? 'Placing' : 'Place it';
  return busy ? 'Filing' : 'File it';
}
