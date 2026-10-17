'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChevronDown } from 'lucide-react';

import type { SectionRow } from '@/types/academic';

interface ClassGroup {
  id: string;
  name: string;
  order: number;
  sections: SectionRow[];
}

function groupByClass(rows: readonly SectionRow[]): ClassGroup[] {
  const byClass = new Map<string, ClassGroup>();
  for (const row of rows) {
    const id = row.grade_level_id ?? '';
    const name = row.edges?.grade_level?.name ?? 'Class';
    const group: ClassGroup = byClass.get(id) ?? { id, name, order: Number(name.replace(/\D/g, '')) || 0, sections: [] };
    group.sections.push(row);
    byClass.set(id, group);
  }
  return [...byClass.values()]
    .map((g) => ({ ...g, sections: g.sections.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')) }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'en', { numeric: true }));
}

// The class and section a page is looking at, chosen from an explorer rather than a long flat list.
export function SectionExplorer({ sections, value, onChange }: { sections: readonly SectionRow[]; value: string | null; onChange: (sectionId: string) => void }): React.ReactElement {
  const classes = React.useMemo(() => groupByClass(sections), [sections]);
  const current = sections.find((s) => s.id === value);
  const [open, setOpen] = React.useState(false);
  const [browsing, setBrowsing] = React.useState<string | null>(null);
  const shown = classes.find((c) => c.id === (browsing ?? current?.grade_level_id)) ?? classes[0];

  return (
    <>
      <Button
        variant="outlined"
        endIcon={<ChevronDown size={16} />}
        onClick={() => (setBrowsing(null), setOpen(true))}
        sx={{ justifyContent: 'space-between', minWidth: 260, alignSelf: 'flex-start' }}
        aria-label="Choose the class and section"
      >
        <Stack sx={{ alignItems: 'flex-start' }}>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
            Class and section
          </Typography>
          <Typography variant="subtitle1" component="span" sx={{ lineHeight: 1.3 }}>
            {current ? `${current.edges?.grade_level?.name ?? 'Class'} · Section ${current.name ?? ''}` : 'Choose'}
          </Typography>
        </Stack>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Choose a class and section</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '180px minmax(0, 1fr)', minHeight: 320 }}>
            <List dense sx={(theme) => ({ borderRight: `1px solid ${theme.brand.line}`, py: 1 })}>
              {classes.map((c) => (
                <ListItemButton key={c.id} selected={c.id === shown?.id} onClick={() => setBrowsing(c.id)} sx={{ mx: 1, borderRadius: 2 }}>
                  <ListItemText primary={c.name} secondary={`${c.sections.length} ${c.sections.length === 1 ? 'section' : 'sections'}`} />
                </ListItemButton>
              ))}
            </List>
            <Box sx={{ p: 2.5 }}>
              <Typography variant="eyebrow" color="text.secondary">
                {shown?.name ?? ''} sections
              </Typography>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', mt: 1.5 }}>
                {(shown?.sections ?? []).map((s) => (
                  <ButtonBase
                    key={s.id}
                    onClick={() => (onChange(s.id), setOpen(false))}
                    aria-label={`${shown?.name ?? ''} section ${s.name ?? ''}`}
                    sx={(theme) => ({
                      flexDirection: 'column',
                      py: 1.5,
                      borderRadius: `${theme.band.radius.sm}px`,
                      border: `1px solid ${s.id === value ? theme.palette.primary.main : theme.brand.line2}`,
                      bgcolor: s.id === value ? theme.tints.rose : theme.brand.surface,
                      '&:hover': { borderColor: theme.brand.ink },
                    })}
                  >
                    <Typography variant="h4" component="span">
                      {s.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.code ?? ''}
                    </Typography>
                  </ButtonBase>
                ))}
              </Box>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
}
