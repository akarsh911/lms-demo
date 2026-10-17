'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Check } from 'lucide-react';

/**
 * A procedure as one slim line: numbered pips for the whole task, the current
 * step named in full beside them.
 *
 * The alternative, a column listing every step with its description, costs
 * ~230px of width or ~400px of height for information a student needs twice:
 * "where am I" and "what is left". Pips answer both at a glance, the label
 * answers "what now", and the rest is a tooltip away.
 *
 * Renders as an ordered list with `aria-current="step"`, so a screen reader
 * still hears the full procedure and which step is live.
 */
export interface StripStep {
  title: string;
  prompt?: string;
}

export function StepStrip({
  steps,
  current,
  ariaLabel = 'Procedure',
  container,
}: {
  steps: readonly StripStep[];
  /** Index of the step in progress; `steps.length` when everything is done. */
  current: number;
  ariaLabel?: string;
  /** Where tooltips portal to — the frame, inside fullscreen. */
  container?: HTMLElement | undefined;
}): React.ReactElement {
  const theme = useTheme();
  const done = current >= steps.length;
  const active = steps[Math.min(current, steps.length - 1)];

  return (
    <Box
      component="ol"
      aria-label={ariaLabel}
      sx={{
        listStyle: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        m: 0,
        p: 0,
        minWidth: 0,
      }}
    >
      {steps.map((step, i) => {
        const isDone = i < current;
        const isActive = i === current;
        return (
          <Tooltip
            key={step.title}
            title={`${i + 1}. ${step.title}${step.prompt ? ` — ${step.prompt}` : ''}`}
            slotProps={{ popper: { container } }}
          >
            <Box
              component="li"
              aria-current={isActive ? 'step' : undefined}
              sx={{
                flex: 'none',
                display: 'grid',
                placeItems: 'center',
                width: isActive ? 26 : 22,
                height: isActive ? 26 : 22,
                borderRadius: '999px',
                fontSize: theme.band.type.min - 0.5,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                border: '1.5px solid',
                borderColor: isDone ? theme.hues.green : isActive ? theme.brand.orange : theme.brand.line2,
                backgroundColor: isDone ? theme.hues.green : isActive ? theme.tints.orange : 'transparent',
                color: isDone ? '#FFFFFF' : isActive ? theme.brand.orange : theme.brand.tert,
                transition: `all ${theme.band.motion.base}ms`,
              }}
            >
              {isDone ? <Check size={12} strokeWidth={3} /> : i + 1}
              <Box component="span" sx={SR_ONLY}>
                {step.title}
              </Box>
            </Box>
          </Tooltip>
        );
      })}

      <Typography
        component="span"
        sx={{
          ml: 0.5,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: theme.band.type.base - 1,
          fontWeight: 700,
          color: theme.brand.ink,
        }}
      >
        {done ? 'Complete' : active?.title}
        {!done && active?.prompt ? (
          <Box component="span" sx={{ color: theme.brand.tert, fontWeight: 600 }}>
            {' · '}
            {active.prompt}
          </Box>
        ) : null}
      </Typography>
    </Box>
  );
}

/** Visually hidden, still read aloud. Strings: in `sx`, a width of 1 means 100%. */
const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
