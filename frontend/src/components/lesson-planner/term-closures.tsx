'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CalendarX2 } from 'lucide-react';

import { formatShortDate } from '@/lib/dates';
import type { PlannerTerm, TermClosure } from '@/types/lesson-planner';

import { CARD_PAD, INNER_GAP } from './spacing';

export function TermClosures({
  term,
  closures,
  onAdd,
  onRemove,
}: {
  term: PlannerTerm;
  closures: readonly TermClosure[];
  onAdd: (closure: TermClosure) => void;
  onRemove: (date: string) => void;
}): React.ReactElement {
  const [date, setDate] = React.useState('');
  const [label, setLabel] = React.useState('');
  const outside = date !== '' && (date < term.start || date > term.end);
  const duplicate = closures.some((c) => c.date === date);
  const canAdd = date !== '' && label.trim() !== '' && !outside && !duplicate;

  return (
    <Stack spacing={CARD_PAD} sx={{ p: CARD_PAD, width: 340, maxWidth: '100vw' }}>
      <Typography variant="subtitle2">Closed days</Typography>
      <Stack
        component="form"
        noValidate
        spacing={INNER_GAP}
        onSubmit={(event: React.FormEvent) => {
          event.preventDefault();
          if (!canAdd) return;
          onAdd({ date, label: label.trim() });
          setDate('');
          setLabel('');
        }}
      >
        <TextField
          type="date"
          size="small"
          label="Date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: term.start, max: term.end } }}
          error={outside || duplicate}
          helperText={outside ? `Outside ${term.name}` : duplicate ? 'Already closed' : undefined}
        />
        <TextField size="small" label="Reason" value={label} onChange={(event) => setLabel(event.target.value)} />
        <Button type="submit" variant="outlined" startIcon={<CalendarX2 size={16} />} disabled={!canAdd} sx={{ alignSelf: 'flex-start' }}>
          Close day
        </Button>
      </Stack>
      {closures.length > 0 ? (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: INNER_GAP }} aria-label="Days you have closed">
          {[...closures]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((closure) => (
              <Chip key={closure.date} label={`${formatShortDate(closure.date)}: ${closure.label}`} onDelete={() => onRemove(closure.date)} />
            ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
