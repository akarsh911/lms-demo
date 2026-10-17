'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface OutlineGroup {
  id: string;
  name: string;
  count: number;
  sections: { id: string; name: string; count: number }[];
}

export interface OutlineChoice {
  group: string | null;
  section: string | null;
}

const count = (n: number): string => n.toLocaleString('en-IN');

// Classes down the side, each opening to its sections; whatever is chosen fills the table beside it.
export function ClassOutline({ groups, choice, onChoose, allLabel = 'All classes', total }: { groups: readonly OutlineGroup[]; choice: OutlineChoice; onChoose: (next: OutlineChoice) => void; allLabel?: string; total?: number }): React.ReactElement {
  const [open, setOpen] = React.useState<string | null>(choice.group);

  return (
    <Box component="nav" aria-label="Classes" sx={(theme) => ({ border: `1px solid ${theme.brand.line}`, borderRadius: `${theme.band.radius.md}px`, backgroundColor: theme.brand.surface, overflow: 'hidden' })}>
      <List disablePadding sx={{ p: 0.75 }}>
        {total !== undefined ? (
          <ListItemButton selected={choice.group === null} onClick={() => onChoose({ group: null, section: null })} sx={{ borderRadius: 2, gap: 1, py: 0.75, pl: 4.5 }}>
            <ListItemText primary={allLabel} slotProps={{ primary: { variant: 'subtitle2' } }} sx={{ my: 0 }} />
            <Typography variant="body2" sx={{ color: choice.group === null ? 'inherit' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {count(total)}
            </Typography>
          </ListItemButton>
        ) : null}
        {groups.map((group) => {
          const expanded = open === group.id;
          const chosen = choice.group === group.id;
          return (
            <React.Fragment key={group.id}>
              <ListItemButton
                selected={chosen && choice.section === null}
                onClick={() => {
                  setOpen(expanded && chosen ? null : group.id);
                  onChoose({ group: group.id, section: null });
                }}
                sx={{ borderRadius: 2, gap: 1, py: 0.75 }}
              >
                {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                <ListItemText primary={group.name} slotProps={{ primary: { variant: 'subtitle2' } }} sx={{ my: 0 }} />
                <Typography variant="body2" sx={{ color: chosen && choice.section === null ? 'inherit' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {count(group.count)}
                </Typography>
              </ListItemButton>
              <Collapse in={expanded} unmountOnExit>
                <List disablePadding sx={{ pl: 3.5, pb: 0.5 }}>
                  {group.sections.map((section) => {
                    const active = chosen && choice.section === section.id;
                    return (
                      <ListItemButton key={section.id} selected={active} onClick={() => onChoose({ group: group.id, section: section.id })} sx={{ borderRadius: 2, py: 0.5, gap: 1 }}>
                        <ListItemText primary={section.name} slotProps={{ primary: { variant: 'body2' } }} sx={{ my: 0 }} />
                        <Typography variant="body2" sx={{ color: active ? 'inherit' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          {count(section.count)}
                        </Typography>
                      </ListItemButton>
                    );
                  })}
                </List>
              </Collapse>
            </React.Fragment>
          );
        })}
      </List>
    </Box>
  );
}
