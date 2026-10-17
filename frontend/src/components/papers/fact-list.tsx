'use client';

import * as React from 'react';
import Grid from '@mui/material/Grid';

import { Field } from '@/components/ui/field';

export interface Fact {
  label: string;
  value: React.ReactNode;
  caption?: string;
}

export function FactList({
  facts,
  columns = 3,
}: {
  facts: readonly Fact[];
  columns?: 2 | 3;
}): React.ReactElement {
  const width = columns === 2 ? 6 : 4;

  return (
    <Grid container spacing={2} component="dl" sx={{ m: 0 }}>
      {facts.map((fact) => (
        <Grid key={fact.label} size={{ xs: 12, sm: 6, md: width }}>
          <Field label={fact.label} caption={fact.caption}>
            {fact.value}
          </Field>
        </Grid>
      ))}
    </Grid>
  );
}
