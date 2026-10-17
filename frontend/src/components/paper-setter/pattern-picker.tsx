'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Pencil, Trash2 } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Metric } from '@/components/ui/metric';
import { WidgetLoading } from '@/components/widgets/widget-states';

import type { PresetSummary, TemplateDetail, TemplateSummary } from './contract';
import { useDeleteTemplate } from './hooks';
import { WizardPanel, PanelNote } from './panel';
import { PatternDeleteDialog } from './pattern-delete-dialog';
import { DERIVED_MARKS_NOTE, NOT_WRITABLE, mayEdit, savedPatterns } from './pattern-draft';
import { PatternEditor } from './pattern-editor';
import { RefusalNotice } from './refusal-notice';
import type { ComposeConfig, PatternKind } from './state';

const KIND_LABELS: readonly { kind: PatternKind; label: string }[] = [
  { kind: 'preset', label: 'A pattern your school ships with' },
  { kind: 'template', label: 'A pattern this school has saved' },
  { kind: 'mix', label: 'A question mix typed out' },
  { kind: 'new', label: 'A new pattern, built here' },
];

export const MIX_HINT =
  'TYPE:MARKS:COUNT, separated by commas — mcq:1:20,short:3:7,long:5:3. If it does not ' +
  'parse, the paper service prints the grammar it wanted and a corrected line with your ' +
  'own numbers in it, which is more use than anything this screen could check for you.';

export const EXACTLY_ONE =
  'Exactly one of the four is sent. Choosing one clears the others here, because the ' +
  'paper service refuses both none and two — and two would mean a paper whose shape ' +
  'nothing records.';

export const NEW_PATTERN_IS_SAVED_FIRST =
  'A pattern built here is saved under its name before the paper is set, so the whole ' +
  'department can pick the same one next term. It becomes this paper’s pattern the moment ' +
  'it saves.';

