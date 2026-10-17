'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Plus, X } from 'lucide-react';

import { emptyUnit, type UnitDraft, type WeightageChoice } from './scheme-draft';

const CHOICE_LABELS: Record<WeightageChoice, string> = {
  none: 'No per-unit target — cover every chapter',
  document: 'Weight it by unit',
};

const EMPTY_DOCUMENT_WARNING =
  'A weighting that lists no unit is not the same as having none: it says a ' +
  'weighting document exists for this pattern and names nothing. Choose the ' +
  'option above instead if you meant there is no per-unit target at all.';

export function UnitWeightageField({
  choice,
  onChoice,
  units,
  onUnits,
  disabled = false,
  problem,
}: {
  choice: WeightageChoice;
  onChoice: (next: WeightageChoice) => void;
  units: readonly UnitDraft[];
  onUnits: (next: UnitDraft[]) => void;
  disabled?: boolean;
  problem: string | null;
}): React.ReactElement {
  const theme = useTheme();

  const setUnit = (id: string, patch: Partial<UnitDraft>): void => {
    onUnits(units.map((unit) => (unit.id === id ? { ...unit, ...patch } : unit)));
  };

  return (
    <Stack spacing={1.5}>
      <FormControl>
        <FormLabel id="unit-weightage-label">Unit weighting</FormLabel>
        <RadioGroup
          aria-labelledby="unit-weightage-label"
          value={choice}
          onChange={(event) => onChoice(event.target.value as WeightageChoice)}
        >
          {(['none', 'document'] as const).map((value) => (
            <FormControlLabel
              key={value}
              value={value}
              disabled={disabled}
              control={<Radio size="small" />}
              label={CHOICE_LABELS[value]}
            />
          ))}
        </RadioGroup>
      </FormControl>

      {choice === 'none' ? (
        <Typography variant="caption" color="text.secondary">
          Nothing is recorded, so the pattern carries no per-unit target and covers
          every chapter.
        </Typography>
      ) : null}

      {choice === 'document' ? (
        <>
          {units.length === 0 ? (
            <Alert severity="warning" variant="outlined">
              {EMPTY_DOCUMENT_WARNING}
            </Alert>
          ) : null}

          <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {units.map((unit, index) => (
              <Box
                component="li"
                key={unit.id}
                sx={{
                  border: `1px solid ${theme.brand.line}`,
                  borderRadius: `${theme.band.radius.sm}px`,
                  p: 1.5,
                }}
              >
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                      Unit {index + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label={`Remove unit ${index + 1}`}
                      onClick={() => onUnits(units.filter((row) => row.id !== unit.id))}
                      disabled={disabled}
                    >
                      <X size={14} />
                    </IconButton>
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField
                      label="Key"
                      size="small"
                      value={unit.key}
                      onChange={(event) => setUnit(unit.id, { key: event.target.value })}
                      required
                      disabled={disabled}
                      fullWidth
                    />
                    <TextField
                      label="Label"
                      size="small"
                      value={unit.label}
                      onChange={(event) => setUnit(unit.id, { label: event.target.value })}
                      disabled={disabled}
                      fullWidth
                    />
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                    <TextField
                      label="Share"
                      size="small"
                      type="number"
                      value={unit.weight}
                      onChange={(event) => setUnit(unit.id, { weight: event.target.value })}
                      disabled={disabled}
                      helperText="Percent of the paper"
                      fullWidth
                    />
                    <TextField
                      label="Marks"
                      size="small"
                      type="number"
                      value={unit.marks}
                      onChange={(event) => setUnit(unit.id, { marks: event.target.value })}
                      disabled={disabled}
                      helperText="Optional, instead of or beside a share"
                      fullWidth
                    />
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>

          <Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={16} />}
              onClick={() => onUnits([...units, emptyUnit()])}
              disabled={disabled}
            >
              Add a unit
            </Button>
          </Box>

          {problem ? (
            <Alert severity="warning" variant="outlined">
              {problem}
            </Alert>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
