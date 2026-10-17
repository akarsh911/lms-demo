'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableContainer from '@mui/material/TableContainer';
import { Plus } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';

export interface MdmBoardProps {
  summary: string;
  addLabel: string;
  onAdd: () => void;
  addDisabled?: boolean;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  isEmpty: boolean;
  emptyMessage: string;
  controls?: React.ReactNode;
  notice?: React.ReactNode;
  children?: React.ReactNode;
}

export function MdmBoard({
  summary,
  addLabel,
  onAdd,
  addDisabled = false,
  isPending,
  error,
  onRetry,
  isEmpty,
  emptyMessage,
  controls,
  notice,
  children,
}: MdmBoardProps): React.ReactElement {
  return (
    <Stack spacing={2.5}>
      {controls}

      <CardToolbar summary={summary}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<Plus size={16} />}
          onClick={onAdd}
          disabled={addDisabled}
        >
          {addLabel}
        </Button>
      </CardToolbar>

      {notice}

      {isPending ? <WidgetLoading rows={5} /> : null}
      {error ? <WidgetError error={error} onRetry={onRetry} /> : null}
      {!isPending && !error && isEmpty ? <WidgetEmpty message={emptyMessage} /> : null}

      {!isEmpty && !error ? (
        <TableContainer>
          <Table size="small">{children}</Table>
        </TableContainer>
      ) : null}
    </Stack>
  );
}

export function StatusChip({ status }: { status: string | undefined }): React.ReactElement {
  const value = status ?? 'active';
  return (
    <EmergeChip
      label={value}
      tone={value === 'active' ? 'green' : value === 'upcoming' ? 'amber' : 'grey'}
    />
  );
}
