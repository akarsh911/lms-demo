'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Clock, Plus } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { clockOf, formatShortDate } from '@/lib/dates';
import { LESSON_BLOCK_KINDS, type LessonBlockKind, type LessonPeriod } from '@/types/lesson-planner';

import { BLOCK_KIND_META } from './block-kinds';
import { minutesOf } from './plan-edits';
import { CARD_PAD, INNER_GAP } from './spacing';

function MinutesChip({ used, available }: { used: number; available: number }): React.ReactElement {
  const tone = used === available ? 'green' : used > available ? 'amber' : 'grey';
  return <EmergeChip tone={tone} icon={<Clock size={13} />} label={`${used}/${available} min`} />;
}

export function PeriodCard({
  period,
  periodMinutes,
  adding,
  onAdd,
  extras,
  children,
}: {
  period: LessonPeriod;
  periodMinutes: number;
  adding: boolean;
  onAdd: ((kind: LessonBlockKind) => void) | null;
  extras?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const menuId = `add-block-${period.id}`;

  return (
    <Card component="section" aria-labelledby={`period-${period.id}`}>
      <CardHeader
        title={<span id={`period-${period.id}`}>{period.focus}</span>}
        subheader={period.slot ? `Period ${period.sequence} · ${formatShortDate(period.slot.date)}, ${period.slot.period_name} at ${clockOf(period.slot.start_minute)}` : `Period ${period.sequence}`}
        action={
          <>
            {period.taught ? <EmergeChip tone="green" dot label="Taught" /> : null}
            <MinutesChip used={minutesOf(period)} available={periodMinutes} />
          </>
        }
      />
      <CardContent>
        <Stack spacing={CARD_PAD}>
          {extras}
          <Stack spacing={INNER_GAP}>{children}</Stack>
          {period.blocks.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No blocks
            </Typography>
          ) : null}
        </Stack>
      </CardContent>
      {onAdd ? (
        <CardActions>
          <Button
            size="small"
            startIcon={<Plus size={16} />}
            loading={adding}
            aria-haspopup="menu"
            aria-controls={anchor ? menuId : undefined}
            aria-expanded={anchor ? 'true' : undefined}
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            Add block
          </Button>
          <Menu id={menuId} anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
            {LESSON_BLOCK_KINDS.map((kind) => {
              const meta = BLOCK_KIND_META[kind];
              return (
                <MenuItem
                  key={kind}
                  onClick={() => {
                    setAnchor(null);
                    onAdd(kind);
                  }}
                >
                  <meta.Icon size={16} style={{ marginRight: 10 }} aria-hidden />
                  {meta.label}
                </MenuItem>
              );
            })}
          </Menu>
        </CardActions>
      ) : null}
    </Card>
  );
}
