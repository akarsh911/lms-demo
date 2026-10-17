'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { UI_CHART } from '@labs/lib/ph-samples/chemistry';

import { LABEL_FONT } from '../apparatus-palette';

/**
 * The universal indicator chart, in the two places a student needs it.
 *
 * `ChartPlate` is the printed card propped on the bench — part of the
 * apparatus, drawn inside the bench `<svg>`. `ColourMatcher` is the same chart
 * docked in the console beside the box the pH is typed into, with the tube's
 * own colour held against it and every square tappable.
 *
 * Both read `UI_CHART`, so there is exactly one set of colours: the chart on
 * the bench really is the chart the readings are marked against.
 */

export const PLATE_WIDTH = 306;
export const PLATE_HEIGHT = 176;

/** The chart as printed card stock, drawn at the origin of its own group. */
export function ChartPlate(): React.ReactElement {
  return (
    <g>
      <rect x={3} y={6} width={PLATE_WIDTH} height={PLATE_HEIGHT} rx={10} fill="#000" opacity={0.3} filter="url(#ph-soft)" />
      <rect x={0} y={0} width={PLATE_WIDTH} height={PLATE_HEIGHT} rx={10} fill="#f4f1ea" stroke="#c9c3b4" />
      <text
        x={153}
        y={21}
        fontSize={11}
        textAnchor="middle"
        fill="#1d1d1b"
        fontFamily={LABEL_FONT}
        fontWeight={700}
        letterSpacing="1.2"
      >
        UNIVERSAL INDICATOR
      </text>
      <text x={153} y={34} fontSize={9} textAnchor="middle" fill="#6b6658" fontFamily={LABEL_FONT}>
        match the colour, read the pH
      </text>
      {UI_CHART.map((hex, ph) => {
        const row = ph < 8 ? 0 : 1;
        const k = ph < 8 ? ph : ph - 8;
        const x = (ph < 8 ? 12 : 50) + k * 36;
        const y = 43 + row * 56;
        return (
          <g key={ph}>
            <rect x={x} y={y} width={34} height={34} rx={4} fill={hex} />
            <text
              x={x + 17}
              y={y + 46}
              fontSize={10}
              textAnchor="middle"
              fill="#1d1d1b"
              fontFamily={LABEL_FONT}
              fontWeight={600}
            >
              {ph}
            </text>
          </g>
        );
      })}
      <text x={14} y={166} fontSize={9} fill="#8a3a3a" fontFamily={LABEL_FONT}>
        acidic ◀
      </text>
      <text x={153} y={166} fontSize={9} textAnchor="middle" fill="#2f6b36" fontFamily={LABEL_FONT}>
        7 = neutral
      </text>
      <text x={292} y={166} fontSize={9} textAnchor="end" fill="#3b3a8a" fontFamily={LABEL_FONT}>
        ▶ basic
      </text>
    </g>
  );
}

/**
 * The chart docked beside the pH field, with the tube's colour against it.
 *
 * Reading a colour against a chart is the same problem as reading a needle
 * against a scale: the answer is only as good as how close the two are. Held
 * apart — chart on the bench, field in the console — a student guesses; held
 * together, they compare. Tapping a square writes its pH, which is exactly
 * what "match the colour, read the pH" means.
 */
export function ColourMatcher({
  colour,
  caption,
  picked,
  onPick,
  maxWidth,
}: {
  /** The colour to match: the strip on the tile, or the solution itself. */
  colour: string | null;
  caption: React.ReactNode;
  /** The pH already written for this tube, so the chart shows the choice. */
  picked: number | null;
  /** Omitted outside the recording step: the chart is then a reference only. */
  onPick?: (ph: number) => void;
  maxWidth?: number;
}): React.ReactElement {
  const theme = useTheme();

  return (
    <Box data-tour="ph-chart" sx={{ maxWidth, mx: 'auto', width: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1 }}>
        <Box
          sx={{
            flex: 'none',
            width: 52,
            borderRadius: `${theme.band.radius.sm}px`,
            border: `1px solid ${theme.brand.line2}`,
            backgroundColor: colour ?? theme.brand.sunken,
            backgroundImage: colour
              ? 'none'
              : 'repeating-linear-gradient(45deg, rgba(0,0,0,.05) 0 6px, transparent 6px 12px)',
            minHeight: 62,
          }}
          aria-hidden="true"
        />
        <Typography
          sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, textWrap: 'pretty', alignSelf: 'center' }}
        >
          {caption}
        </Typography>
      </Box>

      <Box
        role={onPick ? 'group' : undefined}
        aria-label={onPick ? 'Universal indicator chart — pick the matching colour' : undefined}
        sx={{
          mt: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: '3px',
        }}
      >
        {UI_CHART.map((hex, ph) => {
          const isPicked = picked !== null && Math.round(picked) === ph;
          return (
            <Box
              key={ph}
              component={onPick ? 'button' : 'div'}
              type={onPick ? 'button' : undefined}
              onClick={onPick ? () => onPick(ph) : undefined}
              aria-label={onPick ? `pH ${ph}` : undefined}
              aria-pressed={onPick ? isPicked : undefined}
              sx={{
                p: 0,
                border: 0,
                background: 'none',
                cursor: onPick ? 'pointer' : 'default',
                textAlign: 'center',
                '&:focus-visible': { outline: `2px solid ${theme.brand.orange}`, outlineOffset: 2 },
              }}
            >
              <Box
                sx={{
                  height: 26,
                  borderRadius: `${Math.min(theme.band.radius.sm, 8)}px`,
                  backgroundColor: hex,
                  boxShadow: isPicked ? `0 0 0 2px ${theme.brand.ink}` : `inset 0 0 0 1px rgba(0,0,0,.12)`,
                  transition: `box-shadow ${theme.band.motion.fast}ms`,
                }}
              />
              <Box
                component="span"
                sx={{
                  display: 'block',
                  fontSize: theme.band.type.min - 1,
                  fontWeight: isPicked ? 800 : 600,
                  color: isPicked ? theme.brand.ink : theme.brand.tert,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {ph}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Typography sx={{ mt: 0.5, fontSize: theme.band.type.min, color: theme.brand.tert, textWrap: 'pretty' }}>
        Reds and oranges are acidic, green is 7, blues and violets are basic.
        {onPick ? ' Tap the square that matches.' : null}
      </Typography>
    </Box>
  );
}
