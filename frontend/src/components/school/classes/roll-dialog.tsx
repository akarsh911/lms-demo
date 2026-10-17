'use client';

import * as React from 'react';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useAssignRolls } from '@/hooks/mutation/use-structure';
import type { YearEnrollment } from '@/types/foundation';

type Method = 'keep' | 'alphabetical' | 'manual';

const two = (n: number): string => String(n).padStart(2, '0');

// Keep: everyone holding a number keeps it and the rest follow on. Alphabetical: renumber the section by name.
function proposed(rows: readonly YearEnrollment[], method: Method): Map<string, string> {
  if (method === 'alphabetical') return new Map([...rows].sort((a, b) => a.name.localeCompare(b.name)).map((row, i) => [row.id, two(i + 1)]));
  const held = rows.filter((row) => row.roll_number).sort((a, b) => Number(a.roll_number) - Number(b.roll_number));
  const used = new Set(held.map((row) => Number(row.roll_number)));
  const out = new Map(held.map((row) => [row.id, row.roll_number ?? '']));
  let next = 1;
  for (const row of rows.filter((r) => !r.roll_number).sort((a, b) => a.joined.localeCompare(b.joined) || a.name.localeCompare(b.name))) {
    while (used.has(next)) next += 1;
    used.add(next);
    out.set(row.id, two(next));
  }
  return out;
}

export function RollDialog({ label, sectionId, rows, onClose }: { label: string; sectionId: string; rows: readonly YearEnrollment[]; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const assign = useAssignRolls();
  const missing = rows.filter((row) => !row.roll_number).length;
  const [method, setMethod] = React.useState<Method>('keep');
  const [manual, setManual] = React.useState<Map<string, string>>(() => proposed(rows, 'keep'));
  const rolls = method === 'manual' ? manual : proposed(rows, method);
  const values = [...rolls.values()].map((v) => v.trim());
  const duplicate = values.find((v, i) => v && values.indexOf(v) !== i);
  const blank = values.some((v) => !v);
  const differs = (row: YearEnrollment): boolean => (rolls.get(row.id) ?? '') !== (row.roll_number ?? '');
  const changed = rows.filter(differs).length;
  // What changes is listed first so a gap fill shows without scrolling; typed numbers keep a fixed order so rows never jump.
  const ordered =
    method === 'manual'
      ? [...rows].sort((a, b) => Number(a.roll_number ?? 999) - Number(b.roll_number ?? 999) || a.name.localeCompare(b.name))
      : [...rows].sort((a, b) => Number(differs(b)) - Number(differs(a)) || Number(rolls.get(a.id) ?? 999) - Number(rolls.get(b.id) ?? 999));

  return (
    <FormDialog
      open
      maxWidth="md"
      title={`Roll numbers for ${label}`}
      description={missing > 0 ? `${missing} of ${rows.length} students have no roll number.` : `Every one of the ${rows.length} students has a roll number.`}
      submitLabel={changed > 0 ? `Save ${changed} ${changed === 1 ? 'Change' : 'Changes'}` : 'Save'}
      pending={assign.isPending}
      error={assign.error}
      canSubmit={changed > 0 && !duplicate && !blank}
      warning={duplicate ? `Roll number ${duplicate} is given twice.` : method === 'alphabetical' && changed > missing ? `${changed - missing} students who already have a number will get a new one. Registers printed earlier will no longer match.` : null}
      onClose={onClose}
      onSubmit={() =>
        assign.mutate(
          { sectionId, rolls: [...rolls].map(([enrollment_id, roll]) => ({ enrollment_id, roll })) },
          {
            onSuccess: () => {
              notify(`Roll numbers saved for ${label}`);
              onClose();
            },
          },
        )
      }
    >
      <ToggleButtonGroup
        exclusive
        size="small"
        value={method}
        onChange={(_, value: Method | null) => {
          if (!value) return;
          if (value === 'manual') setManual(proposed(rows, method));
          setMethod(value);
        }}
        aria-label="How to number"
      >
        <ToggleButton value="keep">Fill the gaps</ToggleButton>
        <ToggleButton value="alphabetical">Alphabetical</ToggleButton>
        <ToggleButton value="manual">Type them</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" color="text.secondary">
        {method === 'keep'
          ? 'Nobody’s number changes; students without one get the next free numbers, earliest joiner first.'
          : method === 'alphabetical'
            ? 'The whole section is renumbered by name from 01.'
            : 'Start from the numbers below and change any of them.'}
      </Typography>
      <TableContainer sx={{ maxHeight: 380 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 120 }}>Roll number</TableCell>
              <TableCell>Student</TableCell>
              <TableCell>Now</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {ordered.map((row) => {
              const roll = rolls.get(row.id) ?? '';
              return (
                <TableRow key={row.id} selected={differs(row)}>
                  <TableCell>
                    {method === 'manual' ? (
                      <TextField
                        size="small"
                        value={roll}
                        error={!roll.trim() || roll.trim() === duplicate}
                        onChange={(event) => setManual((prev) => new Map(prev).set(row.id, event.target.value.replace(/\D/g, '').slice(0, 3)))}
                        slotProps={{ htmlInput: { 'aria-label': `Roll number for ${row.name}`, inputMode: 'numeric' } }}
                        sx={{ width: 80 }}
                      />
                    ) : (
                      <Typography variant="subtitle2" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                        {roll}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{row.roll_number ?? 'None'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </FormDialog>
  );
}
