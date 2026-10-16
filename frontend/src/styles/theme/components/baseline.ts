import type { Components, Theme } from '@mui/material/styles';

import { rose } from '../colors';
import { brand } from '../tokens';

export const baseline: Components<Theme> = {
  MuiCssBaseline: {
    styleOverrides: {
      body: {
        backgroundColor: brand.canvas,
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'optimizeLegibility',
      },
      '::selection': { backgroundColor: rose[100], color: brand.ink },
      '*::-webkit-scrollbar': { width: 10, height: 10 },
      '*::-webkit-scrollbar-thumb': {
        background: brand.line2,
        borderRadius: 99,
        border: '3px solid transparent',
        backgroundClip: 'content-box',
      },
      '*::-webkit-scrollbar-track': { background: 'transparent' },
    },
  },
};
