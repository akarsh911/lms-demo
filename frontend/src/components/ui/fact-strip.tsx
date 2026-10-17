import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';

export interface Fact {
  label: string;
  value: React.ReactNode;
  note?: string;
}

// A row of plain counts in one card. Compact on purpose: these orient, they are not the page.
export function FactStrip({ facts }: { facts: readonly Fact[] }): React.ReactElement {
  return (
    <Card>
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${facts.length}, minmax(0, 1fr))` },
          '& > * + *': { borderLeft: { md: `1px solid ${theme.brand.line}` } },
        })}
      >
        {facts.map((fact) => (
          <Box key={fact.label} sx={{ px: 3, py: 2.25, minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              {fact.label}
            </Typography>
            <Typography variant="h2" component="p" sx={{ mt: 0.5 }}>
              {fact.value}
            </Typography>
            {fact.note ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {fact.note}
              </Typography>
            ) : null}
          </Box>
        ))}
      </Box>
    </Card>
  );
}
