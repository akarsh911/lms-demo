'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { useReducedMotion } from '@/hooks/use-reduced-motion';

const CARDS = [
  { tint: 'violet', rotate: -10, x: 18 },
  { tint: 'teal', rotate: 6, x: 54 },
  { tint: 'blue', rotate: -2, x: 36 },
] as const;

export function DeckIllustration({
  title,
  caption,
  animated = false,
}: {
  title: string;
  caption?: string;
  animated?: boolean;
}): React.ReactElement {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const moving = animated && !reduced;

  return (
    <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 4 }} role="status">
      <Box
        component="svg"
        viewBox="0 0 160 120"
        aria-hidden="true"
        sx={{
          width: 160,
          height: 120,
          '@keyframes deck-shuffle': {
            '0%, 100%': { transform: 'translateY(0) rotate(var(--r))' },
            '50%': { transform: 'translateY(-8px) rotate(calc(var(--r) * -1))' },
          },
          '& .deck-card': {
            transformBox: 'fill-box',
            transformOrigin: 'center',
            transform: 'rotate(var(--r))',
            animation: moving ? 'deck-shuffle 1.6s ease-in-out infinite' : 'none',
          },
          '& .deck-card:nth-of-type(2)': { animationDelay: '.2s' },
          '& .deck-card:nth-of-type(3)': { animationDelay: '.4s' },
        }}
      >
        {CARDS.map((card) => (
          <g key={card.tint} className="deck-card" style={{ ['--r' as string]: `${card.rotate}deg` }}>
            <rect
              x={card.x}
              y={22}
              width={70}
              height={88}
              rx={10}
              fill={theme.tints[card.tint]}
              stroke={theme.onTint[card.tint]}
              strokeWidth={1.5}
            />
            <rect x={card.x + 12} y={40} width={46} height={6} rx={3} fill={theme.onTint[card.tint]} opacity={0.55} />
            <rect x={card.x + 12} y={54} width={32} height={6} rx={3} fill={theme.onTint[card.tint]} opacity={0.35} />
          </g>
        ))}
      </Box>
      <Box>
        <Typography variant="h5" component="p">
          {title}
        </Typography>
        {caption ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {caption}
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}
