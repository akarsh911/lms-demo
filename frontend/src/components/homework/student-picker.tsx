'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { SearchField } from '@/components/ui/search-field';
import type { HomeworkSectionOption } from '@/types/homework';

// Ticking the students an assignment is for, section by section.
export function StudentPicker({ sections, value, onChange }: { sections: readonly HomeworkSectionOption[]; value: readonly string[]; onChange: (next: (prev: string[]) => string[]) => void }): React.ReactElement {
  const [search, setSearch] = React.useState('');
  const q = search.trim().toLowerCase();
  const chosen = sections.reduce((t, s) => t + s.students.filter((st) => value.includes(st.student_id)).length, 0);
  return (
    <Card variant="outlined">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1 }}>
        <SearchField label="Find a student" value={search} onChange={setSearch} width="100%" />
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', pr: 1 }}>
          {chosen} chosen
        </Typography>
      </Stack>
      <List dense disablePadding sx={{ maxHeight: 280, overflowY: 'auto' }}>
        {sections.map((s) => (
          <li key={s.section_id}>
            <ul style={{ padding: 0 }}>
              <ListSubheader sx={{ lineHeight: '32px' }}>{s.section}</ListSubheader>
              {s.students
                .filter((st) => !q || st.name.toLowerCase().includes(q))
                .map((st) => {
                  const on = value.includes(st.student_id);
                  return (
                    <ListItemButton key={st.student_id} onClick={() => onChange((prev) => (prev.includes(st.student_id) ? prev.filter((x) => x !== st.student_id) : [...prev, st.student_id]))}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox edge="start" size="small" checked={on} tabIndex={-1} disableRipple slotProps={{ input: { 'aria-label': st.name } }} />
                      </ListItemIcon>
                      <ListItemText primary={st.name} secondary={st.roll ? `Roll ${st.roll}` : null} />
                    </ListItemButton>
                  );
                })}
            </ul>
          </li>
        ))}
      </List>
    </Card>
  );
}
