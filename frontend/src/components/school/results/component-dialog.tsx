'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { MdmFormActions, MdmFormError } from '../mdm/mdm-dialog';
import {
  AGGREGATION_HINTS,
  AGGREGATION_LABELS,
  formatMarks,
} from '@/lib/school/result-composition';
import {
  useCreateResultComponent,
  useDeleteResultComponent,
  useUpdateResultComponent,
} from '@/hooks/mutation/use-result-schemes';
import {
  RESULT_AGGREGATIONS,
  type ResultAggregation,
  type ResultComponent,
  type ResultComponentWrite,
} from '@/types/result-scheme';

export function ComponentDialog({
  component,
  schemeId,
  totalMarks,
  weightOfOthers,
  defaultPosition,
  mayDelete,
  onClose,
}: {
  component: ResultComponent | undefined;
  schemeId: string;
  totalMarks: number;
  weightOfOthers: number;
  defaultPosition: number;
  mayDelete: boolean;
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateResultComponent();
  const update = useUpdateResultComponent();
  const remove = useDeleteResultComponent();

  const [name, setName] = React.useState(component?.name ?? '');
  const [maximum, setMaximum] = React.useState(
    component?.maximum_marks === undefined ? '' : String(component.maximum_marks),
  );
  const [weight, setWeight] = React.useState(
    component?.weight === undefined ? '' : String(component.weight),
  );
  const [aggregation, setAggregation] = React.useState<ResultAggregation>(
    component?.aggregation ?? 'single',
  );
  const [takeBest, setTakeBest] = React.useState(
    component?.take_best === undefined ? '' : String(component.take_best),
  );
  const [position, setPosition] = React.useState(
    String(component?.position ?? defaultPosition),
  );

  const parsedMaximum = Number.parseFloat(maximum);
  const parsedWeight = Number.parseFloat(weight);
  const parsedTakeBest = Number.parseInt(takeBest, 10);
  const parsedPosition = Number.parseInt(position, 10);

  const maximumUsable = Number.isFinite(parsedMaximum) && parsedMaximum > 0;
  const weightUsable = Number.isFinite(parsedWeight) && parsedWeight > 0;
  const bestOf = aggregation === 'best_of';
  const takeBestUsable = !bestOf || (Number.isFinite(parsedTakeBest) && parsedTakeBest > 0);
  const positionUsable = Number.isFinite(parsedPosition) && parsedPosition >= 0;
  const usable =
    name.trim() !== '' && maximumUsable && weightUsable && takeBestUsable && positionUsable;

  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const projected = weightOfOthers + (weightUsable ? parsedWeight : 0);
  const shortfall = totalMarks - projected;

  const save = (): void => {
    if (!usable) return;
    const body: ResultComponentWrite = {
      name: name.trim(),
      maximum_marks: parsedMaximum,
      weight: parsedWeight,
      aggregation,
      position: parsedPosition,
    };
    if (component) {
      update.mutate(
        { id: component.id, body: { ...body, take_best: bestOf ? parsedTakeBest : null } },
        { onSuccess: onClose },
      );
      return;
    }
    create.mutate(
      {
        schemeId,
        body: bestOf ? { ...body, take_best: parsedTakeBest } : body,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>{component ? 'Edit this part' : 'Add a part'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoFocus
            helperText="Half-yearly, Class tests, Practical."
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Marked out of"
              size="small"
              type="number"
              value={maximum}
              onChange={(event) => setMaximum(event.target.value)}
              error={maximum !== '' && !maximumUsable}
              helperText="What one sitting of this is out of — 40 for a half-yearly."
              fullWidth
              required
            />
            <TextField
              label="Carries"
              size="small"
              type="number"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
              error={weight !== '' && !weightUsable}
              helperText={`How many of the ${formatMarks(totalMarks)} this part is worth.`}
              fullWidth
              required
            />
          </Stack>

          <Alert
            severity={
              Math.round(shortfall * 100) === 0
                ? 'success'
                : shortfall > 0
                  ? 'info'
                  : 'warning'
            }
            variant="outlined"
          >
            {Math.round(shortfall * 100) === 0
              ? `Saving this accounts for all ${formatMarks(totalMarks)} marks.`
              : shortfall > 0
                ? `Saving this accounts for ${formatMarks(projected)} of ${formatMarks(totalMarks)} — ${formatMarks(shortfall)} would still be unaccounted for.`
                : `Saving this accounts for ${formatMarks(projected)} of ${formatMarks(totalMarks)} — ${formatMarks(-shortfall)} too many.`}
          </Alert>

          <TextField
            select
            label="How the linked sources combine"
            size="small"
            value={aggregation}
            onChange={(event) => setAggregation(event.target.value as ResultAggregation)}
            helperText={AGGREGATION_HINTS[aggregation]}
          >
            {RESULT_AGGREGATIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {AGGREGATION_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>

          {bestOf ? (
            <TextField
              label="How many count"
              size="small"
              type="number"
              value={takeBest}
              onChange={(event) => setTakeBest(event.target.value)}
              error={takeBest !== '' && !takeBestUsable}
              required
              helperText="Best two of four class tests is 2. At least this many sources have to be linked."
            />
          ) : null}

          <TextField
            label="Shown at position"
            size="small"
            type="number"
            value={position}
            onChange={(event) => setPosition(event.target.value)}
            error={position !== '' && !positionUsable}
            helperText="Lower comes first."
          />

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          component && mayDelete
            ? () => remove.mutate(component.id, { onSuccess: onClose })
            : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable}
      />
    </>
  );
}
