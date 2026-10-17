'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { RotateCcw } from 'lucide-react';

import { formatClock } from '@labs/lib/numbers';
import type { LabSessionRecord } from '@labs/lib/session-record';

/**
 * "YOU LEFT THIS HALF DONE."
 *
 * Shown above the procedure when a bench is opened and an unfinished attempt at
 * the same practical is sitting in this browser.
 *
 * IT OFFERS, IT DOES NOT ACT. A student who opened the practical to start again
 * has already got what they wanted — a fresh bench — and nothing here changes
 * that until they press Resume. Restoring automatically would be the wrong
 * default twice over: it overrides a link to a specific bench, and it makes
 * "start a new one" a thing you have to know how to undo.
 *
 * It is a bar rather than a dialog for the same reason. A dialog would stop a
 * student who does not care about the old attempt from doing anything at all
 * until they have read it, to save them a loss they have not suffered.
 */
export function ResumeOffer({
  record,
  onResume,
  onDismiss,
}: {
  record: LabSessionRecord;
  onResume: () => void;
  onDismiss: () => void;
}): React.ReactElement {
  const theme = useTheme();
  // Read once, when the bar appears. A clock in the render body is impure, and
  // this phrase has no business updating underneath the student anyway — the
  // bar is answered in seconds, and "saved 3 minutes ago" ticking to 4 while
  // they read it is movement that carries no information.
  const [openedAt] = React.useState(() => Date.now());
  const away = openedAt - record.savedAt;
  return (
    <Box
      role="region"
      aria-label="Unfinished attempt"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        px: 1.5,
        py: 1,
        mb: 1,
        borderRadius: `${theme.band.radius.md}px`,
        border: `1px solid ${theme.brand.line2}`,
        backgroundColor: theme.tints.amber,
      }}
    >
      <RotateCcw size={15} color={theme.brand.sub} aria-hidden />
      <Typography sx={{ fontSize: theme.band.type.base - 1, color: theme.brand.text, flex: 1, minWidth: 200 }}>
        <b>You left this practical unfinished</b> — step {Math.min(record.step + 1, record.steps)} of{' '}
        {record.steps}, {formatClock(record.elapsedMs)} on the clock
        {record.seed !== null ? `, bench #${record.seed}` : ''}. {agoPhrase(away)}
      </Typography>
      <Button size="small" variant="contained" onClick={onResume}>
        Pick up where I left off
      </Button>
      <Button size="small" variant="text" onClick={onDismiss} sx={{ color: theme.brand.sub }}>
        Start fresh
      </Button>
    </Box>
  );
}

/**
 * How long ago, in the units a person would use. Rounded DOWN throughout, so
 * the bar never claims more time has passed than actually has.
 */
function agoPhrase(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 2) return 'Saved a moment ago.';
  if (minutes < 60) return `Saved ${minutes} minutes ago.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Saved ${hours} hour${hours === 1 ? '' : 's'} ago.`;
  const days = Math.floor(hours / 24);
  return `Saved ${days} day${days === 1 ? '' : 's'} ago.`;
}
