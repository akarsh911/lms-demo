'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import { useTheme } from '@mui/material/styles';
import { X } from 'lucide-react';

import { EmergeLogo } from '@/components/brand/emerge-logo';
import type { NavItem } from '@/types/nav';

import { useNavDrawer } from './nav-drawer-context';
import { NavTree } from './nav-tree';

/** Kept here rather than in the layout, so the two frames cannot disagree. */
const SIDE_NAV_WIDTH = 264;

/**
 * The sidebar, in its two frames.
 *
 * Permanent from `lg` up; below that it is a temporary Drawer opened by the
 * hamburger in the top bar. Both render the SAME `NavTree` over the SAME
 * server-built items, so a nested entry cannot exist on one and not the other.
 *
 * The items were filtered on the server against this user's entitlements. This
 * component makes no entitlement decision of its own. See `NavTree`.
 */
export function SideNav({ items }: { items: NavItem[] }): React.ReactElement {
  const theme = useTheme();
  const pathname = usePathname();
  const { open, setOpen } = useNavDrawer();

  const nav = (
    <Box component="nav" aria-label="Sections" sx={{ p: 1.5 }}>
      <NavTree items={items} pathname={pathname} />
    </Box>
  );

  /**
   * Close the drawer when a nav LINK is followed, not when anything in it is
   * clicked: the disclosure chevrons live in the same subtree and expanding a
   * group must not dismiss the thing you are expanding.
   *
   * Done on the click rather than by watching the pathname. Watching it means
   * a `setState` inside an effect, so every navigation pays for a second render
   * of the whole shell to close a drawer that is not even mounted on desktop.
   * A link click is also the only gesture that should close it: a browser Back
   * that happens to change the route did not come from this menu.
   */
  const closeOnLink = (event: React.MouseEvent<HTMLElement>): void => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  };

  return (
    <>
      {/* A floating panel, inset from the frame, over the paper ground: glass has something behind it to be glass about. */}
      <Paper
        variant="glass"
        sx={{
          display: { xs: 'none', lg: 'flex' },
          flexDirection: 'column',
          width: SIDE_NAV_WIDTH,
          flexShrink: 0,
          m: 1.5,
          mr: 0,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ px: 2.75, pt: 2.5, pb: 1.25 }}>
          <EmergeLogo height={26} inkColor={theme.brand.ink} />
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>{nav}</Box>
      </Paper>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        // `temporary`, and deliberately NOT `keepMounted`. Keeping it mounted
        // would put a second copy of the whole nav in the DOM of every page,
        // including desktop where the drawer can never open. The paper is also
        // hidden from `lg` up, which covers a resize that happens while it is
        // open.
        variant="temporary"
        slotProps={{
          paper: { sx: { width: SIDE_NAV_WIDTH, display: { lg: 'none' } } },
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <EmergeLogo height={24} inkColor={theme.brand.ink} />
          <IconButton onClick={() => setOpen(false)} aria-label="Close navigation" size="small">
            <X size={18} />
          </IconButton>
        </Stack>
        <Box onClick={closeOnLink}>{nav}</Box>
      </Drawer>
    </>
  );
}

/** Exported so a future full-height overlay can line up with the column. */
export { SIDE_NAV_WIDTH };
