'use client';

import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { Eye, EyeOff, Lock } from 'lucide-react';

export interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  autoFocus?: boolean;
  required?: boolean;
  error?: boolean;
  icon?: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  // Labelled from above by the form, with a placeholder and no leading icon.
  plain?: { placeholder: string };
}

export function PasswordField({ id, name, label, autoComplete, autoFocus, required, error, icon, value, onChange, plain }: PasswordFieldProps): React.ReactElement {
  const [shown, setShown] = React.useState(false);

  return (
    <TextField
      id={id}
      name={name}
      label={plain ? undefined : label}
      placeholder={plain?.placeholder}
      type={shown ? 'text' : 'password'}
      autoComplete={autoComplete}
      autoFocus={autoFocus}
      required={required}
      error={error}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      fullWidth
      slotProps={{
        input: {
          startAdornment: plain ? undefined : <InputAdornment position="start">{icon ?? <Lock size={18} />}</InputAdornment>,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton aria-label={`${shown ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={shown} aria-controls={id} onClick={() => setShown((was) => !was)} edge="end" size="small">
                {shown ? <EyeOff size={18} /> : <Eye size={18} />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
