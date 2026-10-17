import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/**
 * Also what a user sees when they hand-type the URL of a feature they do not
 * hold. Deliberately identical to a genuinely missing page: distinguishing
 * "does not exist" from "not yours" would let the route table be enumerated.
 */
export default function NotFound(): React.ReactElement {
  return (
    <Box sx={{ maxWidth: 480, mx: 'auto', mt: 12, px: 3 }}>
      <Typography variant="h2" gutterBottom>
        Not found
      </Typography>
      <Typography variant="body2" color="text.secondary">
        That page does not exist, or is not part of your account.
      </Typography>
    </Box>
  );
}
