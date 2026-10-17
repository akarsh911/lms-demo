'use client';

import * as React from 'react';
import { useTheme } from '@mui/material/styles';

import type { ChipTone } from '@/components/ui/chip';
import { OTHER_REGION_TONE, REGION_COLOURS } from '@/constants/timeline';

export function regionTone(region: string): ChipTone {
  return REGION_COLOURS[region]?.tone ?? OTHER_REGION_TONE;
}

export function useRegionColour(): (region: string) => string {
  const theme = useTheme();
  return React.useCallback(
    (region: string) => {
      const hue = REGION_COLOURS[region]?.hue;
      return hue ? theme.hues[hue] : theme.onTint[OTHER_REGION_TONE];
    },
    [theme],
  );
}
