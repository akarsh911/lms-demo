'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Field } from '@/components/ui/field';
import type { Capability, CapabilityField } from '@/types/core';

export function RecordFields({
  capability,
  row,
  intact,
  unnamed,
  denied,
}: {
  capability: Capability | undefined;
  row: Record<string, unknown> | undefined;
  intact: boolean;
  unnamed: string;
  denied: string;
}): React.ReactElement {
  const columns: readonly CapabilityField[] = capability?.fields.permitted ?? [];

  return (
    <Stack spacing={2}>
      {!intact ? (
        <Alert severity="info" variant="outlined">
          Your school limits which details you may see on this record. Only the
          permitted ones are shown.
        </Alert>
      ) : null}

      {columns.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {capability ? unnamed : denied}
        </Typography>
      ) : (
        <Grid container spacing={2} component="dl" sx={{ m: 0 }}>
          {columns.map((column) => (
            <Grid key={column.key} size={{ xs: 12, sm: 6, md: 4 }}>
              <Field label={column.name} quiet={isUnset(row, column.key)}>
                {displayValue(row, column.key)}
              </Field>
            </Grid>
          ))}
        </Grid>
      )}
    </Stack>
  );
}

function isUnset(row: Record<string, unknown> | undefined, key: string): boolean {
  const value = row?.[key];
  return value === undefined || value === null || value === '';
}

function displayValue(row: Record<string, unknown> | undefined, key: string): string {
  const value = row?.[key];
  if (value === undefined || value === null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
