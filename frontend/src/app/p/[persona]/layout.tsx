import * as React from 'react';
import Box from '@mui/material/Box';

import { ResumeDock } from '@/modules/virtual-labs';
import { NavDrawerProvider } from '@/components/navbars/nav-drawer-context';
import { SideNav } from '@/components/navbars/side-nav';
import { TopBar } from '@/components/navbars/top-bar';
import { TwoFactorPrompt } from '@/components/account/two-factor-prompt';
import { SessionWatch } from '@/components/auth/session-watch';
import { ToastProvider } from '@/components/ui/toast';
import { CONTENT_MAX_WIDTH, MAIN_PADDING } from '@/constants/layout';
import { requirePersona } from '@/server/dal';
import { devBypassLabel, isDevBypass } from '@/server/dev/bypass';
import { isSsoEnabled } from '@/server/sso/config';

/**
 * The persona shell.
 *
 * The nav is built here, on the server, from this user's resolved entitlements.
 * Note that this layout is NOT the gate — a layout does not re-run on every
 * navigation and cannot be relied on to stop anything. Each page calls
 * `requireFeature` for itself. This exists to draw the frame.
 *
 * `NavDrawerProvider` is a client component wrapping server-rendered children.
 * That ordering is deliberate: it lets the hamburger in the top bar and the
 * drawer in the sidebar share one piece of state while this file, where
 * `requirePersona` runs, stays a Server Component.
 */
// The paper ground. Two cut-paper pieces as BACKGROUNDS, not elements, so they create no stacking context and nothing to tab past.
const FRAME_SX = {
  height: '100dvh',
  display: 'flex',
  overflow: 'hidden',
  backgroundColor: 'background.default',
  backgroundImage: { lg: 'url(/ground/strata-left.webp), url(/ground/corner-top-right.webp)' },
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'left top, right top',
  backgroundSize: 'auto 100%, min(34vw, 520px) auto',
} as const;

export default async function PersonaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ persona: string }>;
}): Promise<React.ReactElement> {
  const { persona: slug } = await params;
  const { persona, personas, nav, snapshot } = await requirePersona(slug);

  return (
    <NavDrawerProvider>
      {/*
        A fixed-height app frame: the window never scrolls, the CONTENT COLUMN
        does. That keeps the top bar and the sidebar in place at all times —
        they used to scroll away with the page, leaving a tall screen with no
        navigation — and it gives a full-height widget an exact, known height
        to fill instead of guessing at the viewport.
      */}
      <Box sx={FRAME_SX}>
        <SideNav items={nav} />
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <TopBar
            personas={personas}
            current={persona}
            userLabel={isDevBypass() ? devBypassLabel(snapshot.userId) : snapshot.superAdmin ? 'Superadmin' : ''}
            accountSecurity={isSsoEnabled()}
          />
          {/* Positioned, so an absolutely placed descendant (a hidden live region, a popper) is clipped here and cannot grow the window. */}
          <Box component="main" sx={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto', p: MAIN_PADDING, pt: 1 }}>
            {/* Capped, so a line of text never runs the full width of a 27" screen. */}
            <Box sx={{ maxWidth: CONTENT_MAX_WIDTH, mx: 'auto', minHeight: '100%' }}>
              <ToastProvider>
                {children}
                {isSsoEnabled() ? <TwoFactorPrompt /> : null}
                {isSsoEnabled() ? <SessionWatch /> : null}
              </ToastProvider>
            </Box>
          </Box>
        </Box>
      </Box>
      {/*
        Outside the scrolling content column on purpose: it is pinned to the
        viewport, not to the page, so it stays put while a student reads. It
        draws nothing at all unless this browser is holding an unfinished
        practical, so every other page pays one `localStorage` read for it.

        In Suspense because it reads the query string, which Next requires a
        boundary for — and `null` is the right fallback, since a bookmark that
        appears a frame late costs nothing.
      */}
      <React.Suspense fallback={null}>
        <ResumeDock />
      </React.Suspense>
    </NavDrawerProvider>
  );
}
