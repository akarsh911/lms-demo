'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

/**
 * A practical's observation table: numbered rows of readings, placeholder rows
 * for the ones still to take, an optional entry row for the next reading, and
 * an optional summary row (a mean).
 *
 * Every bench keeps one, and they differ only in their columns, so the columns
 * are data and the cells are whatever the owner renders. Numbers are set in
 * tabular figures and right-aligned, as a notebook would.
 */
export interface ObservationColumn {
  label: React.ReactNode;
  align?: 'left' | 'right';
}

export function ObservationTable({
  caption,
  columns,
  rows,
  expectedRows = 0,
  entry,
  summary,
}: {
  caption?: React.ReactNode;
  columns: readonly ObservationColumn[];
  /** Recorded rows, cells in column order. */
  rows: readonly React.ReactNode[][];
  /** Draw placeholder rows up to this count, so the table shows what is still to do. */
  expectedRows?: number;
  /** Cells for the next reading's entry row; omit when not taking readings. */
  entry?: readonly React.ReactNode[];
  summary?: readonly React.ReactNode[];
}): React.ReactElement {
  const theme = useTheme();
  const align = (i: number): 'left' | 'right' => columns[i]?.align ?? (i === 0 ? 'left' : 'right');

  const cell = {
    px: 0.75,
    py: 0.9,
    borderBottom: `1px solid ${theme.brand.line}`,
  } as const;

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: theme.band.type.base - 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {caption ? (
          <Box
            component="caption"
            sx={{ captionSide: 'top', textAlign: 'left', fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, pb: 0.75 }}
          >
            {caption}
          </Box>
        ) : null}
        <thead>
          <tr>
            {columns.map((col, i) => (
              <Box
                component="th"
                key={i}
                scope="col"
                sx={{
                  ...cell,
                  textAlign: align(i),
                  fontSize: theme.band.type.min,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: theme.brand.tert,
                  fontWeight: 700,
                  borderBottomColor: theme.brand.line2,
                }}
              >
                {col.label}
              </Box>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((c, i) => (
                <Box component="td" key={i} sx={{ ...cell, textAlign: align(i) }}>
                  {c}
                </Box>
              ))}
            </tr>
          ))}
          {Array.from({ length: Math.max(0, expectedRows - rows.length) }, (_, k) => (
            <Box component="tr" key={`empty-${k}`} sx={{ color: theme.brand.tert }}>
              {columns.map((_, i) => (
                <Box component="td" key={i} sx={{ ...cell, textAlign: align(i) }}>
                  {i === 0 ? rows.length + k + 1 : i === columns.length - 1 ? '' : '—'}
                </Box>
              ))}
            </Box>
          ))}
          {summary ? (
            <tr>
              {summary.map((c, i) => (
                <Box component="td" key={i} sx={{ ...cell, textAlign: align(i), color: theme.brand.sub }}>
                  {c}
                </Box>
              ))}
            </tr>
          ) : null}
          {entry ? (
            <tr>
              {entry.map((c, i) => (
                <Box component="td" key={i} sx={{ px: 0.5, pt: 1.25, textAlign: align(i), verticalAlign: 'top' }}>
                  {c}
                </Box>
              ))}
            </tr>
          ) : null}
        </tbody>
      </Box>
    </Box>
  );
}
