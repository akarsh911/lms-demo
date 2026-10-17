'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChevronDown, Zap } from 'lucide-react';

import { useSchoolOverview } from '@/hooks/query/use-foundation';
import { useIdentity } from '@/hooks/query/use-identity';
import { formatDay } from '@/lib/dates';
import { greetingAt } from '@/lib/school/overview';

import { useQuickActions } from './quick-actions';

// The top of the administrator's Home: who, which year, what day, and the quick actions.
export function OverviewHeader({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const identity = useIdentity();
  const overview = useSchoolOverview();
  const { actions, dialogs } = useQuickActions(personaSlug);
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);

  // The query's own clock: the greeting and the date are read from a value React was handed, not from the time mid-render.
  const settledAt = identity.dataUpdatedAt || identity.errorUpdatedAt;
  const firstName = identity.data?.person?.first_name;
  const today = settledAt ? formatDay(new Date(settledAt).toLocaleDateString('en-CA')) : null;

  return (
    <Stack component="header" direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
      <div>
        {settledAt ? (
          <Typography variant="h2" component="h1">
            {greetingAt(settledAt)}
            {firstName ? `, ${firstName}` : ''}
          </Typography>
        ) : (
          <Skeleton variant="rounded" width={320} height={36} />
        )}
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
          {[overview.data?.academic_year ? `Academic year ${overview.data.academic_year}` : null, today].filter(Boolean).join(' · ') || ' '}
        </Typography>
      </div>

      <Button
        variant="contained"
        startIcon={<Zap size={16} />}
        endIcon={<ChevronDown size={16} />}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        Quick actions
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {actions.map((action) => (
          <MenuItem
            key={action.key}
            disabled={action.disabled}
            onClick={() => {
              setAnchor(null);
              action.run();
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: 36 }}>{action.icon}</ListItemIcon>
            <ListItemText primary={action.label} />
          </MenuItem>
        ))}
      </Menu>
      {dialogs}
    </Stack>
  );
}
