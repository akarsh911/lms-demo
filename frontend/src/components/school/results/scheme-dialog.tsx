'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { MdmFormActions, MdmFormError, StatusSelect } from '../mdm/mdm-dialog';
import { RESULT_SCHEME_STATUSES, type ResultScheme } from '@/types/result-scheme';
import {
  useCreateResultScheme,
  useDeleteResultScheme,
  useReviseResultScheme,
} from '@/hooks/mutation/use-result-schemes';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft — still being composed',
  active: 'Active — frozen, and in use',
  inactive: 'Inactive — kept, but not offered',
};

export function SchemeDialog({
  scheme,
  sessionId,
  mayDelete,
  onClose,
  onSaved,
  onDeleted,
}: {
  scheme: ResultScheme | undefined;
  sessionId: string | null;
  mayDelete: boolean;
  onClose: () => void;
  onSaved: (saved: ResultScheme, superseded: boolean) => void;
  onDeleted: () => void;
}): React.ReactElement {
  const create = useCreateResultScheme();
  const revise = useReviseResultScheme();
  const remove = useDeleteResultScheme();

  const [name, setName] = React.useState(scheme?.name ?? '');
  const [code, setCode] = React.useState(scheme?.code ?? '');
  const [description, setDescription] = React.useState(scheme?.description ?? '');
  const [total, setTotal] = React.useState(
    scheme?.total_marks === undefined ? '100' : String(scheme.total_marks),
  );
  const [status, setStatus] = React.useState<string>(scheme?.status ?? 'draft');

  const parsedTotal = Number.parseFloat(total);
  const totalUsable = Number.isFinite(parsedTotal) && parsedTotal > 0;
  const usable = name.trim() !== '' && code.trim() !== '' && totalUsable;
  const busy = create.isPending || revise.isPending || remove.isPending;
  const failure = create.error ?? revise.error ?? remove.error;
  const codeChanged = scheme !== undefined && code.trim() !== scheme.code;

  const save = (): void => {
    if (!usable) return;
    if (scheme) {
      revise.mutate(
        {
          id: scheme.id,
          patch: {
            name: name.trim(),
            code: code.trim(),
            description: description.trim(),
            total_marks: parsedTotal,
            status: status as ResultScheme['status'],
          },
        },
        { onSuccess: (saved) => onSaved(saved, saved.id !== scheme.id) },
      );
      return;
    }
    if (!sessionId) return;
    create.mutate(
      {
        academic_session_id: sessionId,
        name: name.trim(),
        code: code.trim(),
        total_marks: parsedTotal,
        ...(description.trim() === '' ? {} : { description: description.trim() }),
      },
      { onSuccess: (saved) => onSaved(saved, false) },
    );
  };

  return (
    <>
      <DialogTitle>{scheme ? 'Edit result scheme' : 'New result scheme'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoFocus
            helperText="What a teacher will recognise it by, such as Science, Class 10."
          />

          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            helperText={
              scheme
                ? 'A new code creates a successor if this scheme already composes a subject. The code is unique within the year.'
                : 'Short and unique within the year, such as SCI-10.'
            }
          />

          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
          />

          <TextField
            label="Out of"
            size="small"
            type="number"
            value={total}
            onChange={(event) => setTotal(event.target.value)}
            error={total !== '' && !totalUsable}
            helperText={
              totalUsable
                ? 'The parts below have to add up to exactly this before the scheme can be activated.'
                : 'What the scheme is out of has to be above zero.'
            }
          />

          {scheme ? (
            <StatusSelect
              value={status}
              onChange={setStatus}
              options={RESULT_SCHEME_STATUSES}
              labels={STATUS_LABELS}
            />
          ) : (
            <Alert severity="info" variant="outlined">
              A scheme is created in draft. Its parts can only be written while it is a
              draft, and it is activated once they add up to what it is out of.
            </Alert>
          )}

          {scheme && codeChanged ? (
            <Alert severity="warning" variant="outlined">
              If this scheme already composes a subject, saving under a new code does
              not edit it. It copies the scheme, its parts and their sources to a new
              one, and the marks already given keep the scheme they were given under.
            </Alert>
          ) : null}

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          scheme && mayDelete
            ? () => remove.mutate(scheme.id, { onSuccess: onDeleted })
            : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable && (Boolean(scheme) || Boolean(sessionId))}
      />
    </>
  );
}
