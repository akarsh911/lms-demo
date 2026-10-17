'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Lightbulb, Maximize2 } from 'lucide-react';

import { EmergeChip } from '@/components/ui';

import { apparatus } from './apparatus-palette';

/**
 * THE TEACHING LAYER'S CHROME: the button on the bench bar and the panel it
 * opens. What goes inside is the bench's own `ui.Teach`.
 *
 * Two things this chrome is responsible for, and they are the whole reason it
 * is shared rather than written out per bench:
 *
 * 1. IT SAYS WHAT IT IS. Every panel carries the same badge — a teaching aid,
 *    not marked — in the same place, so a student never has to wonder whether
 *    the thing they are reading is part of what they are being assessed on.
 * 2. IT IS OFF UNTIL ASKED FOR. In a real lab there is nothing here to see, and
 *    a student should look at their own apparatus first. Opening it is a
 *    deliberate act.
 *
 * The `teach` flag is checked by the workspace, not here: a flag that is off
 * must mean this component is never rendered at all, rather than rendering
 * something that hides itself.
 */

/**
 * What the switch is called, open and shut.
 *
 * A single string cannot carry both: "Reveal the light path" does not become
 * "Hide reveal the light path". So a bench whose two states read differently
 * gives both, and everything else gives one word and gets "Hide …" for free.
 */
export type TeachLabel = string | { show: string; hide: string };

export const teachLabelFor = (label: TeachLabel | undefined, open: boolean): string => {
  const l = label ?? "What's happening";
  if (typeof l !== 'string') return open ? l.hide : l.show;
  return open ? `Hide ${l.charAt(0).toLowerCase()}${l.slice(1)}` : l;
};

/** The panel's heading: the noun, never the verb that opens it. */
export const teachTitleFor = (label: TeachLabel | undefined): string => {
  const l = label ?? "What's happening";
  if (typeof l === 'string') return l;
  const noun = l.hide.replace(/^Hide\s+/i, '');
  return noun.charAt(0).toUpperCase() + noun.slice(1);
};

export function TeachToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: TeachLabel;
}): React.ReactElement {
  return (
    <Button
      size="small"
      variant="outlined"
      data-tour="teach-toggle"
      aria-pressed={open}
      startIcon={<Lightbulb size={14} />}
      onClick={onToggle}
      sx={{
        flex: 'none',
        color: apparatus.benchInk,
        borderColor: open ? apparatus.hintRing : 'rgba(255,255,255,.16)',
        backgroundColor: open ? 'rgba(143,208,255,.12)' : 'transparent',
        '&:hover': {
          backgroundColor: 'rgba(255,255,255,.07)',
          borderColor: 'rgba(255,255,255,.28)',
        },
      }}
    >
      {teachLabelFor(label, open)}
    </Button>
  );
}

export function TeachPanel({
  title,
  revealed,
  onExpand,
  children,
}: {
  title: string;
  revealed: boolean;
  /** Open the same panel in the reading sheet, where there is room for it. */
  onExpand?: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  const theme = useTheme();
  return (
    <Box
      data-tour="teach-panel"
      role="region"
      aria-label={title}
      sx={{
        px: 1.75,
        py: 1.25,
        borderBottom: `1px solid ${theme.brand.line}`,
        backgroundColor: theme.brand.sunken,
        // A flat 320 was set when a panel was a wall of prose and the cap was
        // really a limit on how much of the console it could eat. Now that a
        // panel opens as a list of questions, the cap decides how many of them
        // a student can see at once — and seeing the whole list is the point of
        // having a list. Tied to the viewport so a tall screen shows more, and
        // held under half of it so the task and the notebook keep their room.
        maxHeight: 'min(46vh, 430px)',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        // A row cut off mid-word reads as broken. This says "there is more",
        // which is true, and the scrollbar says how much.
        maskImage: 'linear-gradient(to bottom, #000 calc(100% - 18px), transparent)',
        // The console is a flex COLUMN, and this panel is taller than the
        // column even with the cap on. Left to shrink it collapsed to the
        // height of its own padding — a scrollbar around a sliver of the first
        // line — and the longer the panel, the worse it got, so the benches
        // with the most to say showed the least of it. The cap above is the
        // whole of the size policy; nothing else may take pixels off it.
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
        <Typography
          component="h3"
          sx={{ fontWeight: 800, fontSize: theme.band.type.base, color: theme.brand.ink }}
        >
          {title}
        </Typography>
        <EmergeChip tone="violet" label="teaching aid · not marked" />
        {onExpand ? (
          <Box
            component="button"
            type="button"
            onClick={onExpand}
            sx={{
              ml: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              border: 0,
              p: 0.25,
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: theme.band.type.min,
              fontWeight: 700,
              color: theme.brand.sub,
            }}
          >
            <Maximize2 size={12} aria-hidden />
            Read it properly
          </Box>
        ) : null}
        {revealed ? null : (
          // Said plainly, so a student does not read the panel's silence about
          // their own readings as the panel being broken.
          <Typography sx={{ fontSize: theme.band.type.min, color: theme.brand.tert }}>
            It explains the method, not your readings — those are yours to take.
          </Typography>
        )}
      </Box>
      <Box
        sx={{
          color: theme.brand.text,
          fontSize: theme.band.type.base - 1,
          '& p': { m: 0, mt: 0.75 },
          // A figure is an illustration of the paragraph above it, so it takes
          // the column's width and keeps the paragraph's rhythm. Setting it
          // here rather than at each drawing is what stops one bench's figure
          // sitting differently from another's.
          '& > svg': { display: 'block', width: '100%', height: 'auto', mt: 1 },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
