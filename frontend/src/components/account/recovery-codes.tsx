'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export function RecoveryCodes({ codes, onDone }: { codes: readonly string[]; onDone: () => void }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);

  const copy = (): void => {
    void navigator.clipboard.writeText(codes.join('\n')).then(() => setCopied(true));
  };

  return (
    <Stack spacing={1.5}>
      <Alert severity="warning">
        Save these recovery codes somewhere safe. Each one signs you in once if you lose your phone. They will not be shown again.
      </Alert>
      <Box
        component="ul"
        sx={{ m: 0, p: 2, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, bgcolor: 'action.hover', borderRadius: 2 }}
      >
        {codes.map((code) => (
          <Typography key={code} component="li" variant="body2" sx={{ fontFamily: 'monospace' }}>
            {code}
          </Typography>
        ))}
      </Box>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" onClick={copy}>
          {copied ? 'Copied' : 'Copy codes'}
        </Button>
        <Button variant="contained" onClick={onDone}>
          I have saved them
        </Button>
      </Stack>
    </Stack>
  );
}
