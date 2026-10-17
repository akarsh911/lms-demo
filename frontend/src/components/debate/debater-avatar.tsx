'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { keyframes, useTheme } from '@mui/material/styles';
import { Bot } from 'lucide-react';

import { Avatar } from '@/components/ui/row';

const breathe = keyframes`
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
`;

export function DebaterAvatar({
  kind,
  name,
  level,
  active,
  size = 52,
}: {
  kind: 'student' | 'ai';
  name: string;
  level: number;
  active: boolean;
  size?: number;
}): React.ReactElement {
  const theme = useTheme();
  const hue = kind === 'student' ? theme.hues.green : theme.hues.violet;
  const spread = active ? 3 + Math.min(1, level) * 14 : 0;

  return (
    <Box sx={{ position: 'relative', width: size, height: size, flex: 'none' }} aria-hidden="true">
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          boxShadow: `0 0 0 ${spread}px ${hue}`,
          opacity: active ? 0.4 : 0,
          transition: 'box-shadow 90ms linear, opacity 200ms',
          animation: active && level < 0.05 ? `${breathe} 1.6s ease-in-out infinite` : 'none',
        }}
      />
      {kind === 'student' ? (
        <Box sx={{ position: 'relative' }}>
          <Avatar name={name} size={size} />
        </Box>
      ) : (
        <Box
          sx={{
            position: 'relative',
            width: size,
            height: size,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            backgroundColor: theme.tints.violet,
            color: theme.onTint.violet,
          }}
        >
          <Bot size={size * 0.46} strokeWidth={1.8} />
        </Box>
      )}
    </Box>
  );
}
