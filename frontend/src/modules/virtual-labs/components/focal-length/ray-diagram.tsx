'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import type { PartId } from '@labs/lib/focal-length/optics';

import { apparatus, LABEL_FONT } from '../apparatus-palette';

/**
 * The two ray diagrams this practical is built on, drawn the way the textbook
 * draws them: three rays arriving parallel to the principal axis, meeting at
 * the principal focus, and the screen standing exactly there.
 *
 * It is a schematic, not a scale drawing of the bench — f is shown at a
 * readable fraction of the width rather than at 8.8 px per centimetre — because
 * its job is to say WHY the screen-to-pole distance is f. The bench beside it
 * is the one drawn to scale.
 */
export function RayDiagram({ part }: { part: PartId }): React.ReactElement {
  const theme = useTheme();
  return (
    <Box>
      <Panel part="mirror" active={part === 'mirror'} />
      <Box sx={{ mt: 1.5 }}>
        <Panel part="lens" active={part === 'lens'} />
      </Box>
      <Typography sx={{ mt: 1.25, fontSize: theme.band.type.base - 1.5, color: theme.brand.sub }}>
        Rays from an object 120 m away spread over about two hundredths of a degree by the time they reach a 5 cm
        aperture — parallel, for this experiment. Parallel rays meet at the principal focus, so the screen that
        catches the sharp image is standing in the focal plane and <b>f = |a − b|</b>, the distance between the two
        index marks on the metre scale.
      </Typography>
    </Box>
  );
}

const W = 360;
const H = 116;
const AX = 58;

function Panel({ part, active }: { part: PartId; active: boolean }): React.ReactElement {
  const theme = useTheme();
  const mirror = part === 'mirror';
  // Pole / optical centre, and the focus at a readable distance from it.
  const p = mirror ? 300 : 150;
  const f = mirror ? p - 150 : p + 150;
  const ys = [AX - 34, AX, AX + 34];

  return (
    <Box
      sx={{
        borderRadius: `${theme.band.radius.md}px`,
        backgroundColor: apparatus.bench,
        p: 0.75,
        opacity: active ? 1 : 0.55,
        outline: active ? `2px solid ${theme.brand.orange}` : 'none',
        outlineOffset: 2,
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          mirror
            ? 'Concave mirror: parallel rays reflect and meet at the principal focus, where the screen stands'
            : 'Convex lens: parallel rays refract and meet at the principal focus behind the lens, where the screen stands'
        }
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        <line x1={8} y1={AX} x2={W - 8} y2={AX} stroke="#6f7c7a" strokeWidth={1} strokeDasharray="7 6" />

        {/* Rays arriving parallel to the principal axis */}
        {ys.map((y) => (
          <line
            key={`in-${y}`}
            x1={mirror ? 14 : 8}
            y1={y}
            x2={p}
            y2={y}
            stroke="#ffe6ad"
            strokeWidth={1.4}
            opacity={0.85}
          />
        ))}
        {/* …and converging on the focus after the optic */}
        {ys.map((y) => (
          <line key={`out-${y}`} x1={p} y1={y} x2={f} y2={AX} stroke="#ffd98a" strokeWidth={1.4} />
        ))}

        {mirror ? (
          <path d={`M${p + 8} ${AX - 42} Q${p - 10} ${AX} ${p + 8} ${AX + 42}`} fill="none" stroke="#cfe3ea" strokeWidth={3} />
        ) : (
          <path
            d={`M${p} ${AX - 42} Q${p + 16} ${AX} ${p} ${AX + 42} Q${p - 16} ${AX} ${p} ${AX - 42} Z`}
            fill="#cfe3ea"
            opacity={0.5}
            stroke="#dff0f5"
            strokeWidth={1.4}
          />
        )}

        {/* The screen, standing in the focal plane */}
        <rect x={f - 3} y={AX - 26} width={6} height={52} rx={2} fill="#fbfaf5" stroke="#b9b3a2" />
        <circle cx={f} cy={AX} r={2.6} fill="#ffd98a" />

        {/* f, measured from the pole or the optical centre to the screen */}
        <line x1={Math.min(p, f)} y1={AX + 50} x2={Math.max(p, f)} y2={AX + 50} stroke="#8fd0ff" strokeWidth={1} />
        <line x1={p} y1={AX + 45} x2={p} y2={AX + 55} stroke="#8fd0ff" strokeWidth={1} />
        <line x1={f} y1={AX + 45} x2={f} y2={AX + 55} stroke="#8fd0ff" strokeWidth={1} />
        <text
          x={(p + f) / 2}
          y={AX + 46}
          fontSize={11}
          textAnchor="middle"
          fill="#8fd0ff"
          fontFamily={LABEL_FONT}
          fontWeight={700}
        >
          f
        </text>

        <text x={p} y={AX - 50} fontSize={10} textAnchor="middle" fill={apparatus.benchLabel} fontFamily={LABEL_FONT} letterSpacing={1.2}>
          {mirror ? 'CONCAVE MIRROR' : 'CONVEX LENS'}
        </text>
        <text x={f} y={AX + 70} fontSize={10} textAnchor="middle" fill={apparatus.benchLabel} fontFamily={LABEL_FONT} letterSpacing={1.2}>
          SCREEN AT F
        </text>
        <text
          x={10}
          y={AX - 46}
          fontSize={10}
          textAnchor="start"
          fill={apparatus.benchLabel}
          fontFamily={LABEL_FONT}
          letterSpacing={1.2}
        >
          FROM A DISTANT OBJECT
        </text>
      </svg>
    </Box>
  );
}
