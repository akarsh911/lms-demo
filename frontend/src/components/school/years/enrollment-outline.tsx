'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import type { ClassGroup } from '@/lib/school/enrollments';

export interface OutlinePick {
  grade_level_id: string;
  section: string | null;
}

const count = (n: number): string => n.toLocaleString('en-IN');

// The year's classes as an outline down the side: a class opens to its sections, and whichever is chosen fills the table beside it.
export function EnrollmentOutline({ groups, pick, onPick }: { groups: readonly ClassGroup[]; pick: OutlinePick; onPick: (next: OutlinePick) => void }): React.ReactElement {
  const [open, setOpen] = React.useState<string>(pick.grade_level_id);

  return (
    <Box component="nav" aria-label="Classes" sx={(theme) => ({ border: `1px solid ${theme.brand.line}`, borderRadius: `${theme.band.radius.md}px`, backgroundColor: theme.brand.surface, overflow: 'hidden' })}>
      <List disablePadding sx={{ p: 0.75 }}>
        {groups.map((group) => {
          const unplaced = group.sections.find((section) => section.key === 'unassigned')?.rows.length ?? 0;
          const expanded = open === group.grade_level_id;
          const chosen = pick.grade_level_id === group.grade_level_id;
          return (
            <React.Fragment key={group.grade_level_id}>
              <ListItemButton
                selected={chosen && pick.section === null}
                onClick={() => {
                  setOpen(expanded && chosen ? '' : group.grade_level_id);
                  onPick({ grade_level_id: group.grade_level_id, section: null });
                }}
                sx={{ borderRadius: 2, gap: 1, py: 0.75 }}
              >
                {expanded ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                <ListItemText primary={group.class_name} slotProps={{ primary: { variant: 'subtitle2' } }} sx={{ my: 0 }} />
                {unplaced > 0 && !expanded ? <EmergeChip label={String(unplaced)} tone="amber" /> : null}
                <Typography variant="body2" sx={{ color: chosen && pick.section === null ? 'inherit' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                  {count(group.rows.length)}
                </Typography>
              </ListItemButton>
              <Collapse in={expanded} unmountOnExit>
                <List disablePadding sx={{ pl: 3.5, pb: 0.5 }}>
                  {group.sections.map((section) => {
                    const active = chosen && pick.section === section.key;
                    return (
                      <ListItemButton key={section.key} selected={active} onClick={() => onPick({ grade_level_id: group.grade_level_id, section: section.key })} sx={{ borderRadius: 2, py: 0.5, gap: 1 }}>
                        <ListItemText primary={section.name} slotProps={{ primary: { variant: 'body2', sx: { color: section.key === 'unassigned' && !active ? 'warning.dark' : 'inherit', fontWeight: section.key === 'unassigned' ? 600 : 400 } } }} sx={{ my: 0 }} />
                        <Typography variant="body2" sx={{ color: active ? 'inherit' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          {count(section.rows.length)}
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
