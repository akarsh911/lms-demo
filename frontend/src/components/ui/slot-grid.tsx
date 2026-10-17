'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

export interface SlotGridColumn {
  key: string;
  label: React.ReactNode;
  short?: React.ReactNode;
  highlight?: boolean;
}

export interface SlotGridRow {
  key: string;
  label: React.ReactNode;
  meta?: React.ReactNode;
  muted?: boolean;
}

export function SlotGrid({
  columns,
  rows,
  renderCell,
  ariaLabel,
  rowHeaderWidth = 140,
  minColumnWidth = 120,
}: {
  columns: readonly SlotGridColumn[];
  rows: readonly SlotGridRow[];
  renderCell: (row: SlotGridRow, column: SlotGridColumn) => React.ReactNode;
  ariaLabel: string;
  rowHeaderWidth?: number;
  minColumnWidth?: number;
}): React.ReactElement {
  const theme = useTheme();

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        component="table"
        aria-label={ariaLabel}
        sx={{
          borderCollapse: 'separate',
          borderSpacing: 4,
          width: '100%',
          minWidth: minColumnWidth * columns.length + rowHeaderWidth,
        }}
      >
        <Box component="thead">
          <Box component="tr">
            <Box component="th" scope="col" sx={{ width: rowHeaderWidth, textAlign: 'left' }}>
              <Typography variant="caption" color="text.secondary">
                Period
              </Typography>
            </Box>
            {columns.map((column) => (
              <Box component="th" key={column.key} scope="col" sx={{ textAlign: 'left' }}>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 700, color: column.highlight ? theme.brand.orange : 'inherit' }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                    {column.label}
                  </Box>
                  <Box component="span" sx={{ display: { xs: 'inline', md: 'none' } }}>
                    {column.short ?? column.label}
                  </Box>
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Box component="tbody">
          {rows.map((row) => (
            <Box component="tr" key={row.key}>
              <Box
                component="th"
                scope="row"
                sx={{ textAlign: 'left', verticalAlign: 'top', opacity: row.muted ? 0.6 : 1 }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {row.label}
                </Typography>
                {row.meta ? (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {row.meta}
                  </Typography>
                ) : null}
              </Box>
              {columns.map((column) => (
                <Box
                  component="td"
                  key={column.key}
                  sx={{
                    verticalAlign: 'top',
                    p: 0.75,
                    borderRadius: `${theme.band.radius.sm}px`,
                    border: `1px solid ${theme.brand.line}`,
                    backgroundColor: row.muted ? theme.brand.sunken : theme.brand.surface,
                  }}
                >
                  {renderCell(row, column)}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
