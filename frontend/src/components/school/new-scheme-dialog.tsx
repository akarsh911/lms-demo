'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
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
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { WidgetDegraded } from '@/components/widgets/widget-states';
import { useClonePeriodScheme, useCreatePeriodScheme } from '@/hooks/mutation/use-school';
import {
  freeGradeLevels,
  gradeLevelLabel,
  schemeByGrade,
  schemeLabel,
} from '@/lib/school/scheme-grades';
import type { GradeLevelRef, PeriodScheme, SchemeGradeLinks } from '@/types/school';

type Start = 'copy' | 'empty';

export interface NewSchemeDialogProps {
  open: boolean;
  onClose: () => void;
  schemes: readonly PeriodScheme[];
  levels: readonly GradeLevelRef[];
  links: readonly SchemeGradeLinks[] | undefined;
  linksError: unknown;
  sessionId: string | null;
  branchId: string | null;
  onCreated: (scheme: PeriodScheme) => void;
}

export function NewSchemeDialog(props: NewSchemeDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="sm">
      {props.open ? <NewSchemeForm {...props} /> : null}
    </Dialog>
  );
}

function NewSchemeForm({
  onClose,
  schemes,
  levels,
  links,
  linksError,
  sessionId,
  branchId,
  onCreated,
}: NewSchemeDialogProps): React.ReactElement {
  const clone = useClonePeriodScheme();
  const create = useCreatePeriodScheme();

  const copyable = schemes.length > 0;

  const [start, setStart] = React.useState<Start>(copyable ? 'copy' : 'empty');
  const [sourceId, setSourceId] = React.useState(schemes[0]?.id ?? '');
  const [name, setName] = React.useState('');
  const [code, setCode] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [chosen, setChosen] = React.useState<readonly string[]>([]);

  const source = schemes.find((row) => row.id === sourceId);
  const holders = schemeByGrade(links);
  const free = freeGradeLevels(levels, holders);
  const taken = levels.filter((level) => holders.has(level.id));

  const copying = start === 'copy' && source !== undefined;
  const busy = clone.isPending || create.isPending;
  const failure = clone.error ?? create.error;
  const named = name.trim() !== '' && code.trim() !== '';
  const usable = named && (copying || Boolean(sessionId && branchId));

  const toggle = (id: string): void =>
    setChosen((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
    );

  const landed = (created: PeriodScheme): void => {
    onCreated(created);
    onClose();
  };

  const save = (): void => {
    if (!usable) return;
    if (copying && source) {
      clone.mutate(
        {
          schemeId: source.id,
          name: name.trim(),
          code: code.trim(),
          gradeLevelIds: chosen.length > 0 ? [...chosen] : undefined,
        },
        { onSuccess: landed },
      );
      return;
    }
    if (!sessionId || !branchId) return;
    create.mutate(
      {
        academic_session_id: sessionId,
        branch_id: branchId,
        name: name.trim(),
        code: code.trim(),
        ...(description.trim() === '' ? {} : { description: description.trim() }),
      },
      { onSuccess: landed },
    );
  };

  return (
    <>
      <DialogTitle>New pattern of the day</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {copyable ? (
            <FormControl>
              <FormLabel id="new-scheme-start" sx={{ fontSize: 14 }}>
                Start from
              </FormLabel>
              <RadioGroup
                aria-labelledby="new-scheme-start"
                value={start}
                onChange={(event) => setStart(event.target.value as Start)}
              >
                <FormControlLabel
                  value="copy"
                  control={<Radio size="small" disabled={busy} />}
                  label={
                    <Typography variant="body2">
                      A copy of a pattern that already works
                    </Typography>
                  }
                />
                <FormControlLabel
                  value="empty"
                  control={<Radio size="small" disabled={busy} />}
                  label={
                    <Typography variant="body2">Nothing — build it from scratch</Typography>
                  }
                />
              </RadioGroup>
            </FormControl>
          ) : null}

          {start === 'copy' && copyable ? (
            <TextField
              select
              label="Copy of"
              size="small"
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
              disabled={busy}
            >
              {schemes.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {schemeLabel(row)}
                </MenuItem>
              ))}
            </TextField>
          ) : null}

          {copying && source ? (
            <>
              <Alert severity="info" variant="outlined">
                <AlertTitle>What this copies</AlertTitle>
                Every period, every bell schedule and every bell time in{' '}
                {schemeLabel(source)}, including which periods are switched off. The new
                pattern starts with <strong>no timetable</strong>, so any grade you
                attach here has no lessons until one is built for it.
              </Alert>

              <Alert severity="success" variant="outlined">
                <AlertTitle>What this leaves alone</AlertTitle>
                {schemeLabel(source)}, its grades and its timetable. Copying only adds;
                it never edits or replaces a pattern that is already running.
              </Alert>
            </>
          ) : (
            <Alert severity="warning" variant="outlined">
              <AlertTitle>An empty pattern has no periods and no bells</AlertTitle>
              Nothing about the day is settled until you add them, and a grade attached
              to it has a day with nothing in it. Copying a pattern that already works
              and editing the copy is usually faster.
            </Alert>
          )}

          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoFocus
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 120 } }}
            helperText="What this pattern is called. Junior day, Half day, Saturday pattern."
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 32 } }}
            helperText="Short, and unique within this campus and year. A repeat is refused."
          />

          {copying ? null : (
            <TextField
              label="Description"
              size="small"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              multiline
              minRows={2}
              disabled={busy}
            />
          )}

          {copying ? (
            <FormControl component="fieldset" variant="standard" fullWidth>
              <FormLabel component="legend" sx={{ fontSize: 14 }}>
                Grades to move onto the copy
              </FormLabel>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                Optional. You can copy the pattern now and attach grades afterwards.
              </Typography>

              {linksError ? (
                <WidgetDegraded
                  error={linksError}
                  denied="Which grades are already spoken for could not be read, so every grade is listed. A grade that is taken will be refused when you save."
                  unavailable="Which grades are already spoken for could not be read, so every grade is listed. A grade that is taken will be refused when you save."
                />
              ) : null}

              {free.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Every grade level already runs a pattern on this campus, so there is
                  none free to attach. Copy it empty and detach a grade from whichever
                  pattern holds it first.
                </Typography>
              ) : (
                <Box
                  sx={{
                    maxHeight: 220,
                    overflowY: 'auto',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    px: 1.5,
                    py: 0.5,
                    mt: 0.5,
                  }}
                >
                  <FormGroup>
                    {free.map((level) => (
                      <FormControlLabel
                        key={level.id}
                        control={
                          <Checkbox
                            size="small"
                            checked={chosen.includes(level.id)}
                            onChange={() => toggle(level.id)}
                            disabled={busy}
                          />
                        }
                        label={
                          <Typography variant="body2">{gradeLevelLabel(level)}</Typography>
                        }
                      />
                    ))}
                  </FormGroup>
                </Box>
              )}

              {taken.length > 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  Not listed, because each already runs a pattern:{' '}
                  {taken
                    .map(
                      (level) =>
                        `${gradeLevelLabel(level)} (${schemeLabel(
                          schemes.find((row) => row.id === holders.get(level.id)),
                        )})`,
                    )
                    .join(', ')}
                  . Detaching one is a separate, deliberate step — this dialog will not
                  move a grade off the pattern it is running.
                </Typography>
              ) : null}
            </FormControl>
          ) : null}

          {!copying && !(sessionId && branchId) ? (
            <Alert severity="info" variant="outlined">
              A pattern belongs to one campus in one academic year, and this school has
              no {sessionId ? 'campus' : 'academic year'} yet, so there is nothing to
              create it under.
            </Alert>
          ) : null}

          {failure ? (
            <Alert severity="error" variant="outlined">
              {failure.message}
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || !usable}>
          {copying && chosen.length > 0
            ? `Create and attach ${chosen.length} ${chosen.length === 1 ? 'grade' : 'grades'}`
            : 'Create the pattern'}
        </Button>
      </DialogActions>
    </>
  );
}
