'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { alpha, useTheme } from '@mui/material/styles';

import { yearLabel } from '@/lib/timeline/model';
import { COASTLINES, INDIA_OUTLINE } from '@/lib/timeline/world';
import type { TimelineEvent } from '@/types/timeline';

import { useRegionColour } from './region-colour';

const MW = 720;
const LAT_TOP = 82;
const LAT_BOTTOM = -56;
const MH = Math.round((MW * (LAT_TOP - LAT_BOTTOM)) / 360);
const SEA = '#7FB3D5';

const mapX = (lon: number): number => ((((lon + 180) % 360) + 360) % 360 / 360) * MW;
const mapY = (lat: number): number => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * MH;

function outline(flat: readonly number[]): string {
  const points: string[] = [];
  let previous: number | null = null;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const x = mapX(flat[i] ?? 0);
    const wrapped = previous !== null && Math.abs(x - previous) > MW / 2;
    points.push(`${previous === null || wrapped ? 'M' : 'L'}${x.toFixed(1)} ${mapY(flat[i + 1] ?? 0).toFixed(1)}`);
    previous = x;
  }
  return points.join('');
}

const COAST_PATHS = COASTLINES.map(outline);
const INDIA_PATH = `${outline(INDIA_OUTLINE)}Z`;

export function placed(events: readonly TimelineEvent[]): TimelineEvent[] {
  return events.filter((event) => event.lat !== null && event.lon !== null);
}

export function TimelineMap({
  events,
  selected,
  onSelect,
}: {
  events: readonly TimelineEvent[];
  selected: TimelineEvent;
  onSelect: (event: TimelineEvent) => void;
}): React.ReactElement {
  const theme = useTheme();
  const colour = useRegionColour();
  const others = placed(events).filter((event) => event.index !== selected.index);
  const pin = selected.lat !== null && selected.lon !== null ? { x: mapX(selected.lon), y: mapY(selected.lat) } : null;
  const where = selected.place ?? selected.label.slice(0, 34);

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${MW} ${MH}`}
      role="img"
      aria-label={pin ? `A world map with ${where} marked` : 'A world map of the events in view'}
      sx={{
        display: 'block',
        width: '100%',
        height: 'auto',
        borderRadius: `${theme.band.radius.sm}px`,
        border: `1px solid ${theme.brand.line}`,
        backgroundColor: alpha(SEA, 0.14),
        fontFamily: theme.typography.fontFamily,
      }}
    >
      {COAST_PATHS.map((path, index) => (
        <path key={index} d={path} fill="none" stroke={alpha(theme.brand.ink, 0.38)} strokeWidth={0.8} strokeLinejoin="round" />
      ))}
      <path d={INDIA_PATH} fill={alpha(theme.brand.accent, 0.12)} stroke={alpha(theme.brand.accent, 0.6)} strokeWidth={1} />
      {others.map((event) => (
        <circle
          key={event.index}
          cx={mapX(event.lon ?? 0)}
          cy={mapY(event.lat ?? 0)}
          r={3.8}
          fill={colour(event.region)}
          fillOpacity={0.72}
          style={{ cursor: 'pointer' }}
          onClick={() => onSelect(event)}
        >
          <title>{`${event.place ?? event.label} — ${yearLabel(event.year)}`}</title>
        </circle>
      ))}
      {pin ? (
        <g>
          <circle cx={pin.x} cy={pin.y} r={13} fill={colour(selected.region)} fillOpacity={0.2} />
          <circle cx={pin.x} cy={pin.y} r={6.4} fill={colour(selected.region)} stroke="#FFFFFF" strokeWidth={2} />
          <text
            x={pin.x + (pin.x > MW - 150 ? -16 : 16)}
            y={pin.y + 4}
            textAnchor={pin.x > MW - 150 ? 'end' : 'start'}
            fontSize={12.5}
            fontWeight={700}
            fill={theme.brand.sub}
            stroke={theme.brand.surface}
            strokeWidth={3.5}
            paintOrder="stroke"
            pointerEvents="none"
          >
            {where}
          </text>
        </g>
      ) : null}
    </Box>
  );
}
