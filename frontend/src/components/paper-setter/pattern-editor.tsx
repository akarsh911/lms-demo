'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Plus } from 'lucide-react';

import { Metric } from '@/components/ui/metric';
import { SectionHeader } from '@/components/ui/layout';
import { WidgetLoading } from '@/components/widgets/widget-states';

import type { PresetSummary, TemplateDetail } from './contract';
import {
  useCreateTemplate,
  usePaperSetterTemplate,
  useUpdateTemplate,
} from './hooks';
import { PanelNote } from './panel';
import {
  CHOICE_SPLITS_MARKS,
  DERIVED_MARKS_NOTE,
  MIX_IS_PARSED_BY_THE_SERVICE,
  NOT_WRITABLE,
  PRESET_SEEDS_THE_SECTIONS,
  TYPED_INPUTS_NOTE,
  blankDraft,
  createPayload,
  draftFromBlueprint,
  draftTotals,
  emptySection,
  mixPayload,
  problemFor,
  questionTypeOptions,
  updatePayload,
  validateDraft,
  type PatternDraft,
} from './pattern-draft';
import { PatternSectionCard } from './pattern-section-card';
import { RefusalNotice } from './refusal-notice';

export const MIX_GRAMMAR_HINT =
  'TYPE:MARKS:COUNT, separated by commas — mcq:1:20,short:3:7,long:5:3. The paper service ' +
  'owns that grammar, so if a part of it does not parse it prints the format it wanted ' +
  'rather than this screen guessing.';

export const MIX_DERIVES_THE_REST =
  'The marks, the minutes and the page budget all come out of the mix you typed, so none ' +
  'of them is asked for here. Once it is saved it opens as sections you can adjust.';

export const NAME_IT_YOURSELF =
  'A pattern started from another one needs a name of its own. The pattern you started ' +
  'from is untouched, and papers already set from it still mean what they meant.';

export type EditorStart =
  | { kind: 'blank' }
  | { kind: 'preset'; presetId: string }
  | { kind: 'mix' };

const START_BLANK = 'blank';
const START_MIX = 'mix';
const PRESET_PREFIX = 'preset:';

function startValue(start: EditorStart): string {
  if (start.kind === 'preset') return `${PRESET_PREFIX}${start.presetId}`;
  return start.kind === 'mix' ? START_MIX : START_BLANK;
}

function startFromValue(value: string): EditorStart {
  if (value.startsWith(PRESET_PREFIX)) {
    return { kind: 'preset', presetId: value.slice(PRESET_PREFIX.length) };
  }
  return value === START_MIX ? { kind: 'mix' } : { kind: 'blank' };
}

