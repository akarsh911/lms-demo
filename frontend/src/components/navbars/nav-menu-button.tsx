'use client';

import * as React from 'react';
import IconButton from '@mui/material/IconButton';
import { Menu as MenuIcon } from 'lucide-react';

import { useNavDrawer } from './nav-drawer-context';

/**
 * The hamburger. Present only below `lg`, where the sidebar is a drawer rather
 * than a permanent column: above that it would open something already on
 * screen.
 *
 * It is a client island inside the otherwise server-rendered top bar, which is
 * why the drawer's state lives in a context: the top bar itself stays a Server
 * Component and keeps its server action for sign-out.
 */
export function NavMenuButton(): React.ReactElement {
  const { open, toggle } = useNavDrawer();

  return (
    <IconButton
      onClick={toggle}
      edge="start"
      aria-label="Open navigation"
      aria-expanded={open}
      sx={{ display: { xs: 'inline-flex', lg: 'none' }, mr: 0.5 }}
    >
      <MenuIcon size={20} />
    </IconButton>
  );
}
