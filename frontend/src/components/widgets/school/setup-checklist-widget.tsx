'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { SetupStatusIcon } from '@/components/school/setup/setup-status';
import { EmergeChip } from '@/components/ui/chip';
import { RecordList, type RecordColumn } from '@/components/ui/record-list';
import { useSchoolSetup } from '@/hooks/query/use-foundation';
import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { SetupItem, SetupStatus } from '@/types/foundation';
import type { WidgetProps } from '@/types/widget';

import { WidgetError, WidgetLoading } from '../widget-states';

const ICON_COLOUR: Readonly<Record<SetupStatus, string>> = {
  complete: 'success.main',
  attention: 'warning.main',
  not_started: 'text.disabled',
};

const STATUS_WORD: Readonly<Record<SetupStatus, string>> = {
  complete: 'Complete',
  attention: 'Needs attention',
  not_started: 'Not started',
};

const COLUMNS: readonly RecordColumn<SetupItem>[] = [
  {
    key: 'step',
    label: 'Essential',
    width: 'minmax(0, 1.2fr)',
    cell: (item) => (
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
        {/* The mark says the status by its shape, and by name to a screen reader: never by colour alone. */}
        <Box role="img" aria-label={STATUS_WORD[item.status]} sx={{ color: ICON_COLOUR[item.status], display: 'flex', flex: 'none' }}>
          <SetupStatusIcon status={item.status} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="p">
            {item.title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {item.explanation}
          </Typography>
          {/* On a phone the second column is dropped and its line is said here. */}
          <Typography variant="body2" sx={{ display: { xs: 'block', sm: 'none' }, mt: 0.5, fontWeight: 600 }}>
            {item.detail}
          </Typography>
        </Box>
      </Stack>
    ),
  },
  {
    key: 'detail',
    label: 'Where it stands',
    width: 'minmax(0, 1fr)',
    hideOnNarrow: true,
    cell: (item) => (
      <Typography
        variant="body2"
        color={item.status === 'attention' ? 'warning.dark' : item.status === 'not_started' ? 'text.secondary' : 'text.primary'}
        sx={{ fontWeight: item.status === 'attention' ? 600 : 400 }}
      >
        {item.detail}
      </Typography>
    ),
  },
];

const count = (items: readonly SetupItem[], status: SetupStatus): number => items.filter((item) => item.status === status).length;

// The persistent checklist: how ready the school is, said once, and a row to follow for each thing.
export function SetupChecklistWidget({ personaSlug }: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useSchoolSetup();

  if (isPending || isError) {
    return (
      <Card>
        <CardContent>
          {isPending ? <WidgetLoading rows={8} /> : <WidgetError error={error} onRetry={() => void refetch()} />}
        </CardContent>
      </Card>
    );
  }

  const percent = Math.round((data.complete / data.total) * 100);
  const attention = count(data.items, 'attention');
  const waiting = count(data.items, 'not_started');

  const hrefOf = (item: SetupItem): string | null => {
    const record = item.route ? ROUTE_INDEX.get(item.route) : undefined;
    return record ? paths.personaSection(personaSlug, [record.path, item.id].filter(Boolean).join('/')) : null;
  };

  return (
    <Card>
      <Box
        sx={(theme) => ({
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'auto minmax(0, 1fr) auto' },
          alignItems: 'center',
          columnGap: 4,
          rowGap: 2,
          px: 3,
          py: 3,
          backgroundColor: theme.brand.subtle,
          borderBottom: `1px solid ${theme.brand.line}`,
        })}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
          <Typography variant="figure" component="p" sx={{ fontSize: 44 }}>
            {percent}%
          </Typography>
          <Typography variant="body1" color="text.secondary">
            ready
          </Typography>
        </Stack>

        <div>
          <Typography variant="subtitle1" component="p" sx={{ mb: 1 }}>
            {data.complete} of {data.total} essentials complete
          </Typography>
          <LinearProgress
            variant="determinate"
            value={percent}
            color="success"
            aria-label={`${data.complete} of ${data.total} essentials complete`}
            sx={(theme) => ({ height: 8, backgroundColor: theme.brand.surface })}
          />
        </div>

        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {attention > 0 ? <EmergeChip label={`${attention} ${attention === 1 ? 'needs' : 'need'} attention`} tone="amber" dot /> : null}
          {waiting > 0 ? <EmergeChip label={`${waiting} not started`} /> : null}
          {attention === 0 && waiting === 0 ? <EmergeChip label="Everything is in place" tone="green" dot /> : null}
        </Stack>
      </Box>

      <CardContent>
        <RecordList ariaLabel="Setup checklist" columns={COLUMNS} rows={data.items} rowKey={(item) => item.key} hrefOf={hrefOf} />
      </CardContent>
    </Card>
  );
}