export function PatternPicker({
  config,
  presets,
  templates,
  classLabel,
  isPending,
  error,
  onRetry,
  onKind,
  onPreset,
  onTemplate,
  onMix,
}: {
  config: ComposeConfig;
  presets: readonly PresetSummary[];
  templates: readonly TemplateSummary[];
  classLabel: string;
  isPending: boolean;
  error: unknown;
  onRetry?: () => void;
  onKind: (kind: PatternKind) => void;
  onPreset: (preset: string) => void;
  onTemplate: (templateId: string) => void;
  onMix: (mix: string) => void;
}): React.ReactElement {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<TemplateSummary | null>(null);
  const [saved, setSaved] = React.useState<TemplateDetail | null>(null);
  const remove = useDeleteTemplate();

  const savedRows = React.useMemo(() => savedPatterns(templates), [templates]);
  const chosenPreset = presets.find((preset) => preset.id === config.preset);
  const chosenTemplate = savedRows.find((row) => row.id === config.templateId);

  const onSaved = (detail: TemplateDetail): void => {
    setEditingId(null);
    setSaved(detail);
    onTemplate(detail.id);
  };

  const confirmDelete = (templateId: string): void => {
    remove.mutate(templateId, {
      onSuccess: () => {
        setDeleting(null);
        if (editingId === templateId) setEditingId(null);
        if (saved?.id === templateId) setSaved(null);
        if (config.templateId === templateId) onTemplate('');
      },
    });
  };

  return (
    <WizardPanel
      title="The shape of the paper"
      subheader="How many questions of what kind, and worth how many marks"
    >
      {isPending ? <WidgetLoading rows={2} /> : null}
      {error ? (
        <RefusalNotice error={error} title="The patterns could not be listed" onRetry={onRetry} />
      ) : null}

      <FormControl>
        <FormLabel id="paper-setter-pattern-label">Pattern</FormLabel>
        <RadioGroup
          aria-labelledby="paper-setter-pattern-label"
          value={config.pattern}
          onChange={(event) => {
            setEditingId(null);
            onKind(event.target.value as PatternKind);
          }}
        >
          {KIND_LABELS.map((option) => (
            <FormControlLabel
              key={option.kind}
              value={option.kind}
              control={<Radio size="small" />}
              label={option.label}
            />
          ))}
        </RadioGroup>
      </FormControl>

      {saved && config.pattern === 'template' && config.templateId === saved.id ? (
        <Alert severity="success" variant="outlined" onClose={() => setSaved(null)}>
          <AlertTitle>“{saved.name}” is saved and is now this paper’s pattern</AlertTitle>
          {saved.total_marks ?? 0} marks over {saved.question_count ?? 0} questions. It is a
          saved pattern now, so anyone setting a paper here can pick it.
        </Alert>
      ) : null}

      {config.pattern === 'preset' && presets.length > 0 ? (
        <TextField
          select
          label="Pattern"
          size="small"
          value={config.preset}
          onChange={(event) => onPreset(event.target.value)}
          sx={{ maxWidth: 420 }}
        >
          <MenuItem value="">Not chosen</MenuItem>
          {presets.map((preset) => (
            <MenuItem key={preset.id} value={preset.id}>
              {preset.name}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      {chosenPreset && config.pattern === 'preset' ? (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Metric label="Marks" value={chosenPreset.total_marks} />
          <Metric label="Questions" value={chosenPreset.question_count} />
          <Metric label="Minutes" value={chosenPreset.duration_min} />
          {chosenPreset.subject ? (
            <Box sx={{ alignSelf: 'center' }}>
              <EmergeChip label={`for ${chosenPreset.subject}`} tone="indigo" />
            </Box>
          ) : null}
        </Stack>
      ) : null}

      {config.pattern === 'template' ? (
        savedRows.length > 0 ? (
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1.5}
              sx={{ alignItems: { sm: 'flex-start' } }}
            >
              <TextField
                select
                label="Saved pattern"
                size="small"
                value={config.templateId}
                onChange={(event) => {
                  setEditingId(null);
                  onTemplate(event.target.value);
                }}
                sx={{ width: { xs: '100%', sm: 420 } }}
              >
                <MenuItem value="">Not chosen</MenuItem>
                {savedRows.map((template) => (
                  <MenuItem key={template.id} value={template.id}>
                    {template.name}
                  </MenuItem>
                ))}
              </TextField>

              <Stack direction="row" spacing={1} sx={{ flex: 'none', pt: { sm: 0.5 } }}>
                <Button
                  size="small"
                  startIcon={<Pencil size={14} />}
                  disabled={!mayEdit(chosenTemplate) || editingId !== null}
                  onClick={() => setEditingId(config.templateId)}
                >
                  Edit it
                </Button>
                <Button
                  size="small"
                  color="error"
                  startIcon={<Trash2 size={14} />}
                  disabled={!mayEdit(chosenTemplate)}
                  onClick={() => setDeleting(chosenTemplate ?? null)}
                >
                  Delete it
                </Button>
              </Stack>
            </Stack>

            {chosenTemplate ? (
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Metric label="Marks" value={chosenTemplate.total_marks ?? 0} />
                <Metric label="Questions" value={chosenTemplate.question_count ?? 0} />
                <Metric label="Minutes" value={chosenTemplate.duration_min ?? 0} />
                {chosenTemplate.subject ? (
                  <Box sx={{ alignSelf: 'center' }}>
                    <EmergeChip label={`for ${chosenTemplate.subject}`} tone="indigo" />
                  </Box>
                ) : null}
              </Stack>
            ) : null}

            {chosenTemplate && !chosenTemplate.writable ? (
              <Alert severity="info" variant="outlined">
                <AlertTitle>{chosenTemplate.name} cannot be edited</AlertTitle>
                {NOT_WRITABLE}
              </Alert>
            ) : null}

            {editingId !== null ? (
              <PatternEditor
                presets={presets}
                classLabel={classLabel}
                editing={editingId}
                onSaved={onSaved}
                onCancel={() => setEditingId(null)}
              />
            ) : null}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            This school has saved no patterns yet, so there is nothing to reuse. Choose one
            of the patterns above, type a mix, or build a new pattern.
          </Typography>
        )
      ) : null}

      {config.pattern === 'mix' ? (
        <TextField
          label="Question mix"
          size="small"
          value={config.mix}
          onChange={(event) => onMix(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          helperText={MIX_HINT}
          sx={{ maxWidth: 620 }}
        />
      ) : null}

      {config.pattern === 'new' ? (
        <PatternEditor
          presets={presets}
          classLabel={classLabel}
          editing={null}
          onSaved={onSaved}
          onCancel={() => onKind(presets.length > 0 ? 'preset' : 'template')}
        />
      ) : null}

      <PatternDeleteDialog
        template={deleting}
        pending={remove.isPending}
        error={remove.error}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      <PanelNote>{EXACTLY_ONE}</PanelNote>
      <PanelNote>{NEW_PATTERN_IS_SAVED_FIRST}</PanelNote>
      <PanelNote>{DERIVED_MARKS_NOTE}</PanelNote>
    </WizardPanel>
  );
}
