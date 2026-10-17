'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ChevronDown, CirclePlay, FlaskConical, Hammer, LayoutGrid, LifeBuoy, RotateCcw } from 'lucide-react';

import { BENCH_METAS } from './bench-registry';

/**
 * The lab's header controls: how the attempt is going, and the few things that
 * are not part of the practical itself.
 *
 * The score, mistakes, time and bench number read as one line of tabular
 * figures rather than four boxed tiles: they are glanced at, not operated, and
 * four tiles cost the width two real buttons need.
 *
 * "How to play", "Guided build" and "New bench" go behind one Help menu. They
 * are each used once, if at all, while the header is on screen for the whole
 * practical. Starting a new bench DISCARDS work, so it asks first — it used to
 * sit one pixel from "Guided build" and throw the attempt away silently.
 */
export function LabStats({
  score,
  mistakes,
  time,
  bench,
}: {
  score: number;
  mistakes: number;
  /** A node, so the clock can tick in its own component and not re-render the lab. */
  time: React.ReactNode;
  bench: number;
}): React.ReactElement {
  const theme = useTheme();
  const sep = (
    <Box component="span" aria-hidden="true" sx={{ color: theme.brand.line2 }}>
      ·
    </Box>
  );
  const value = { fontWeight: 800, color: theme.brand.ink, fontVariantNumeric: 'tabular-nums' } as const;

  return (
    <Box
      data-tour="stats"
      sx={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 1,
        flexWrap: 'wrap',
        fontSize: theme.band.type.base - 0.5,
        color: theme.brand.sub,
      }}
    >
      <Box component="span" sx={value}>
        {score}
        <Box component="span" sx={{ color: theme.brand.tert, fontWeight: 600 }}>
          /100
        </Box>
      </Box>
      {sep}
      <Box component="span">
        <Box component="span" sx={{ ...value, color: mistakes ? theme.hues.red : theme.brand.ink }}>
          {mistakes}
        </Box>{' '}
        {mistakes === 1 ? 'mistake' : 'mistakes'}
      </Box>
      {sep}
      <Box component="span" sx={value}>
        {time}
      </Box>
      {sep}
      <Box component="span" sx={{ color: theme.brand.tert }}>
        bench #{bench}
      </Box>
    </Box>
  );
}

export function LabHelpMenu({
  onTutorial,
  onGuidedBuild,
  onNewBench,
  /** What a new bench actually changes here — a resistor, a slide, a seed. */
  newBenchHint,
  disabled,
  /** True when a new bench would throw away real work. */
  hasProgress,
  container,
}: {
  /** Omitted when an administrator has switched the tutorial off. */
  onTutorial?: (() => void) | undefined;
  /** Omitted by a bench that has no guided build. */
  onGuidedBuild?: (() => void) | undefined;
  onNewBench: () => void;
  newBenchHint?: string | undefined;
  disabled: boolean;
  hasProgress: boolean;
  container?: HTMLElement | undefined;
}): React.ReactElement {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const close = (): void => setAnchor(null);

  const startNewBench = (): void => {
    close();
    if (hasProgress) setConfirming(true);
    else onNewBench();
  };

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        disabled={disabled}
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<LifeBuoy size={15} />}
        endIcon={<ChevronDown size={14} />}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        sx={{ flex: 'none' }}
      >
        Help
      </Button>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} container={container}>
        {onTutorial ? (
          <MenuItem
            onClick={() => {
              close();
              onTutorial();
            }}
          >
            <ListItemIcon>
              <CirclePlay size={16} />
            </ListItemIcon>
            <ListItemText primary="How to play" secondary="Every control, nothing marked" />
          </MenuItem>
        ) : null}
        {onGuidedBuild ? (
          <MenuItem
            onClick={() => {
              close();
              onGuidedBuild();
            }}
          >
            <ListItemIcon>
              <Hammer size={16} />
            </ListItemIcon>
            <ListItemText primary="Guided build" secondary="Build it once, step by step" />
          </MenuItem>
        ) : null}
        <MenuItem onClick={startNewBench}>
          <ListItemIcon>
            <RotateCcw size={16} />
          </ListItemIcon>
          <ListItemText primary="New bench" secondary={newBenchHint ?? 'A freshly set up bench'} />
        </MenuItem>
      </Menu>

      <Dialog open={confirming} onClose={() => setConfirming(false)} container={container}>
        <DialogTitle>Start a new bench?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This attempt is discarded — its readings, marks and mistakes all go with it.
            {newBenchHint ? ` The new bench has ${newBenchHint[0]!.toLowerCase()}${newBenchHint.slice(1)}.` : ''}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(false)} color="inherit">
            Keep working
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfirming(false);
              onNewBench();
            }}
          >
            Discard and start
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/**
 * Switch practical, or go back to the list.
 *
 * With a bench open the catalogue is not on screen, so this is the way back to
 * it — and the fastest way to the next practical on the syllabus.
 */
export function PracticalMenu({
  current,
  onChoose,
  container,
}: {
  current: string;
  onChoose: (id: string | null) => void;
  container?: HTMLElement | undefined;
}): React.ReactElement {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const close = (): void => setAnchor(null);
  const here = BENCH_METAS.find((m) => m.id === current);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={<FlaskConical size={15} />}
        endIcon={<ChevronDown size={14} />}
        aria-haspopup="menu"
        aria-expanded={anchor ? 'true' : undefined}
        sx={{ flex: 'none' }}
      >
        Practical {here?.cbse ?? ''}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} container={container}>
        <MenuItem
          onClick={() => {
            close();
            onChoose(null);
          }}
        >
          <ListItemIcon>
            <LayoutGrid size={16} />
          </ListItemIcon>
          <ListItemText primary="All practicals" secondary="Back to the list" />
        </MenuItem>
        <Divider />
        {BENCH_METAS.map((meta) => (
          <MenuItem
            key={meta.id}
            selected={meta.id === current}
            onClick={() => {
              close();
              onChoose(meta.id);
            }}
          >
            <ListItemText primary={`${meta.cbse}. ${meta.title}`} secondary={meta.subject} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** One line naming the practical, under the widget title. */
export function LabEyebrow(): React.ReactElement {
  const theme = useTheme();
  return (
    <Typography component="span" sx={{ fontSize: 'inherit', color: theme.brand.tert }}>
      Class 10 Science · NCERT Ch. 11 Electricity
    </Typography>
  );
}