export function PatternEditor({
  presets,
  classLabel,
  editing,
  onSaved,
  onCancel,
}: {
  presets: readonly PresetSummary[];
  classLabel: string;
  editing: string | null;
  onSaved: (detail: TemplateDetail) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [start, setStart] = React.useState<EditorStart>({ kind: 'blank' });

  const seedId =
    editing !== null ? editing : start.kind === 'preset' ? start.presetId : null;
  const seed = usePaperSetterTemplate(seedId);

  if (editing !== null) {
    if (seed.isPending) return <WidgetLoading rows={4} />;
    if (seed.error) {
      return (
        <RefusalNotice
          error={seed.error}
          title="That pattern could not be opened"
          onRetry={() => void seed.refetch()}
        />
      );
    }
    if (!seed.data) {
      return (
        <Alert severity="info" variant="outlined">
          That pattern is no longer here. Choose another one, or create a new pattern.
        </Alert>
      );
    }
    if (!seed.data.writable) {
      return (
        <Alert severity="info" variant="outlined">
          <AlertTitle>{seed.data.name} cannot be edited</AlertTitle>
          {NOT_WRITABLE}
        </Alert>
      );
    }

    return (
      <PatternForm
        key={`edit:${editing}`}
        initial={draftFromBlueprint(seed.data.blueprint, { name: seed.data.name })}
        templateId={editing}
        onSaved={onSaved}
        onCancel={onCancel}
      />
    );
  }

  return (
    <Stack spacing={2}>
      <TextField
        select
        label="Start from"
        size="small"
        value={startValue(start)}
        onChange={(event) => setStart(startFromValue(event.target.value))}
        helperText={
          start.kind === 'preset' ? PRESET_SEEDS_THE_SECTIONS : 'What this new pattern begins as.'
        }
        sx={{ maxWidth: 480 }}
      >
        <MenuItem value={START_BLANK}>Nothing — one empty section</MenuItem>
        {presets.map((preset) => (
          <MenuItem key={preset.id} value={`${PRESET_PREFIX}${preset.id}`}>
            {preset.name} — {preset.total_marks} marks
          </MenuItem>
        ))}
        <MenuItem value={START_MIX}>A question mix typed out</MenuItem>
      </TextField>

      {start.kind === 'mix' ? (
        <MixForm key="mix" classLabel={classLabel} onSaved={onSaved} onCancel={onCancel} />
      ) : null}

      {start.kind === 'blank' ? (
        <PatternForm
          key="blank"
          initial={blankDraft(classLabel)}
          templateId={null}
          onSaved={onSaved}
          onCancel={onCancel}
        />
      ) : null}

      {start.kind === 'preset' ? (
        seed.isPending ? (
          <WidgetLoading rows={4} />
        ) : seed.error ? (
          <RefusalNotice
            error={seed.error}
            title="That pattern could not be read"
            onRetry={() => void seed.refetch()}
          />
        ) : seed.data ? (
          <PatternForm
            key={`from:${start.presetId}`}
            initial={draftFromBlueprint(seed.data.blueprint, { name: '', classLabel })}
            templateId={null}
            startedFrom={seed.data.name}
            onSaved={onSaved}
            onCancel={onCancel}
          />
        ) : null
      ) : null}
    </Stack>
  );
}

function MixForm({
  classLabel,
  onSaved,
  onCancel,
}: {
  classLabel: string;
  onSaved: (detail: TemplateDetail) => void;
  onCancel: () => void;
}): React.ReactElement {
  const [name, setName] = React.useState('');
  const [mix, setMix] = React.useState('');
  const create = useCreateTemplate();

  const nameMissing = name.trim() === '';
  const mixMissing = mix.trim() === '';

  const save = (): void => {
    if (nameMissing || mixMissing) return;
    create.mutate(mixPayload(name, mix, classLabel), { onSuccess: onSaved });
  };

  return (
    <Stack spacing={2}>
      <TextField
        label="Name this pattern"
        size="small"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Unit test — Light, 25 marks"
        autoComplete="off"
        sx={{ maxWidth: 480 }}
      />
      <TextField
        label="Question mix"
        size="small"
        value={mix}
        onChange={(event) => setMix(event.target.value)}
        placeholder="mcq:1:20,short:3:7,long:5:3"
        spellCheck={false}
        autoComplete="off"
        helperText={MIX_GRAMMAR_HINT}
        sx={{ maxWidth: 620 }}
      />

      <RefusalNotice error={create.error} title="That pattern was not saved" />

      <Stack direction="row" spacing={1}>
        <Button
          variant="contained"
          size="small"
          disabled={create.isPending || nameMissing || mixMissing}
          onClick={save}
        >
          Save and use it
        </Button>
        <Button size="small" onClick={onCancel} disabled={create.isPending}>
          Cancel
        </Button>
      </Stack>

      <PanelNote>{MIX_DERIVES_THE_REST}</PanelNote>
      <PanelNote>{MIX_IS_PARSED_BY_THE_SERVICE}</PanelNote>
    </Stack>
  );
}

function PatternForm({
  initial,
  templateId,
  startedFrom,
  onSaved,
  onCancel,
}: {
  initial: PatternDraft;
  templateId: string | null;
  startedFrom?: string;
  onSaved: (detail: TemplateDetail) => void;
  onCancel: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const [draft, setDraft] = React.useState<PatternDraft>(initial);
  const create = useCreateTemplate();
  const update = useUpdateTemplate();

  const problems = validateDraft(draft);
  const totals = draftTotals(draft);
  const typeOptions = questionTypeOptions(draft);
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;

  const patch = (changes: Partial<PatternDraft>): void => {
    setDraft((current) => ({ ...current, ...changes }));
  };

  const save = (): void => {
    if (problems.length > 0) return;
    if (templateId === null) {
      create.mutate(createPayload(draft), { onSuccess: onSaved });
      return;
    }
    update.mutate(
      { templateId, request: updatePayload(draft) },
      { onSuccess: onSaved },
    );
  };

  const nameProblem = problemFor(problems, { field: 'name' });
  const minutesProblem = problemFor(problems, { field: 'durationMin' });
  const pagesProblem = problemFor(problems, { field: 'pages' });
  const passProblem = problemFor(problems, { field: 'passMarkPct' });
  const sectionsProblem = problemFor(problems, { field: 'sections' });

  return (
    <Stack spacing={2.5}>
      <TextField
        label="Name this pattern"
        size="small"
        value={draft.name}
        onChange={(event) => patch({ name: event.target.value })}
        placeholder="Unit test — Light, 25 marks"
        error={nameProblem !== undefined}
        helperText={nameProblem ?? (startedFrom ? NAME_IT_YOURSELF : 'What you will pick it by later.')}
        autoComplete="off"
        sx={{ maxWidth: 560 }}
      />

      <Box
        sx={{
          border: `1px solid ${theme.brand.line}`,
          borderRadius: `${theme.band.radius.sm}px`,
          p: 1.5,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Metric label="Marks" value={totals.marks} />
          <Metric label="Questions" value={totals.questionCount} />
          {totals.splitsMarks ? (
            <Metric label="Marks printed" value={totals.printedMarks} />
          ) : null}
          <Metric label="Sections" value={draft.sections.length} />
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          {totals.splitsMarks ? CHOICE_SPLITS_MARKS : DERIVED_MARKS_NOTE}
        </Typography>
      </Box>

      <Box>
        <SectionHeader
          title="Sections"
          subtitle="A heading, an instruction, and the questions inside it"
          actions={
            <Button
              size="small"
              startIcon={<Plus size={14} />}
              onClick={() =>
                patch({
                  sections: [
                    ...draft.sections,
                    emptySection(draft.sections.map((section) => section.id)),
                  ],
                })
              }
            >
              Add a section
            </Button>
          }
        />

        {sectionsProblem ? (
          <Alert severity="warning" variant="outlined">
            {sectionsProblem}
          </Alert>
        ) : null}

        <Stack component="ul" spacing={0} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {draft.sections.map((section, index) => (
            <PatternSectionCard
              key={section.key}
              section={section}
              index={index}
              problems={problems}
              typeOptions={typeOptions}
              removable={draft.sections.length > 1}
              onChange={(next) =>
                patch({
                  sections: draft.sections.map((entry) =>
                    entry.key === section.key ? next : entry,
                  ),
                })
              }
              onRemove={() =>
                patch({
                  sections: draft.sections.filter((entry) => entry.key !== section.key),
                })
              }
            />
          ))}
        </Stack>
      </Box>

      <Box>
        <SectionHeader
          title="What the sections cannot say"
          subtitle="Not derivable from a question mix, so these are yours to set"
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField
            label="Minutes allowed"
            size="small"
            value={draft.durationMin}
            onChange={(event) => patch({ durationMin: event.target.value })}
            error={minutesProblem !== undefined}
            helperText={minutesProblem}
            autoComplete="off"
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            fullWidth
          />
          <TextField
            label="Pages"
            size="small"
            value={draft.pages}
            onChange={(event) => patch({ pages: event.target.value })}
            error={pagesProblem !== undefined}
            helperText={pagesProblem}
            autoComplete="off"
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            fullWidth
          />
          <TextField
            label="Pass mark, percent"
            size="small"
            value={draft.passMarkPct}
            onChange={(event) => patch({ passMarkPct: event.target.value })}
            error={passProblem !== undefined}
            helperText={passProblem}
            autoComplete="off"
            slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            fullWidth
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
          <TextField
            label="Subject this is for"
            size="small"
            value={draft.subject}
            onChange={(event) => patch({ subject: event.target.value })}
            helperText="Optional. Left empty, the pattern fits any subject."
            autoComplete="off"
            fullWidth
          />
          <TextField
            label="Class label, as printed"
            size="small"
            value={draft.classLabel}
            onChange={(event) => patch({ classLabel: event.target.value })}
            helperText="Optional. Printed on the paper's heading."
            autoComplete="off"
            fullWidth
          />
        </Stack>
      </Box>

      <RefusalNotice
        error={error}
        title={templateId === null ? 'That pattern was not saved' : 'That change was not saved'}
      />

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="contained"
          size="small"
          disabled={pending || problems.length > 0}
          onClick={save}
        >
          {templateId === null ? 'Save and use it' : 'Save the changes'}
        </Button>
        <Button size="small" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        {problems.length > 0 ? (
          <Typography variant="caption" color="text.secondary">
            {problems.length === 1
              ? 'One thing is still to fix: '
              : `${problems.length} things are still to fix, starting with: `}
            {problems[0]!.message}
          </Typography>
        ) : null}
      </Stack>

      <PanelNote>{DERIVED_MARKS_NOTE}</PanelNote>
      <PanelNote>{TYPED_INPUTS_NOTE}</PanelNote>
    </Stack>
  );
}
