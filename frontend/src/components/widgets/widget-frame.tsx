'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Maximize2, Minimize2 } from 'lucide-react';

import { useFullscreen } from '@/hooks/use-fullscreen';

/**
 * The surface a workspace widget draws itself in: a card with a title bar, a
 * body that fills whatever height the grid gives it, and a control to go
 * fullscreen.
 *
 * A widget chooses to use this, the same way a card widget chooses `<Card>`:
 * the grid decides how big the slot is (`presentation` in the widget registry),
 * the frame decides how to fill it. A card-sized widget can use it too, to get
 * the fullscreen control and nothing else.
 *
 * # Overlays inside a fullscreen frame
 *
 * The browser shows ONLY the fullscreen element and its descendants. Anything
 * portalled to `document.body` (an MUI Menu, Popover or Dialog, by default) is
 * then invisible. Components inside a frame read `useWidgetFrame().container`
 * and portal there instead, or render in place with `position: fixed`, which
 * works in both modes because the frame never creates a containing block.
 */
interface WidgetFrameValue {
  /** True when the frame is fullscreen, natively or as an overlay. */
  fullscreen: boolean;
  /** Where overlays belong: the frame while fullscreen, `undefined` (the body) otherwise. */
  container: HTMLElement | undefined;
}

const WidgetFrameContext = React.createContext<WidgetFrameValue>({
  fullscreen: false,
  container: undefined,
});

/** Frame state for anything drawn inside one. Outside a frame: not fullscreen, portal to body. */
export function useWidgetFrame(): WidgetFrameValue {
  return React.useContext(WidgetFrameContext);
}

export function WidgetFrame({
  title,
  eyebrow,
  actions,
  allowFullscreen = true,
  bodySx,
  children,
}: {
  title: React.ReactNode;
  /** A short line above the title: the course, chapter or context. */
  eyebrow?: React.ReactNode;
  /** Right-aligned header controls. Wraps under the title on narrow screens. */
  actions?: React.ReactNode;
  allowFullscreen?: boolean;
  bodySx?: React.ComponentProps<typeof Box>['sx'];
  children: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  // Destructured: the callback ref goes to the element and nothing else, so it
  // is never confused with the values rendered from.
  const { ref: frameRef, active, mode, element, toggle } = useFullscreen();

  const value = React.useMemo<WidgetFrameValue>(
    () => ({ fullscreen: active, container: active ? (element ?? undefined) : undefined }),
    [active, element],
  );

  return (
    <WidgetFrameContext.Provider value={value}>
      <Card
        ref={frameRef}
        // Lets anything inside find the frame itself: a tour spotlighting a
        // control in the header, an overlay measuring the workspace.
        data-widget-frame=""
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          // The containing block for anything a widget draws ABSOLUTELY over
          // itself — a reading sheet, a panel that slides in. Without it such an
          // overlay resolves against the viewport instead and escapes the
          // widget, covering the sidebar and the top bar of a page it is only a
          // panel on.
          position: 'relative',
          // Never a transform or filter here: either would make this card the
          // containing block for `position: fixed` descendants and break every
          // overlay drawn inside it.
          ...(mode === 'overlay'
            ? {
                position: 'fixed',
                inset: 0,
                zIndex: theme.zIndex.modal,
                borderRadius: 0,
                border: 0,
              }
            : null),
          '&:fullscreen': { borderRadius: 0, border: 0, backgroundColor: theme.brand.canvas },
          '&::backdrop': { backgroundColor: theme.brand.canvas },
        }}
      >
        <Box
          component="header"
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: 1.5,
            px: 2.5,
            py: 1.75,
            borderBottom: `1px solid ${theme.brand.line}`,
          }}
        >
          <Box sx={{ minWidth: 0, flex: '1 1 260px' }}>
            {eyebrow ? (
              <Typography variant="eyebrow" component="p" sx={{ color: theme.brand.tert }}>
                {eyebrow}
              </Typography>
            ) : null}
            <Typography variant="h3" component="h2">
              {title}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            {actions}
            {allowFullscreen ? (
              <Tooltip
                title={active ? 'Exit full screen (Esc)' : 'Full screen'}
                slotProps={{ popper: { container: value.container } }}
              >
                <IconButton
                  onClick={toggle}
                  aria-label={active ? 'Exit full screen' : 'Full screen'}
                  aria-pressed={active}
                  size="small"
                  sx={{ border: `1px solid ${theme.brand.line2}`, borderRadius: '999px' }}
                >
                  {active ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </IconButton>
              </Tooltip>
            ) : null}
          </Box>
        </Box>
        <Box sx={[{ flex: 1, minHeight: 0, position: 'relative' }, ...(Array.isArray(bodySx) ? bodySx : [bodySx])]}>
          {children}
        </Box>
      </Card>
    </WidgetFrameContext.Provider>
  );
}
