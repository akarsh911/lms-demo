'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';

import { useSchoolOverview } from '@/hooks/query/use-foundation';
import type { WidgetProps } from '@/types/widget';

import { WidgetEmpty, WidgetError, WidgetLoading } from '../widget-states';

// What is on at school today beyond lessons, in time order. Not a calendar.
export function OverviewAgendaWidget({ title }: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useSchoolOverview();
  const agenda = data?.agenda ?? [];

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title={title} subheader="School events, in time order" />
      {isPending || isError || agenda.length === 0 ? (
        <CardContent>
          {isPending ? <WidgetLoading rows={3} /> : null}
          {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}
          {data && agenda.length === 0 ? <WidgetEmpty message="Nothing is on today beyond lessons." /> : null}
        </CardContent>
      ) : (
        <List disablePadding sx={{ px: 3, py: 1 }}>
          {agenda.map((item, index) => (
            <ListItem key={item.id} disableGutters divider={index < agenda.length - 1} sx={{ gap: 2, py: 1.5 }}>
              <Typography variant="body2" component="span" color="text.secondary" sx={{ width: 48, flex: 'none', fontVariantNumeric: 'tabular-nums' }}>
                {item.time}
              </Typography>
              <ListItemText
                primary={item.title}
                secondary={item.detail}
                slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'body2' } }}
                sx={{ my: 0 }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </Card>
  );
}
