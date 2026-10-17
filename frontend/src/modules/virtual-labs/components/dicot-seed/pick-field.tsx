'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

/**
 * One cell of the observation table, or one blank in a conclusion sentence: a
 * choice from a fixed list of phrases.
 *
 * A native `<select>` rather than a menu: the options are whole clauses ("where
 * the seed was joined to the pod"), a phone renders those as a full-screen
 * wheel that is far easier to read than a popover, and the whole thing is one
 * tab stop. `status` shows the marking afterwards without a second legend.
 */
export function PickField({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  status = null,
  placeholder = '—',
  inline = false,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  disabled?: boolean;
  status?: 'ok' | 'error' | null;
  placeholder?: string;
  /** Drop the label and shrink: for a blank inside a sentence. */
  inline?: boolean;
}): React.ReactElement {
  const theme = useTheme();
  const edge =
    status === 'ok' ? theme.hues.green : status === 'error' ? theme.hues.red : theme.brand.line2;

  const select = (
    <Box
      component="select"
      id={id}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      sx={{
        width: inline ? 'auto' : '100%',
        maxWidth: '100%',
        font: 'inherit',
        fontSize: theme.band.type.base - 1,
        color: theme.brand.ink,
        backgroundColor: status === 'ok' ? theme.tints.green : status === 'error' ? theme.tints.red : theme.brand.surface,
        border: `1.5px solid ${edge}`,
        borderRadius: `${Math.min(theme.band.radius.sm, 10)}px`,
        px: 0.75,
        py: inline ? 0.25 : 0.6,
        cursor: disabled ? 'default' : 'pointer',
        '&:focus-visible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 1 },
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Box>
  );

  if (inline) return select;

  return (
    <Box sx={{ minWidth: 0, width: '100%' }}>
      <Typography
        component="label"
        htmlFor={id}
        sx={{
          display: 'block',
          fontSize: theme.band.type.min,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: theme.brand.tert,
          mb: 0.25,
        }}
      >
        {label}
      </Typography>
      {select}
    </Box>
  );
}
