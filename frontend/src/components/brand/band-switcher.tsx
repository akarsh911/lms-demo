'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Palette } from 'lucide-react';

import { GRADE_BANDS, useBand, type GradeBandId } from '@/styles/theme';

/**
 * Preview the grade bands.
 *
 * A DEVELOPMENT AND DESIGN-REVIEW TOOL. In production the band is resolved from
 * the user's class groups on the server and nobody chooses it — a Class 3 pupil
 * does not get a theme picker.
 *
 * It is safe to expose regardless: the band controls corner radius, type scale
 * and how much illustration is drawn. It grants nothing. Someone who forces the
 * senior band sees denser type, not another student's marks.
 */
export function BandSwitcher(): React.ReactElement {
  const { band, setBand, isOverridden, resetBand } = useBand();
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);

  const choose = (next: GradeBandId): void => {
    setAnchor(null);
    setBand(next);
  };

  return (
    <>
      <Button
        size="small"
        variant={isOverridden ? 'contained' : 'text'}
        color={isOverridden ? 'primary' : 'inherit'}
        startIcon={<Palette size={15} />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
      >
        {GRADE_BANDS[band].label}
      </Button>

      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {Object.values(GRADE_BANDS).map((b) => (
          <MenuItem key={b.id} selected={b.id === band} onClick={() => choose(b.id)}>
            <ListItemText primary={b.label} secondary={`Class ${b.grades} · ${b.ornament}`} />
          </MenuItem>
        ))}
        {isOverridden ? (
          <MenuItem
            onClick={() => {
              setAnchor(null);
              resetBand();
            }}
          >
            <ListItemText primary="Reset to my band" />
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );
}
