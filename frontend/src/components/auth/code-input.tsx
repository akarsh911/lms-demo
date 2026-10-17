'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import type { Theme } from '@mui/material/styles';

export const CODE_LENGTH = 6;

const NON_DIGITS = /\D/g;
const RECOVERY_MAX_LENGTH = 32;

interface CodeInputProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  autoFocus?: boolean;
  recovery?: boolean;
  autoSubmit?: boolean;
  onComplete?: () => void;
}

function boxSx(filled: boolean, error: boolean) {
  return (theme: Theme) => ({
    flex: 1,
    minWidth: 0,
    width: '100%',
    height: 56,
    p: 0,
    textAlign: 'center' as const,
    borderRadius: '14px',
    border: `1.5px solid ${error ? theme.palette.error.main : theme.brand.line2}`,
    bgcolor: filled ? theme.brand.surface : theme.brand.subtle,
    color: 'text.primary',
    typography: 'h3',
    fontFamily: theme.typography.fontFamily,
    outline: 'none',
    caretColor: theme.palette.primary.main,
    transition: 'border-color 160ms, background-color 160ms, box-shadow 160ms',
    '&:focus': {
      borderColor: error ? theme.palette.error.main : theme.palette.primary.main,
      boxShadow: theme.shadows[1],
    },
  });
}

export function CodeInput({ name, label, value, onChange, error = false, autoFocus, recovery = false, autoSubmit = false, onComplete }: CodeInputProps): React.ReactElement {
  const boxes = React.useRef<Array<HTMLInputElement | null>>([]);
  const completedByUser = React.useRef(false);
  const digitsValue = value.replace(NON_DIGITS, '').slice(0, CODE_LENGTH);

  React.useEffect(() => {
    if (recovery || !completedByUser.current || digitsValue.length !== CODE_LENGTH) return;
    completedByUser.current = false;
    if (onComplete) onComplete();
    else if (autoSubmit) boxes.current[0]?.form?.requestSubmit();
  }, [digitsValue, recovery, autoSubmit, onComplete]);

  const emit = (next: string): void => {
    completedByUser.current = next.length === CODE_LENGTH;
    onChange(next);
  };

  if (recovery) {
    return (
      <TextField
        name={name}
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\s/g, '').slice(0, RECOVERY_MAX_LENGTH))}
        error={error}
        autoFocus={autoFocus}
        autoComplete="off"
        fullWidth
        slotProps={{ htmlInput: { inputMode: 'text', spellCheck: false, autoCapitalize: 'none', 'aria-invalid': error || undefined } }}
      />
    );
  }

  const code = digitsValue;

  const focusBox = (index: number): void => {
    const target = boxes.current[Math.max(0, Math.min(index, CODE_LENGTH - 1))];
    target?.focus();
    target?.select();
  };

  const fill = (index: number, digits: string): void => {
    if (!digits) return;
    const start = digits.length >= CODE_LENGTH ? 0 : Math.min(index, code.length);
    const next = (code.slice(0, start) + digits).slice(0, CODE_LENGTH);
    emit(next);
    focusBox(next.length);
  };

  const replaceAt = (index: number, digit: string): void => {
    const at = Math.min(index, code.length);
    emit((code.slice(0, at) + digit + code.slice(at + 1)).slice(0, CODE_LENGTH));
    focusBox(at + 1);
  };

  const onInput = (index: number, digits: string): void => {
    const previous = code[index];
    if (previous && digits.length === 2 && digits.includes(previous)) {
      replaceAt(index, digits.startsWith(previous) ? digits.slice(1) : digits.slice(0, 1));
      return;
    }
    fill(index, digits);
  };

  const onKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      replaceAt(index, event.key);
      return;
    }
    switch (event.key) {
      case 'Backspace': {
        event.preventDefault();
        if (code[index]) {
          emit(code.slice(0, index) + code.slice(index + 1));
          return;
        }
        if (index > 0) {
          emit(code.slice(0, index - 1) + code.slice(index));
          focusBox(index - 1);
        }
        return;
      }
      case 'ArrowLeft':
        event.preventDefault();
        focusBox(index - 1);
        return;
      case 'ArrowRight':
        event.preventDefault();
        focusBox(Math.min(index + 1, code.length));
        return;
      default:
        break;
    }
  };

  return (
    <Box role="group" aria-label={label} sx={{ display: 'flex', gap: { xs: 0.75, sm: 1 } }}>
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <Box
          key={index}
          component="input"
          ref={(element: HTMLInputElement | null) => {
            boxes.current[index] = element;
          }}
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          aria-invalid={error || undefined}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus={autoFocus && index === 0}
          value={code[index] ?? ''}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => onKeyDown(index, event)}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => onInput(index, event.target.value.replace(NON_DIGITS, ''))}
          onPaste={(event: React.ClipboardEvent<HTMLInputElement>) => {
            event.preventDefault();
            fill(index, event.clipboardData.getData('text').replace(NON_DIGITS, ''));
          }}
          onFocus={(event: React.FocusEvent<HTMLInputElement>) => {
            if (index > code.length) {
              focusBox(code.length);
              return;
            }
            event.target.select();
          }}
          sx={boxSx(Boolean(code[index]), error)}
        />
      ))}
      <input type="hidden" name={name} value={code} />
    </Box>
  );
}
