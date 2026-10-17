'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

const fall = keyframes`
  0% { transform: translate(0, -20px) rotate(0deg); opacity: 1; }
  100% { transform: translate(var(--dx), 420px) rotate(720deg); opacity: 0; }
`;

const COLOURS = ['#B5535E', '#F2C14E', '#2B8A66', '#7B6FD6', '#E8705C', '#3E8ED0'];

// A one-shot burst; remounted with a new key for every celebration.
export function Confetti(): React.ReactElement {
  const bits = React.useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: (i * 37) % 100,
        dx: `${((i * 53) % 120) - 60}px`,
        delay: (i % 12) * 45,
        colour: COLOURS[i % COLOURS.length],
        w: 6 + (i % 4) * 2,
      })),
    [],
  );
  return (
    <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 2 }}>
      {bits.map((b, i) => (
        <Box
          key={i}
          style={{ ['--dx' as string]: b.dx }}
          sx={{ position: 'absolute', top: 0, left: `${b.left}%`, width: b.w, height: b.w * 1.6, bgcolor: b.colour, borderRadius: '2px', animation: `${fall} 1.8s cubic-bezier(.2,.6,.4,1) ${b.delay}ms both` }}
        />
      ))}
    </Box>
  );
}
