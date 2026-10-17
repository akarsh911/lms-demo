import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

export const SPEECH_GAIN = 8;

export function meterValue(level: number): number {
  return Math.round(Math.min(1, Math.max(0, level * SPEECH_GAIN)) * 100);
}

export function MicLevelMeter({ level, label = 'Microphone level' }: { level: number; label?: string }): React.ReactElement {
  const theme = useTheme();
  const value = meterValue(level);

  return (
    <Box
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      sx={{
        position: 'relative',
        flex: '1 1 auto',
        minWidth: 64,
        height: 8,
        borderRadius: '999px',
        overflow: 'hidden',
        backgroundColor: theme.brand.sunken,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          width: `${value}%`,
          borderRadius: '999px',
          backgroundColor: value > 8 ? theme.hues.green : theme.brand.line2,
          transition: 'width 90ms linear, background-color 200ms',
        }}
      />
    </Box>
  );
}
