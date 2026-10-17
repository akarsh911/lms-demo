'use client';

import * as React from 'react';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useTheme } from '@mui/material/styles';

/**
 * A numeric answer with its unit: "Ammeter least count [ 0.02 ] A".
 *
 * Kept as TEXT, not `type="number"`: a number input rejects `0,02`, which is
 * how half the world writes a decimal, and silently empties itself on a typo
 * where a student should see what they typed. The owner parses (see
 * `src/modules/virtual-labs/lib/numbers.ts`, `parseDecimal`).
 * `inputMode="decimal"` still brings up the numeric keypad on a phone.
 *
 * `status` is the verdict on the last check, drawn as the outline: `ok` stays
 * green once a value is accepted, `error` is red until the next edit.
 */
export function NumberField({
  id,
  label,
  unit,
  value,
  onChange,
  onEnter,
  status = null,
  disabled = false,
  placeholder,
  fullWidth = true,
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (next: string) => void;
  /** Enter submits, the way a student expects from a single answer box. */
  onEnter?: () => void;
  status?: 'ok' | 'error' | null;
  disabled?: boolean;
  placeholder?: string;
  fullWidth?: boolean;
}): React.ReactElement {
  const theme = useTheme();
  const ok = status === 'ok';

  return (
    <TextField
      id={id}
      label={label}
      size="small"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      error={status === 'error'}
      fullWidth={fullWidth}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onEnter) {
          e.preventDefault();
          onEnter();
        }
      }}
      slotProps={{
        htmlInput: { inputMode: 'decimal', autoComplete: 'off', spellCheck: false },
        input: unit
          ? { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> }
          : undefined,
        inputLabel: { shrink: true },
      }}
      sx={{
        '& input': { fontVariantNumeric: 'tabular-nums' },
        ...(ok
          ? {
              '& .MuiOutlinedInput-notchedOutline, & .Mui-disabled .MuiOutlinedInput-notchedOutline': {
                borderColor: `${theme.hues.green} !important`,
              },
            }
          : null),
      }}
    />
  );
}
