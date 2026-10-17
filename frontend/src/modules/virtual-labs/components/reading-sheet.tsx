'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { X } from 'lucide-react';

/**
 * ROOM TO READ, without leaving the bench.
 *
 * The console is a column about 380px wide, which is right for a task and an
 * input box and wrong for eight paragraphs of theory. A panel that long inside
 * it is a thirteen-scroll tube: a student cannot see how much there is, cannot
 * find their way back to a paragraph they have just read, and gives up. That
 * is the honest reason these panels were going unread, and no amount of
 * shortening the prose fixes a column that narrow.
 *
 * So reading gets its own room. It opens OVER the workspace rather than
 * replacing it — the apparatus stays visible behind, because half the point of
 * a teaching panel is to look from the words to the thing they are about — and
 * it is set to a comfortable measure rather than the width of the console.
 *
 * Inside the widget's own frame, not the viewport: the practical runs as a
 * panel on a page and may be one of several, and a sheet that took over the
 * whole window would be the widget reaching outside itself. That also makes it
 * behave in fullscreen, where the frame IS the window.
 */
export function ReadingSheet({
  open,
  title,
  subtitle,
  container,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  /** The widget frame. Keeps the sheet and its scrim inside the practical. */
  container?: HTMLElement;
  onClose: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      container={container}
      // Absolute rather than fixed, so "the screen" means the practical's own
      // frame; without this the scrim would cover the whole application.
      slotProps={{
        root: { style: { position: 'absolute' } },
        backdrop: { sx: { position: 'absolute', backgroundColor: 'rgba(20,16,10,.28)' } },
        paper: {
          sx: {
            position: 'absolute',
            // A measure, not a percentage of whatever room happens to be going:
            // past about 70 characters a line the eye loses its place returning
            // to the left margin, and below ~320 a paragraph turns to confetti.
            width: 'min(620px, 92%)',
            backgroundColor: theme.brand.surface,
            borderLeft: `1px solid ${theme.brand.line2}`,
            display: 'flex',
            flexDirection: 'column',
          },
        },
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.25,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          borderBottom: `1px solid ${theme.brand.line}`,
          backgroundColor: theme.brand.subtle,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            component="h3"
            sx={{ m: 0, fontWeight: 800, fontSize: theme.band.type.h4, color: theme.brand.ink }}
          >
            {title}
          </Typography>
          {subtitle ? (
            <Typography sx={{ mt: 0.25, fontSize: theme.band.type.min, color: theme.brand.tert }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close and go back to the bench">
          <X size={16} />
        </IconButton>
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          px: 2,
          py: 1.5,
          color: theme.brand.text,
          fontSize: theme.band.type.base,
          '& p': { m: 0, mt: 1 },
          '& > svg': { display: 'block', width: '100%', height: 'auto', mt: 1.5 },
        }}
      >
        {children}
      </Box>
    </Drawer>
  );
}
