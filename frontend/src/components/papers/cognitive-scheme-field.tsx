'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Plus, X } from 'lucide-react';

import { emptyBand, type BandDraft, type SchemeDraft } from './scheme-draft';

const SCHEME_EXPLAINED =
  'A cognitive scheme is a named list of bands, and the name matters: a board ' +
  'ships more than one and they are not interchangeable. Name the one this ' +
  'pattern bands by, then list its bands.';

export function CognitiveSchemeField({
  draft,
  onChange,
  disabled = false,
  problem,
}: {
  draft: SchemeDraft;
  onChange: (next: SchemeDraft) => void;
  disabled?: boolean;
  problem: string | null;
}): React.ReactElement {
  const theme = useTheme();

  const setBand = (id: string, patch: Partial<BandDraft>): void => {
    onChange({
      ...draft,
      bands: draft.bands.map((band) => (band.id === id ? { ...band, ...patch } : band)),
    });
  };

  const removeBand = (id: string): void => {
    onChange({ ...draft, bands: draft.bands.filter((band) => band.id !== id) });
  };

  return (
    <Stack spacing={1.5}>
      <Typography component="h4" variant="body2" sx={{ fontWeight: 700 }}>
        Cognitive scheme
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {SCHEME_EXPLAINED}
      </Typography>

      <TextField
        label="Scheme name"
        size="small"
        value={draft.name}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
        required
        disabled={disabled}
        helperText="The scheme as its board names it, not a description of it."
      />

      <Stack spacing={1.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {draft.bands.map((band, index) => (
          <Box
            component="li"
            key={band.id}
            sx={{
              border: `1px solid ${theme.brand.line}`,
              borderRadius: `${theme.band.radius.sm}px`,
              p: 1.5,
            }}
          >
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  Band {index + 1}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={`Remove band ${index + 1}`}
                  onClick={() => removeBand(band.id)}
                  disabled={disabled || draft.bands.length === 1}
                >
                  <X size={14} />
                </IconButton>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  label="Key"
                  size="small"
                  value={band.key}
                  onChange={(event) => setBand(band.id, { key: event.target.value })}
                  required
                  disabled={disabled}
                  fullWidth
                />
                <TextField
                  label="Label"
                  size="small"
                  value={band.label}
                  onChange={(event) => setBand(band.id, { label: event.target.value })}
                  disabled={disabled}
                  helperText="Optional. The key is used when this is empty."
                  fullWidth
                />
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  label="Share"
                  size="small"
                  type="number"
                  value={band.weight}
                  onChange={(event) => setBand(band.id, { weight: event.target.value })}
                  disabled={disabled}
                  helperText="Percent of the paper"
                  fullWidth
                />
                <TextField
                  label="At least"
                  size="small"
                  type="number"
                  value={band.min}
                  onChange={(event) => setBand(band.id, { min: event.target.value })}
                  disabled={disabled}
                  helperText="Percent"
                  fullWidth
                />
                <TextField
                  label="At most"
                  size="small"
                  type="number"
                  value={band.max}
                  onChange={(event) => setBand(band.id, { max: event.target.value })}
                  disabled={disabled}
                  helperText="Percent"
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
          onClick={() => onChange({ ...draft, bands: [...draft.bands, emptyBand()] })}
          disabled={disabled}
        >
          Add a band
        </Button>
      </Box>

      {problem ? (
        <Alert severity="warning" variant="outlined">
          {problem}
        </Alert>
      ) : null}
    </Stack>
  );
}
