import type { Components, Theme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';

import type { GradeBand } from '../bands';
import { brand, fonts, tints } from '../tokens';

// Column names are labels, not content: a mono strip keeps them out of the way of the rows.
const HEAD = {
  fontFamily: fonts.mono,
  fontSize: 10.5,
  fontWeight: 500,
  letterSpacing: '0.12em',
  lineHeight: 1.6,
  textTransform: 'uppercase',
  color: brand.tert,
} as const;

export function data(band: GradeBand): Components<Theme> {
  return {
    MuiTableContainer: {
      styleOverrides: {
        root: { border: `1px solid ${brand.line}`, borderRadius: band.radius.md, backgroundColor: brand.surface },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${brand.line}`, fontSize: band.type.base, paddingBlock: 12, paddingInline: 16 },
        head: {
          ...HEAD,
          paddingBlock: 10,
          backgroundColor: brand.subtle,
          borderBottom: `1px solid ${brand.line}`,
          whiteSpace: 'nowrap',
        },
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-of-type > .MuiTableCell-body': { borderBottom: 0 },
          '&.MuiTableRow-hover:hover': { backgroundColor: brand.subtle },
        },
      },
    },

    // The same table language as `Table`: a mono head strip, rounded rows that tint on hover, selection as a rose wash.
    MuiDataGrid: {
      defaultProps: { disableColumnMenu: true, rowHeight: 56, columnHeaderHeight: 44, disableColumnResize: true },
      styleOverrides: {
        root: {
          border: 0,
          backgroundColor: 'transparent',
          fontSize: band.type.base,
          '--DataGrid-rowBorderColor': brand.line,
          '& .MuiDataGrid-columnHeader, & .MuiDataGrid-cell': { outline: 'none !important' },
          '& .MuiDataGrid-columnSeparator': { display: 'none' },
          '& .MuiDataGrid-columnHeaders [role="row"]': { backgroundColor: brand.subtle },
          '& .MuiDataGrid-columnHeaderTitle': HEAD,
          '& .MuiDataGrid-row': { borderRadius: band.radius.md, '&:hover': { backgroundColor: brand.subtle } },
          '& .MuiDataGrid-row.Mui-selected': { backgroundColor: tints.rose, '&:hover': { backgroundColor: tints.rose } },
          // Checkboxes stay visible but quiet at rest, so the column never looks empty; full strength on hover or once chosen.
          '& .MuiDataGrid-cellCheckbox .MuiCheckbox-root, & .MuiDataGrid-columnHeaderCheckbox .MuiCheckbox-root': { opacity: 0.45, transition: 'opacity 120ms' },
          '& .MuiDataGrid-row:hover .MuiCheckbox-root, & .MuiDataGrid-row.Mui-selected .MuiCheckbox-root, & .MuiDataGrid-columnHeaders:hover .MuiCheckbox-root, & .MuiCheckbox-root.Mui-checked, & .MuiCheckbox-root.MuiCheckbox-indeterminate, & .MuiCheckbox-root:focus-visible':
            { opacity: 1 },
          '& .MuiDataGrid-footerContainer': { borderTop: `1px solid ${brand.line}`, minHeight: 48 },
        },
      },
    },

    MuiAvatar: {
      styleOverrides: {
        root: { backgroundColor: brand.sunken, color: brand.ink, fontFamily: fonts.display, fontWeight: 700 },
      },
    },

    MuiBadge: { styleOverrides: { badge: { fontFamily: fonts.mono, fontWeight: 600 } } },
  };
}
