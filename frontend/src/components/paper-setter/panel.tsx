'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

const ExplainContext = React.createContext(true);

export function ExplainProvider({ explain, children }: { explain: boolean; children: React.ReactNode }): React.ReactElement {
  return <ExplainContext.Provider value={explain}>{children}</ExplainContext.Provider>;
}

export const useExplain = (): boolean => React.useContext(ExplainContext);

export function WizardPanel({
  title,
  subheader,
  meta,
  children,
}: {
  title: React.ReactNode;
  subheader?: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  const explain = useExplain();
  return (
    <Card>
      <CardHeader
        title={title}
        subheader={explain ? subheader : undefined}
        action={meta}
        slotProps={{ title: { variant: 'h4' } }}
      />
      <CardContent>
        <Stack spacing={2}>{children}</Stack>
      </CardContent>
    </Card>
  );
}

export function PanelNote({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const theme = useTheme();
  const explain = useExplain();
  if (!explain) return null;
  return (
    <Box sx={{ borderTop: `1px solid ${theme.brand.line}`, pt: 1.25 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {children}
      </Typography>
    </Box>
  );
}
