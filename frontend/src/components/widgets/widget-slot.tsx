'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

import {
  IMMERSIVE_MIN_HEIGHT,
  MAIN_PADDING,
  TOP_BAR_BORDER,
  TOP_BAR_HEIGHT,
} from '@/constants/layout';
import type { WidgetPresentation } from '@/types/widget';

/**
 * The box a widget is drawn in, sized by its presentation.
 *
 * A client component because an immersive slot's height depends on the band's
 * spacing scale, which only the theme knows, and `WidgetGrid` is a Server
 * Component that cannot hand a theme callback to `sx`.
 *
 * Every slot stretches its child to the full height it is given, so a card
 * widget's `height: 100%` lines up with its neighbours in a row and an
 * immersive widget fills the viewport.
 */
export function WidgetSlot({
  presentation,
  children,
}: {
  presentation: WidgetPresentation;
  children: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();

  if (presentation !== 'immersive') {
    return <Box sx={{ height: '100%' }}>{children}</Box>;
  }

  // The viewport, less the top bar and the content padding above and below:
  // exactly one screen of workspace once the page header has scrolled away.
  const chrome = `${TOP_BAR_HEIGHT.sm + TOP_BAR_BORDER}px - ${theme.spacing(MAIN_PADDING * 2)}`;

  return (
    <Box
      sx={{
        height: { xs: 'auto', md: `max(${IMMERSIVE_MIN_HEIGHT}px, calc(100dvh - ${chrome}))` },
        // Scroll margin, so jumping to the widget lands it flush under the top bar.
        scrollMarginTop: `${TOP_BAR_HEIGHT.sm + TOP_BAR_BORDER}px`,
      }}
    >
      {children}
    </Box>
  );
}
