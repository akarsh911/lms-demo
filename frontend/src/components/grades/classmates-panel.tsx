'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { SearchField } from '@/components/ui/search-field';
import type { ClassmateList } from '@/types/grades';

import { pct1, pctTone } from './mark-states';

// The roster beside the grades: every pupil of the section or class, the current one lit and kept in view.
export function ClassmatesPanel({
  list,
  currentId,
  onRoster,
  onPick,
}: {
  list: ClassmateList | undefined;
  currentId: string;
  // An empty section means the whole class.
  onRoster: (gradeId: string, sectionId: string) => void;
  onPick: (studentId: string) => void;
}): React.ReactElement {
  const scope = list?.scope ?? 'section';
  const cls = list?.classes.find((c) => c.id === list.grade_level_id);
  const [search, setSearch] = React.useState('');
  const currentRef = React.useRef<HTMLDivElement | null>(null);
  const needle = search.trim().toLowerCase();
  const shown = (list?.students ?? []).filter((s) => needle === '' || s.name.toLowerCase().includes(needle) || (s.roll_number ?? '').includes(needle));

  const listRef = React.useRef<HTMLUListElement | null>(null);
  // Keeps the lit row in view inside the list only; scrollIntoView would also move the page and hide the header.
  React.useEffect(() => {
    const list = listRef.current;
    const row = currentRef.current;
    if (!list || !row) return;
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top - list.clientHeight / 2 + row.offsetHeight / 2;
  }, [currentId, list]);

  return (
    <Box
      component="nav"
      aria-label="Classmates"
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${theme.brand.line2}`,
        borderRadius: `${theme.band.radius.lg}px`,
        backgroundColor: theme.brand.surface,
        overflow: 'hidden',
        maxHeight: { lg: 560 },
        position: { lg: 'sticky' },
        top: { lg: 0 },
      })}
    >
      <Stack spacing={1.25} sx={(theme) => ({ p: 1.5, borderBottom: `1px solid ${theme.brand.line}` })}>
        <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="subtitle1" component="p" noWrap>
            {list?.label ?? 'Classmates'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {list ? `${list.students.length} pupils · ← → to move` : ''}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <TextField select size="small" label="Class" value={list?.grade_level_id ?? ''} onChange={(event) => onRoster(event.target.value, '')} sx={{ flex: 1.3 }}>
            {(list?.classes ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select size="small" label="Section" value={list?.section_id ?? ''} onChange={(event) => onRoster(list?.grade_level_id ?? '', event.target.value)} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} sx={{ flex: 1 }}>
            <MenuItem value="">All</MenuItem>
            {(cls?.sections ?? []).map((sec) => (
              <MenuItem key={sec.id} value={sec.id}>
                {sec.name}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <SearchField label="Find by name or roll" value={search} onChange={setSearch} width="100%" />
      </Stack>
      <List ref={listRef} disablePadding sx={{ p: 0.75, overflowY: 'auto', flex: 1, position: 'relative', maxHeight: { xs: 360, lg: 'none' } }}>
        {shown.map((student) => {
          const active = student.id === currentId;
          return (
            <ListItemButton
              key={student.id}
              ref={active ? currentRef : undefined}
              selected={active}
              onClick={() => onPick(student.id)}
              sx={{ borderRadius: 2, gap: 1.25, py: 0.5 }}
            >
              <Typography variant="body2" sx={{ width: 28, flex: 'none', color: active ? 'inherit' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {scope === 'class' && student.section_name ? `${student.section_name}·` : ''}
                {student.roll_number ?? '—'}
              </Typography>
              <ListItemText primary={student.name} slotProps={{ primary: { variant: 'body2', noWrap: true, sx: { fontWeight: active ? 600 : 400 } } }} sx={{ my: 0, minWidth: 0 }} />
              {student.overall_pct === null ? null : active ? (
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {pct1(student.overall_pct)}
                </Typography>
              ) : (
                <EmergeChip label={pct1(student.overall_pct)} tone={pctTone(student.overall_pct)} />
              )}
            </ListItemButton>
          );
        })}
        {shown.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            {list ? 'Nobody matches.' : 'Loading the class…'}
          </Typography>
        ) : null}
      </List>
    </Box>
  );
}
