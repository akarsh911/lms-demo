'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Divider } from '@/components/ui/layout';
import {
  useCreateBlueprint,
  useDeleteBlueprint,
  useUpdateBlueprint,
} from '@/hooks/mutation/use-blueprints';
import { useGradeLevels } from '@/hooks/query/use-school';
import { useMdmSubjects } from '@/hooks/query/use-mdm';
import {
  BLUEPRINT_STATUS_LABELS,
  REUSABLE_TEMPLATE,
  REUSABLE_TEMPLATE_EXPLAINED,
  schemeProblem,
  sessionBinding,
  weightageProblem,
} from '@/lib/papers/blueprint';
import {
  BLUEPRINT_STATUSES,
  type BlueprintPatch,
  type BlueprintRow,
  type BlueprintStatus,
} from '@/types/blueprints';
import type { Capability } from '@/types/core';
import type { AcademicSessionRow } from '@/types/school';
import { CognitiveSchemeField } from './cognitive-scheme-field';
import { PaperFormError } from './form-failure';
import {
  schemeDraftFrom,
  schemeFromDraft,
  unitDraftsFrom,
  unitsFromDrafts,
  weightageChoiceFor,
  type SchemeDraft,
  type UnitDraft,
  type WeightageChoice,
} from './scheme-draft';
import { UnitWeightageField } from './unit-weightage-field';

type YearBinding = 'year' | 'reusable';

const BINDING_LABELS: Record<YearBinding, string> = {
  year: 'Belongs to one academic year',
  reusable: `${REUSABLE_TEMPLATE} — carries across years`,
};

interface BlueprintDialogProps {
  open: boolean;
  onClose: () => void;
  blueprint: BlueprintRow | undefined;
  sessions: readonly AcademicSessionRow[];
  defaultSessionId: string | null;
  readCapability: Capability | undefined;
  mayDelete: boolean;
  onCreated: (id: string) => void;
}

export function BlueprintDialog(props: BlueprintDialogProps): React.ReactElement {
  return (
    <Dialog open={props.open} onClose={props.onClose} fullWidth maxWidth="md">
      {props.open ? <BlueprintForm key={props.blueprint?.id ?? 'new'} {...props} /> : null}
    </Dialog>
  );
}

