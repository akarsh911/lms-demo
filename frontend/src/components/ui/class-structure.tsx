'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

import { EmergeChip } from '@/components/ui/chip';
import { Avatar } from '@/components/ui/row';

const BADGE = {
  card: { size: 48, variant: 'h3' },
  row: { size: 34, variant: 'subtitle1' },
} as const;

export function ClassBadge({ size, children }: { size: keyof typeof BADGE; children: React.ReactNode }): React.ReactElement {
  const spec = BADGE[size];
  return (
    <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', minWidth: spec.size, height: spec.size, flexShrink: 0, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints.rose, color: theme.onTint.rose })}>
      <Typography variant={spec.variant} component="span" sx={{ color: 'inherit' }}>
        {children}
      </Typography>
    </Box>
  );
}

export function ClassCardHead({ badge, name, summary }: { badge: React.ReactNode; name: string; summary: React.ReactNode }): React.ReactElement {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <ClassBadge size="card">{badge}</ClassBadge>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="h4" component="h3">
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {summary}
        </Typography>
      </Box>
    </Stack>
  );
}

type TileTarget = { href: string; onClick?: never } | { onClick: () => void; href?: never };

export function SectionTile({ letter, students, teacher, flagged = false, label, ...target }: { letter: string; students: number | null; teacher: string | null; flagged?: boolean; label: string } & TileTarget): React.ReactElement {
  const link = target.href !== undefined ? { component: NextLink, href: target.href } : { onClick: target.onClick };
  return (
    <ButtonBase
      {...link}
      aria-label={label}
      sx={(theme) => ({
        position: 'relative',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 0.25,
        p: 1.25,
        borderRadius: `${theme.band.radius.sm}px`,
        bgcolor: flagged ? theme.tints.amber : theme.brand.subtle,
        border: `1px solid ${flagged ? theme.hues.amber : 'transparent'}`,
        transition: 'transform 120ms ease, border-color 120ms ease',
        '&:hover': { borderColor: theme.brand.ink, transform: 'translateY(-1px)' },
      })}
    >
      <Stack direction="row" sx={{ width: 1, alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Typography variant="h4" component="span" sx={{ lineHeight: 1 }}>
          {letter}
        </Typography>
        {students === null ? null : (
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {students}
          </Typography>
        )}
      </Stack>
      <Typography variant="caption" color={teacher ? 'text.secondary' : 'warning.dark'} noWrap sx={{ maxWidth: 1, fontSize: 11 }}>
        {teacher ? teacher.split(' ')[0] : '—'}
      </Typography>
    </ButtonBase>
  );
}

export function TeacherCell({ name }: { name: string | null }): React.ReactElement {
  if (!name) return <EmergeChip label="None" tone="amber" dot />;
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
      <Avatar name={name} size={28} />
      <Typography variant="body2" noWrap>
        {name}
      </Typography>
    </Stack>
  );
}

export function StructureHeader({ title, chip, summary, action, level = 'h1' }: { title: string; chip?: React.ReactNode; summary: React.ReactNode; action?: React.ReactNode; level?: 'h1' | 'h2' }): React.ReactElement {
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
      <div>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="h2" component={level}>
            {title}
          </Typography>
          {chip}
        </Stack>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
          {summary}
        </Typography>
      </div>
      {action}
    </Stack>
  );
}
