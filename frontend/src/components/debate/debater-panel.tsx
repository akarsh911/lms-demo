'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { EmergeChip } from '@/components/ui/chip';
import type { DebatePosition, DebateTurn } from '@/types/debate';

import { DebaterAvatar } from './debater-avatar';

export interface DebaterView {
  kind: 'student' | 'ai';
  name: string;
  side: DebatePosition;
  level: number;
  active: boolean;
  status?: string;
  turns: readonly DebateTurn[];
  liveText?: string;
  controls?: React.ReactNode;
}

const SIDE: Record<DebatePosition, string> = { FOR: 'For the motion', AGAINST: 'Against the motion' };

export function DebaterPanel({ view, order }: { view: DebaterView; order: number }): React.ReactElement {
  const theme = useTheme();
  const [history, setHistory] = React.useState(false);
  const spoken = view.turns.filter((t) => t.status !== 'open' && t.text.trim());
  const latest = view.liveText ?? spoken[spoken.length - 1]?.text ?? '';
  const earlier = view.liveText === undefined ? spoken.slice(0, -1) : spoken;
  const hue = view.kind === 'student' ? theme.hues.green : theme.hues.violet;
  const tone = view.kind === 'student' ? 'green' : 'violet';

  return (
    <Card
      component="section"
      aria-label={view.name}
      sx={{
        order: { xs: order, md: 0 },
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        borderColor: view.active ? hue : undefined,
        transition: 'border-color 200ms',
      }}
    >
      <CardHeader
        avatar={<DebaterAvatar kind={view.kind} name={view.name} level={view.level} active={view.active} />}
        title={view.name}
        subheader={SIDE[view.side]}
        action={view.status ? <EmergeChip label={view.status} tone={view.active ? tone : 'grey'} dot={view.active} /> : undefined}
      />
      <CardContent sx={{ flex: 1, minHeight: { xs: 96, md: 150 }, maxHeight: { md: 240 }, overflowY: 'auto' }}>
        <Typography variant="body1" color={latest ? 'text.primary' : 'text.secondary'} aria-live="polite">
          {latest || '—'}
        </Typography>
        {earlier.length > 0 ? (
          <>
            <Button size="small" color="inherit" onClick={() => setHistory((h) => !h)} aria-expanded={history} sx={{ mt: 1.5, ml: -1 }}>
              {history ? 'Hide earlier' : `Earlier (${earlier.length})`}
            </Button>
            <Collapse in={history} unmountOnExit>
              <List disablePadding dense>
                {earlier.map((t, index) => (
                  <ListItem key={t.index} disableGutters divider={index < earlier.length - 1}>
                    <ListItemText
                      primary={`Turn ${t.index + 1}`}
                      secondary={t.text}
                      slotProps={{ primary: { variant: 'subtitle2' }, secondary: { variant: 'body2' } }}
                    />
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </>
        ) : null}
      </CardContent>
      {view.controls ? <CardActions sx={{ display: 'block' }}>{view.controls}</CardActions> : null}
    </Card>
  );
}
