'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { WidgetDegraded } from '@/components/widgets/widget-states';
import {
  useDeletePeriodScheme,
  useUpdatePeriodScheme,
} from '@/hooks/mutation/use-school';
import {
  useBellSchedules,
  usePeriods,
  useSchemeGrades,
  useTimetables,
} from '@/hooks/query/use-school';
import { schemeLabel } from '@/lib/school/scheme-grades';
import { StatusSelect } from './mdm/mdm-dialog';
import type { PeriodScheme } from '@/types/school';

const STATUS_LABELS: Record<string, string> = {
  active: 'Active — offered wherever a pattern is chosen',
  inactive: 'Inactive — kept, but not offered',
};

function countOf(one: number, singular: string, plural: string): string {
  return `${one} ${one === 1 ? singular : plural}`;
}

export function SchemeEditDialog({
  scheme,
  mayDelete,
  onClose,
  onDeleted,
}: {
  scheme: PeriodScheme;
  mayDelete: boolean;
  onClose: () => void;
  onDeleted: () => void;
}): React.ReactElement {
  const update = useUpdatePeriodScheme();
  const remove = useDeletePeriodScheme();

  const periods = usePeriods(scheme.id);
  const bells = useBellSchedules(scheme.id);
  const grades = useSchemeGrades(scheme.id);
  const timetables = useTimetables(scheme.id);

  const [name, setName] = React.useState(scheme.name ?? '');
  const [code, setCode] = React.useState(scheme.code ?? '');
  const [description, setDescription] = React.useState(scheme.description ?? '');
  const [status, setStatus] = React.useState(scheme.status ?? 'active');
  const [confirming, setConfirming] = React.useState(false);

  const busy = update.isPending || remove.isPending;
  const failure = update.error ?? remove.error;
  const usable = name.trim() !== '' && code.trim() !== '';

  const periodCount = periods.data?.rows.length ?? 0;
  const bellCount = bells.data?.rows.length ?? 0;
  const gradeCount = grades.data?.rows.length ?? 0;
  const timetableRows = timetables.data?.rows ?? [];

  const standsOn = timetableRows.length;
  const countsKnown = Boolean(periods.data && bells.data && grades.data);

  const save = (): void => {
    if (!usable) return;
    update.mutate(
      {
        id: scheme.id,
        patch: {
          name: name.trim(),
          code: code.trim(),
          description: description.trim(),
          status,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>{schemeLabel(scheme)}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 120 } }}
          />
          <TextField
            label="Code"
            size="small"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
            disabled={busy}
            slotProps={{ htmlInput: { maxLength: 32 } }}
            helperText="Unique within this campus and year. A repeat is refused."
          />
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            disabled={busy}
          />
          <StatusSelect value={status} onChange={setStatus} labels={STATUS_LABELS} />

          <Alert severity="info" variant="outlined">
            Which campus and which academic year a pattern belongs to are fixed when it
            is created and cannot be changed here.
          </Alert>

          {mayDelete ? (
            <Stack spacing={1.5}>
              {timetables.isError ? (
                <WidgetDegraded
                  error={timetables.error}
                  denied="Whether a timetable was built on this pattern could not be read, so deleting it is not offered here."
                  unavailable="Whether a timetable was built on this pattern could not be read, so deleting it is not offered here."
                />
              ) : null}

              {timetables.data && standsOn > 0 ? (
                <Alert severity="info" variant="outlined">
                  <AlertTitle>This pattern cannot be deleted</AlertTitle>
                  {countOf(standsOn, 'timetable stands', 'timetables stand')} on it, and
                  the database refuses to delete a pattern a timetable is built against.
                  Delete those timetables first, or set this pattern to inactive so it
                  stops being offered while the week it describes stays readable.
                </Alert>
              ) : null}

              {timetables.data && standsOn === 0 && !confirming ? (
                <Button
                  size="small"
                  color="error"
                  onClick={() => setConfirming(true)}
                  disabled={busy}
                  sx={{ alignSelf: 'flex-start' }}
                >
                  Delete this pattern
                </Button>
              ) : null}

              {timetables.data && standsOn === 0 && confirming ? (
                <Alert severity="error" variant="outlined">
                  <AlertTitle>Deleting {schemeLabel(scheme)} also deletes</AlertTitle>
                  <Stack component="ul" spacing={0.5} sx={{ pl: 2, m: 0, mb: 1 }}>
                    <li>
                      {countsKnown
                        ? countOf(periodCount, 'period', 'periods')
                        : 'every period'}{' '}
                      in the pattern
                    </li>
                    <li>
                      {countsKnown
                        ? countOf(bellCount, 'bell schedule', 'bell schedules')
                        : 'every bell schedule'}{' '}
                      under it, and every time in them
                    </li>
                    <li>
                      the attachment of{' '}
                      {countsKnown ? countOf(gradeCount, 'grade', 'grades') : 'each grade'}{' '}
                      that runs it, which then runs no pattern at all until one is given
                    </li>
                  </Stack>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    None of it can be undone, and the grades keep their sections and
                    pupils — only the day they were running goes.
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1.5 }}>
                    If any calendar day runs this pattern, the database refuses the whole
                    delete and nothing is removed.
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                    >
                      Keep it
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="contained"
                      disabled={busy}
                      onClick={() => remove.mutate(scheme.id, { onSuccess: onDeleted })}
                    >
                      Delete it anyway
                    </Button>
                  </Stack>
                </Alert>
              ) : null}
            </Stack>
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
          Save
        </Button>
      </DialogActions>
    </>
  );
}
