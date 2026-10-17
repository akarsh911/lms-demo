'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { CircleAlert, CircleCheck, FlaskConical, TriangleAlert } from 'lucide-react';

import type { TintName } from '@/styles/theme';

import { tintForeground, type ChipTone } from './chip';
import { RichText } from './rich-text';

/**
 * A message from an in-product coach: a lab assistant, a tutor, a guide.
 *
 * The tone carries meaning a student learns to read at a glance: info is a
 * neutral next step, good is confirmation, warn is a slip worth fixing, bad is
 * something that cost marks or would have damaged real apparatus. The same four
 * tones are what the `src/modules/virtual-labs/lib` engines emit, so an engine
 * decides what to say and this decides how it looks.
 *
 * It is a live region: a screen-reader user hears what the coach says as it
 * changes, which is the only feedback the bench gives for many actions.
 */
export type CoachTone = 'info' | 'good' | 'warn' | 'bad';

/** Each tone is a checked tint/foreground pair from the chip table, plus an icon. */
const TONE: Record<CoachTone, { tint: Extract<ChipTone, TintName>; Icon: typeof FlaskConical }> = {
  info: { tint: 'blue', Icon: FlaskConical },
  good: { tint: 'green', Icon: CircleCheck },
  warn: { tint: 'amber', Icon: TriangleAlert },
  bad: { tint: 'red', Icon: CircleAlert },
};

export function CoachMessage({
  who,
  tone = 'info',
  text,
  icon,
}: {
  /** Who is speaking, e.g. "Lab assistant". */
  who: string;
  tone?: CoachTone;
  /** In the engine markup: `**bold**`, `_italic_`, newlines. */
  text: string;
  /** Replaces the tone's default icon for the info tone. */
  icon?: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  const t = TONE[tone];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1.25, alignItems: 'start' }}>
      <Box
        aria-hidden="true"
        sx={{
          width: theme.band.control.sm,
          height: theme.band.control.sm,
          borderRadius: `${theme.band.radius.sm}px`,
          display: 'grid',
          placeItems: 'center',
          backgroundColor: theme.tints[t.tint],
          color: tintForeground(t.tint, theme),
          transition: `background-color ${theme.band.motion.base}ms, color ${theme.band.motion.base}ms`,
        }}
      >
        {tone === 'info' && icon ? icon : <t.Icon size={16} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: theme.band.type.min,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: theme.brand.tert,
          }}
        >
          {who}
        </Typography>
        <Typography
          component="div"
          role="status"
          aria-live="polite"
          sx={{ fontSize: theme.band.type.base, color: theme.brand.text, mt: 0.25, textWrap: 'pretty' }}
        >
          <RichText text={text} />
        </Typography>
      </Box>
    </Box>
  );
}
