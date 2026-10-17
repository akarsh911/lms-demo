'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemText from '@mui/material/ListItemText';
import { ChevronDown } from 'lucide-react';

import { paths } from '@/paths';
import type { Persona } from '@/types/persona';

/**
 * The designation display, and the switcher when someone holds more than one.
 *
 * Switching is a NAVIGATION, not a state change — it pushes `/p/<slug>`. That
 * is what makes the browser behave: back and forward move between hats, the URL
 * is shareable, a refresh keeps the hat, and a second tab can sit on a
 * different one without the two fighting over shared state.
 *
 * Someone with one designation sees a label, not a control. A menu with one
 * option is a decision the user does not have.
 */
export function PersonaSwitcher({
  personas,
  current,
}: {
  personas: Persona[];
  current: Persona;
}): React.ReactElement {
  const router = useRouter();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);

  if (personas.length <= 1) {
    return <Chip size="small" label={current.roleName} />;
  }

  return (
    <>
      <Button
        size="small"
        variant="text"
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        endIcon={<ChevronDown size={16} />}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
      >
        {current.roleName}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {personas.map((persona) => (
          <MenuItem
            key={persona.slug}
            selected={persona.slug === current.slug}
            onClick={() => {
              setAnchor(null);
              router.push(paths.persona(persona.slug));
            }}
          >
            <ListItemText primary={persona.roleName} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
