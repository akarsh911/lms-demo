'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { CheckCircle2, ChevronRight } from 'lucide-react';

import { AttentionIcon } from '@/components/home/overview/attention-icon';
import { useSchoolOverview } from '@/hooks/query/use-foundation';
import { overviewHref } from '@/lib/school/overview';
import type { WidgetProps } from '@/types/widget';

import { WidgetError, WidgetLoading } from '../widget-states';

// Everything else that wants a decision, as a list to work down. Each row goes to where it is resolved.
export function OverviewNeedsWidget({ title, personaSlug }: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useSchoolOverview();
  const needs = data?.needs ?? [];
  // The full inbox, when this person holds Actions; the route simply resolves to nothing otherwise.
  const inbox = overviewHref(personaSlug, { route: 'actions' });

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader
        title={title}
        subheader={data ? `${needs.length} ${needs.length === 1 ? 'item' : 'items'}` : undefined}
        action={
          inbox ? (
            <Button component={NextLink} href={inbox} size="small" endIcon={<ChevronRight size={14} />}>
              All Actions
            </Button>
          ) : null
        }
      />
      {isPending || isError ? (
        <CardContent>
          {isPending ? <WidgetLoading rows={4} /> : null}
          {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}
        </CardContent>
      ) : null}

      {data && needs.length === 0 ? (
        <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', p: 3 }}>
          <Box sx={{ color: 'success.main', display: 'flex', mt: 0.25 }}>
            <CheckCircle2 size={22} aria-hidden />
          </Box>
          <div>
            <Typography variant="subtitle1" component="p">
              School operations are on track.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Attendance is submitted, no room conflicts are active, and no setup actions need attention.
            </Typography>
          </div>
        </Stack>
      ) : null}

      {needs.length > 0 ? (
        <List disablePadding sx={{ px: 3, py: 1 }}>
          {needs.map((item, index) => {
            const href = overviewHref(personaSlug, item.link);
            return (
              <ListItem key={item.id} disableGutters divider={index < needs.length - 1} sx={{ gap: 1.5, py: 1.5 }}>
                <ListItemIcon sx={{ minWidth: 0, color: 'warning.main' }}>
                  <AttentionIcon kind={item.kind} />
                </ListItemIcon>
                <ListItemText
                  primary={item.title}
                  secondary={item.detail}
                  slotProps={{ primary: { variant: 'subtitle1' }, secondary: { variant: 'body2' } }}
                  sx={{ my: 0, minWidth: 0 }}
                />
                {href ? (
                  <Button component={NextLink} href={href} size="small" variant="outlined" endIcon={<ChevronRight size={14} />} sx={{ flex: 'none' }}>
                    {item.action}
                  </Button>
                ) : (
                  // The place that would resolve it is not built yet, and saying so beats a button that goes nowhere.
                  <Chip size="small" label="Coming later" sx={{ flex: 'none' }} />
                )}
              </ListItem>
            );
          })}
        </List>
      ) : null}
    </Card>
  );
}
