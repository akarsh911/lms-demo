'use client';

import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import OutlinedInput from '@mui/material/OutlinedInput';
import { Search, X } from 'lucide-react';

// A search box that looks like one: a glass on the left, a clear on the right, and a name instead of a floating label.
export function SearchField({
  label,
  value,
  onChange,
  width = 320,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  width?: number | string;
}): React.ReactElement {
  return (
    <OutlinedInput
      type="search"
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={label}
      inputProps={{ 'aria-label': label }}
      startAdornment={
        <InputAdornment position="start">
          <Search size={16} aria-hidden />
        </InputAdornment>
      }
      endAdornment={
        value ? (
          <InputAdornment position="end">
            <IconButton size="small" edge="end" aria-label="Clear the search" onClick={() => onChange('')}>
              <X size={14} />
            </IconButton>
          </InputAdornment>
        ) : null
      }
      sx={{
        width: { xs: '100%', sm: width },
        borderRadius: '999px',
        // The browser's own clear button would sit beside ours.
        '& input::-webkit-search-cancel-button': { display: 'none' },
      }}
    />
  );
}
