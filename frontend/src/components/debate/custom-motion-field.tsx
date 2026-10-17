import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { motionLength, motionProblem, normalizeMotion } from '@/lib/debate/motion';

export function CustomMotionField({
  value,
  onChange,
  minChars,
  maxChars,
  showProblem,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  minChars: number;
  maxChars: number;
  showProblem: boolean;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}): React.ReactElement {
  const theme = useTheme();
  const motion = normalizeMotion(value);
  const length = motionLength(value);
  const problem = motionProblem(value, minChars, maxChars);
  const shown = showProblem || value.trim() !== '' ? problem : null;
  const over = length > maxChars;

  return (
    <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <TextField
        label="Your motion"
        placeholder="Should every school have a vegetable garden?"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={shown !== null}
        multiline
        minRows={2}
        autoFocus
        inputRef={inputRef}
        helperText={
          <Stack component="span" direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
            <span>{shown ?? 'A question people could reasonably argue both ways.'}</span>
            <Box component="span" aria-live="polite" sx={{ flex: 'none', fontVariantNumeric: 'tabular-nums', color: over ? 'error.main' : undefined }}>
              {length} / {maxChars}
            </Box>
          </Stack>
        }
      />
      {motion ? (
        <Box
          aria-label="Motion preview"
          sx={{
            border: `1px solid ${theme.brand.line}`,
            borderRadius: `${theme.band.radius.md}px`,
            backgroundColor: theme.brand.subtle,
            px: 2,
            py: 1.5,
            minWidth: 0,
          }}
        >
          <Typography variant="eyebrow" component="p" color="text.secondary">
            Preview
          </Typography>
          <Typography variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>
            {motion}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            The room checks it can be argued both ways before the debate starts.
          </Typography>
        </Box>
      ) : null}
    </Stack>
  );
}
