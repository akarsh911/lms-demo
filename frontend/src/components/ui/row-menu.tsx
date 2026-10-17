'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  // Why it is disabled, said where the person is looking.
  hint?: string;
  destructive?: boolean;
}

// The "More" control at the end of a row or a header: a few secondary actions behind one button.
// `button` draws a labelled "More" for a page header, where a bare icon is easy to miss.
export function RowMenu({ label, actions, trigger = 'icon' }: { label: string; actions: readonly RowAction[]; trigger?: 'icon' | 'button' }): React.ReactElement {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const open = (event: React.MouseEvent<HTMLElement>): void => {
    event.stopPropagation();
    setAnchor(event.currentTarget);
  };

  return (
    <>
      {trigger === 'button' ? (
        <Button variant="outlined" aria-label={label} aria-haspopup="menu" aria-expanded={anchor ? 'true' : undefined} endIcon={<ChevronDown size={16} />} onClick={open}>
          More
        </Button>
      ) : (
        <IconButton size="small" aria-label={label} aria-haspopup="menu" aria-expanded={anchor ? 'true' : undefined} onClick={open}>
          <MoreHorizontal size={18} />
        </IconButton>
      )}
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} onClick={(event) => event.stopPropagation()}>
        {actions.map((action) => (
          <MenuItem
            key={action.label}
            disabled={action.disabled}
            onClick={() => {
              setAnchor(null);
              action.onSelect();
            }}
            sx={action.destructive ? { color: 'error.main' } : undefined}
          >
            {action.icon ? <ListItemIcon sx={{ color: 'inherit', minWidth: 32 }}>{action.icon}</ListItemIcon> : null}
            <ListItemText primary={action.label} secondary={action.disabled ? action.hint : undefined} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
