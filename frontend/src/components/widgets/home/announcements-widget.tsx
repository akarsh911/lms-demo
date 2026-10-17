'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, Pin } from 'lucide-react';

import { PaperArt } from '@/components/brand/paper-art';
import { CATEGORY } from '@/components/notices/notice-meta';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useNotices } from '@/hooks/query/use-notices';
import { formatRelativeTime } from '@/lib/dates';
import { paths } from '@/paths';
import type { WidgetProps } from '@/types/widget';

const Nothing = (): React.ReactElement => (
  <CardContent sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
    <EmptyState art={<PaperArt name="lamp" width={168} />} title="Nothing new" body="Notices from your school and your teachers appear here." />
  </CardContent>
);

// The latest live notices, pinned first; the full feed is the Announcements page.
export function AnnouncementsWidget({ title, personaSlug }: WidgetProps): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useNotices();
  const live = (data ?? []).filter((n) => n.state === 'published').slice(0, 4);
  const href = (open?: string): string => `${paths.personaSection(personaSlug, 'announcements')}${open ? `?open=${open}` : ''}`;

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader title={title} />
      {isPending ? (
        <CardContent>
          <WidgetLoading rows={4} />
        </CardContent>
      ) : isError ? (
        error.code === 'not_built' ? (
          <Nothing />
        ) : (
          <CardContent>
            <WidgetError error={error} onRetry={() => void refetch()} />
          </CardContent>
        )
      ) : live.length === 0 ? (
        <Nothing />
      ) : (
        <>
          <List disablePadding sx={{ flex: 1 }}>
            {live.map((n) => (
              <ListItemButton key={n.id} component={NextLink} href={href(n.id)} sx={{ gap: 1.5, px: 3, alignItems: 'flex-start' }} divider>
                <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', flexShrink: 0, width: 32, height: 32, mt: 0.25, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints[CATEGORY[n.category].tone], color: theme.onTint[CATEGORY[n.category].tone] })}>
                  {CATEGORY[n.category].icon}
                </Box>
                <Stack sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    {n.pinned ? <Pin size={13} aria-label="Pinned" /> : null}
                    <Typography variant="subtitle2" noWrap>
                      {n.title}
                    </Typography>
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {n.audience.map((a) => a.label).join(', ')} · {formatRelativeTime(n.published_at ?? n.created_at)}
                  </Typography>
                </Stack>
              </ListItemButton>
            ))}
          </List>
          <CardActions>
            <Button component={NextLink} href={href()} size="small" endIcon={<ArrowRight size={14} />}>
              All announcements
            </Button>
          </CardActions>
        </>
      )}
    </Card>
  );
}
