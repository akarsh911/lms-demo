import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

// One band of a settings page: what the group is on the left, its fields on the right.
export function SettingsSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      component="section"
      sx={(theme) => ({
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '220px minmax(0, 1fr)' },
        gap: { xs: 2, md: 4 },
        px: 3,
        py: 3,
        '& + &': { borderTop: `1px solid ${theme.brand.line}` },
      })}
    >
      <div>
        <Typography variant="h5" component="h3">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {hint}
        </Typography>
      </div>
      {children}
    </Box>
  );
}