function BlueprintForm({
  onClose,
  blueprint,
  sessions,
  defaultSessionId,
  readCapability,
  mayDelete,
  onCreated,
}: BlueprintDialogProps): React.ReactElement {
  const create = useCreateBlueprint();
  const update = useUpdateBlueprint();
  const remove = useDeleteBlueprint();

  const grades = useGradeLevels();
  const subjects = useMdmSubjects();

  const [binding, setBinding] = React.useState<YearBinding>('year');
  const [sessionId, setSessionId] = React.useState(defaultSessionId ?? '');
  const [gradeId, setGradeId] = React.useState(blueprint?.grade_level_id ?? '');
  const [subjectId, setSubjectId] = React.useState(blueprint?.subject_id ?? '');
  const [code, setCode] = React.useState(blueprint?.code ?? '');
  const [name, setName] = React.useState(blueprint?.name ?? '');
  const [description, setDescription] = React.useState(blueprint?.description ?? '');
  const [marks, setMarks] = React.useState(numberInput(blueprint?.total_marks));
  const [minutes, setMinutes] = React.useState(numberInput(blueprint?.duration_minutes));
  const [status, setStatus] = React.useState<BlueprintStatus>(blueprint?.status ?? 'draft');
  const [scheme, setScheme] = React.useState<SchemeDraft>(
    schemeDraftFrom(blueprint?.cognitive_scheme),
  );
  const [weightage, setWeightage] = React.useState<WeightageChoice>(
    weightageChoiceFor(blueprint?.unit_weightage),
  );
  const [units, setUnits] = React.useState<UnitDraft[]>(
    unitDraftsFrom(blueprint?.unit_weightage),
  );
  const [confirming, setConfirming] = React.useState(false);

  const nextScheme = schemeFromDraft(scheme);
  const nextUnits = unitsFromDrafts(units);
  const schemeFault = schemeProblem(nextScheme);
  const weightageFault = weightage === 'document' ? weightageProblem(nextUnits) : null;

  const marksValue = Number(marks);
  const minutesValue = Number(minutes);
  const marksUsable = marks.trim() !== '' && Number.isFinite(marksValue) && marksValue > 0;
  const minutesUsable =
    minutes.trim() !== '' && Number.isFinite(minutesValue) && minutesValue > 0;

  const usable =
    name.trim() !== '' &&
    marksUsable &&
    minutesUsable &&
    schemeFault === null &&
    weightageFault === null &&
    (blueprint
      ? true
      : code.trim() !== '' &&
        gradeId !== '' &&
        subjectId !== '' &&
        (binding === 'reusable' || sessionId !== ''));

  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const existingBinding = blueprint ? sessionBinding(blueprint, readCapability) : null;

  const save = (): void => {
    if (blueprint) {
      const patch: BlueprintPatch = {};
      if (name.trim() !== (blueprint.name ?? '')) patch.name = name.trim();
      if (description.trim() !== (blueprint.description ?? '')) {
        patch.description = description.trim() === '' ? null : description.trim();
      }
      if (marksValue !== blueprint.total_marks) patch.total_marks = marksValue;
      if (minutesValue !== blueprint.duration_minutes) {
        patch.duration_minutes = minutesValue;
      }
      if (status !== blueprint.status) patch.status = status;
      patch.cognitive_scheme = nextScheme;
      patch.unit_weightage = weightage === 'none' ? null : { units: nextUnits };
      update.mutate({ id: blueprint.id, patch }, { onSuccess: onClose });
      return;
    }

    create.mutate(
      {
        grade_level_id: gradeId,
        subject_id: subjectId,
        code: code.trim(),
        name: name.trim(),
        total_marks: marksValue,
        duration_minutes: minutesValue,
        cognitive_scheme: nextScheme,
        status,
        ...(binding === 'reusable' ? {} : { academic_session_id: sessionId }),
        ...(description.trim() === '' ? {} : { description: description.trim() }),
        ...(weightage === 'none' ? {} : { unit_weightage: { units: nextUnits } }),
      },
      {
        onSuccess: (row) => {
          onCreated(row.id);
          onClose();
        },
      },
    );
  };

  return (
    <>
      <DialogTitle>{blueprint ? 'Edit this pattern' : 'New paper pattern'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {blueprint ? (
            <Alert severity="info" variant="outlined">
              <AlertTitle>
                {existingBinding === 'reusable'
                  ? REUSABLE_TEMPLATE
                  : existingBinding === 'withheld'
                    ? 'Which year this belongs to is not shown to you'
                    : 'Bound to one academic year'}
              </AlertTitle>
              {existingBinding === 'reusable'
                ? REUSABLE_TEMPLATE_EXPLAINED
                : existingBinding === 'withheld'
                  ? 'Your account may not read the academic year on a pattern, so this cannot be shown. It is settled either way and cannot be changed here.'
                  : 'The year, subject, grade, code and version fix what a pattern is for. Record a new version rather than changing them.'}
            </Alert>
          ) : null}

          {blueprint ? null : (
            <>
              <FormControl>
                <FormLabel id="blueprint-binding-label">Which years it is for</FormLabel>
                <RadioGroup
                  aria-labelledby="blueprint-binding-label"
                  value={binding}
                  onChange={(event) => setBinding(event.target.value as YearBinding)}
                >
                  {(['year', 'reusable'] as const).map((value) => (
                    <FormControlLabel
                      key={value}
                      value={value}
                      control={<Radio size="small" />}
                      label={BINDING_LABELS[value]}
                    />
                  ))}
                </RadioGroup>
              </FormControl>

              {binding === 'reusable' ? (
                <Alert severity="info" variant="outlined">
                  {REUSABLE_TEMPLATE_EXPLAINED}
                </Alert>
              ) : (
                <TextField
                  select
                  label="Academic year"
                  size="small"
                  value={sessionId}
                  onChange={(event) => setSessionId(event.target.value)}
                  required
                >
                  {sessions.map((session) => (
                    <MenuItem key={session.id} value={session.id}>
                      {session.name ?? session.code ?? session.id}
                      {session.is_current ? ' (current)' : ''}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select
                  label="Grade"
                  size="small"
                  value={gradeId}
                  onChange={(event) => setGradeId(event.target.value)}
                  required
                  fullWidth
                >
                  {(grades.data?.rows ?? []).map((grade) => (
                    <MenuItem key={grade.id} value={grade.id}>
                      {grade.name ?? grade.code ?? grade.id}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Subject"
                  size="small"
                  value={subjectId}
                  onChange={(event) => setSubjectId(event.target.value)}
                  required
                  fullWidth
                >
                  {(subjects.data?.rows ?? []).map((subject) => (
                    <MenuItem key={subject.id} value={subject.id}>
                      {subject.name ?? subject.code ?? subject.id}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <TextField
                label="Code"
                size="small"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
                helperText="Unique with its version. Fixed once created."
              />
            </>
          )}

          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            helperText="Up to 200 characters."
          />

          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            multiline
            minRows={2}
            helperText="Optional."
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Marked out of"
              size="small"
              type="number"
              value={marks}
              onChange={(event) => setMarks(event.target.value)}
              required
              error={marks.trim() !== '' && !marksUsable}
              helperText={
                marks.trim() !== '' && !marksUsable
                  ? 'A total has to be above zero.'
                  : 'Required.'
              }
              fullWidth
            />
            <TextField
              label="Minutes allowed"
              size="small"
              type="number"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              required
              error={minutes.trim() !== '' && !minutesUsable}
              helperText={
                minutes.trim() !== '' && !minutesUsable
                  ? 'A duration has to be above zero.'
                  : 'Required, unlike on a paper.'
              }
              fullWidth
            />
          </Stack>

          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(event) => setStatus(event.target.value as BlueprintStatus)}
          >
            {BLUEPRINT_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {BLUEPRINT_STATUS_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          <Divider />

          <CognitiveSchemeField
            draft={scheme}
            onChange={setScheme}
            problem={schemeFault}
          />

          <Divider />

          <UnitWeightageField
            choice={weightage}
            onChoice={setWeightage}
            units={units}
            onUnits={setUnits}
            problem={weightageFault}
          />

          {confirming ? (
            <Alert severity="error" variant="outlined">
              Deleting this pattern deletes its sections and their constraints. Papers
              built from it keep their own record and stop naming it.
            </Alert>
          ) : null}

          {blueprint ? (
            <Typography variant="caption" color="text.secondary">
              Saving rewrites the cognitive scheme and the unit weighting as they read
              above, including the choice between no weighting and an empty one.
            </Typography>
          ) : null}

          <PaperFormError error={failure} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <span>
          {blueprint && mayDelete ? (
            confirming ? (
              <Button
                color="error"
                size="small"
                variant="contained"
                disabled={busy}
                onClick={() => remove.mutate(blueprint.id, { onSuccess: onClose })}
              >
                Delete it and everything under it
              </Button>
            ) : (
              <Button
                color="error"
                size="small"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                Delete
              </Button>
            )
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

function numberInput(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}
