'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import type { Theme } from '@mui/material/styles';
import NextLink from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface RecordColumn<T> {
  key: string;
  label: string;
  // A grid track, e.g. `minmax(0, 1fr)` or `160px`.
  width: string;
  align?: 'end';
  // Dropped on a phone even if it is the last column, for a list whose first cell can carry it instead.
  hideOnNarrow?: boolean;
  cell: (row: T) => React.ReactNode;
}

const CHEVRON_TRACK = '20px';

// A boxed list in columns, where a row is a link or a button rather than a table row that cannot be one.
export function RecordList<T>({
  ariaLabel,
  columns,
  rows,
  rowKey,
  hrefOf,
  onSelect,
  isSelected,
  dimmed = false,
}: {
  ariaLabel: string;
  columns: readonly RecordColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  hrefOf?: (row: T) => string | null;
  onSelect?: (row: T) => void;
  isSelected?: (row: T) => boolean;
  dimmed?: boolean;
}): React.ReactElement {
  const actionable = Boolean(hrefOf ?? onSelect);
  const last = columns.length - 1;

  // Below `sm` only the first and last columns are kept, so a row never scrolls sideways.
  const narrow = (index: number): boolean => index === 0 || (index === last && !columns[index]?.hideOnNarrow);
  const tracks = {
    xs: [
      'minmax(0, 1fr)',
      // Capped, so a long last column wraps instead of crushing the first.
      ...columns.flatMap((_, index) => (index > 0 && narrow(index) ? ['fit-content(42%)'] : [])),
      ...(actionable ? [CHEVRON_TRACK] : []),
    ].join(' '),
    sm: [...columns.map((column) => column.width), ...(actionable ? [CHEVRON_TRACK] : [])].join(' '),
  };
  const grid = { display: 'grid', gridTemplateColumns: tracks, columnGap: 2, alignItems: 'center', px: 2 } as const;
  const shownAt = (index: number) => ({ display: narrow(index) ? 'block' : { xs: 'none', sm: 'block' } });

  return (
    <Box
      sx={(theme) => ({
        border: `1px solid ${theme.brand.line}`,
        borderRadius: `${theme.band.radius.md}px`,
        overflow: 'hidden',
        backgroundColor: theme.brand.surface,
      })}
    >
      <Box aria-hidden="true" sx={(theme) => ({ ...grid, py: 1.25, backgroundColor: theme.brand.subtle, borderBottom: `1px solid ${theme.brand.line}` })}>
        {columns.map((column, index) => (
          <Typography
            key={column.key}
            variant="eyebrow"
            component="span"
            noWrap
            sx={(theme) => ({ ...shownAt(index), color: theme.brand.tert, textAlign: column.align === 'end' ? 'right' : 'left' })}
          >
            {column.label}
          </Typography>
        ))}
      </Box>

      <Box
        component="ul"
        aria-label={ariaLabel}
        // Dimmed while the next page is in flight, so rows stay put instead of collapsing to a skeleton.
        sx={{ listStyle: 'none', m: 0, p: 0, opacity: dimmed ? 0.55 : 1, transition: 'opacity 120ms' }}
      >
        {rows.map((row) => {
          const href = hrefOf?.(row) ?? null;
          const selected = isSelected?.(row) ?? false;
          const cells = (
            <>
              {columns.map((column, index) => (
                <Box key={column.key} sx={{ ...shownAt(index), minWidth: 0, justifySelf: column.align === 'end' ? 'end' : 'stretch' }}>
                  {column.cell(row)}
                </Box>
              ))}
              {/* The track is kept for a row that leads nowhere, so its columns still line up with the rest. */}
              {actionable ? href || onSelect ? <ChevronRight size={16} className="record-chevron" aria-hidden /> : <span /> : null}
            </>
          );
          const rowSx = (theme: Theme) => ({
            ...grid,
            width: '100%',
            minHeight: 60,
            py: 1,
            textAlign: 'left' as const,
            justifyContent: 'stretch',
            color: 'inherit',
            textDecoration: 'none',
            backgroundColor: selected ? theme.brand.sunken : 'transparent',
            transition: 'background-color 120ms',
            '& .record-chevron': { color: theme.palette.text.disabled, transition: 'transform 120ms, color 120ms' },
            '&:hover, &.Mui-focusVisible': {
              backgroundColor: selected ? theme.brand.sunken : theme.brand.subtle,
              '& .record-chevron': { color: theme.brand.ink, transform: 'translateX(2px)' },
            },
          });

          return (
            <Box component="li" key={rowKey(row)} sx={(theme) => ({ '& + &': { borderTop: `1px solid ${theme.brand.line}` } })}>
              {href ? (
                <ButtonBase component={NextLink} href={href} sx={rowSx}>
                  {cells}
                </ButtonBase>
              ) : onSelect ? (
                <ButtonBase component="div" aria-pressed={selected} onClick={() => onSelect(row)} sx={rowSx}>
                  {cells}
                </ButtonBase>
              ) : (
                <Box sx={rowSx}>{cells}</Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
