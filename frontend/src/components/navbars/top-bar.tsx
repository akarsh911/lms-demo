import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { ShieldCheck } from 'lucide-react';

import { EmergeLogo } from '@/components/brand/emerge-logo';
import { TOP_BAR_HEIGHT } from '@/constants/layout';
import { BandSwitcher } from '@/components/brand/band-switcher';
import { paths } from '@/paths';
import { signOut } from '@/server/actions/auth';
import { brand } from '@/styles/theme';
import type { Persona } from '@/types/persona';

import { NavMenuButton } from './nav-menu-button';
import { PersonaSwitcher } from './persona-switcher';
import { SignOutButton } from './sign-out-button';

export function TopBar({
  personas,
  current,
  userLabel,
  accountSecurity,
}: {
  personas: Persona[];
  current: Persona;
  userLabel: string;
  accountSecurity: boolean;
}): React.ReactElement {
  return (
    // Static, not sticky: the shell is a fixed-height frame and the bar is its first row, so it cannot scroll away.
    <AppBar position="static" sx={{ flex: 'none' }}>
      {/* Height pinned rather than left to Toolbar's defaults: a full-height widget subtracts exactly this. */}
      <Toolbar sx={{ gap: { xs: 1, sm: 2 }, px: { xs: 1.5, sm: 3 }, minHeight: TOP_BAR_HEIGHT }}>
        <NavMenuButton />
        {/* From `lg` the sidebar carries the logo, so the bar does not repeat it. */}
        <Box sx={{ display: { xs: 'block', lg: 'none' } }}>
          <EmergeLogo height={26} inkColor={brand.ink} />
        </Box>
        <Box sx={{ flex: 1 }} />
        <Paper
          variant="glass"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: userLabel ? 2 : 0.5, pr: 0.5, py: 0.5, borderRadius: '999px', minWidth: 0 }}
        >
          {/* Hidden on a phone, where the bar has no room for it beside the controls. */}
          {userLabel ? (
            <Typography variant="eyebrow" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' }, pr: 1 }}>
              {userLabel}
            </Typography>
          ) : null}
          {/* A design-review tool: it earns no space on a phone. */}
          <Box sx={{ display: { xs: 'none', md: 'block' }, flex: 'none' }}>
            <BandSwitcher />
          </Box>
          <PersonaSwitcher personas={personas} current={current} />
          {accountSecurity ? (
            <IconButton href={paths.accountSecurity(current.slug)} size="small" color="inherit" aria-label="Account security" sx={{ flex: 'none' }}>
              <ShieldCheck size={18} />
            </IconButton>
          ) : null}
          <Box component="form" action={signOut} sx={{ flex: 'none', display: 'flex' }}>
            <SignOutButton />
          </Box>
        </Paper>
      </Toolbar>
    </AppBar>
  );
}
