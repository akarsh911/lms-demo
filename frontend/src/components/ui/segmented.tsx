'use client';

import * as React from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

// One of a few, always exactly one chosen: a click on the chosen option changes nothing.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}): React.ReactElement {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      aria-label={ariaLabel}
      onChange={(_, next: T | null) => {
        if (next !== null) onChange(next);
      }}
      // Its own width, even as a child of a stretching Stack.
      sx={{ alignSelf: 'flex-start', flexWrap: 'wrap', maxWidth: '100%' }}
    >
      {options.map((opt) => (
        <ToggleButton key={opt.value} value={opt.value}>
          {opt.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
