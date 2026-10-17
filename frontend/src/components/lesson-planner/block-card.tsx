'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ArrowDown, ArrowUp, BookOpen, Minus, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import NextLink from 'next/link';

import { EmergeChip } from '@/components/ui/chip';
import { RowMenu } from '@/components/ui/row-menu';
import { pageRangeLabel } from '@/lib/mindmap/deep-link';
import type { LessonBlock } from '@/types/lesson-planner';

import { BLOCK_KIND_META, MAX_BLOCK_MINUTES, MIN_BLOCK_MINUTES } from './block-kinds';
import { CARD_PAD, INNER_GAP } from './spacing';
import type { ResourceResolver } from './use-resource-links';

export interface BlockActions {
  onMove: (step: -1 | 1) => void;
  onDelete: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onMinutes: (minutes: number) => void;
}

function Tool({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }): React.ReactElement {
  return (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" aria-label={label} onClick={onClick} disabled={disabled}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function BlockCard({
  block,
  position,
  count,
  regenerating,
  resolve,
  actions,
}: {
  block: LessonBlock;
  position: number;
  count: number;
  regenerating: boolean;
  resolve: ResourceResolver;
  actions: BlockActions | null;
}): React.ReactElement {
  const theme = useTheme();
  const meta = BLOCK_KIND_META[block.kind];
  const links = block.resources.flatMap((resource) => resolve(resource) ?? []);

  return (
    <Paper
      variant="outlined"
      aria-busy={regenerating}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderColor: theme.brand.line,
        borderRadius: `${theme.band.radius.md}px`,
        boxShadow: `inset 4px 0 0 ${theme.onTint[meta.tone]}`,
        transition: theme.transitions.create('opacity'),
        opacity: regenerating ? 0.55 : 1,
      }}
    >
      {regenerating ? <LinearProgress sx={{ position: 'absolute', insetInline: 0, top: 0 }} aria-label="Regenerating this block" /> : null}
      <Stack spacing={INNER_GAP} sx={{ p: CARD_PAD }}>
        <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: INNER_GAP }}>
          <EmergeChip label={meta.label} tone={meta.tone} icon={<meta.Icon size={14} />} />
          <Typography variant="subtitle1" component="h4" sx={{ fontWeight: 700, flex: '1 1 200px', minWidth: 0 }}>
            {block.title}
          </Typography>
          <Stack direction="row" sx={{ alignItems: 'center' }} role="group" aria-label={`Duration of ${meta.label.toLowerCase()}`}>
            {actions ? (
              <Tool label="One minute shorter" onClick={() => actions.onMinutes(block.minutes - 1)} disabled={block.minutes <= MIN_BLOCK_MINUTES}>
                <Minus size={14} />
              </Tool>
            ) : null}
            <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 52, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {block.minutes} min
            </Typography>
            {actions ? (
              <Tool label="One minute longer" onClick={() => actions.onMinutes(block.minutes + 1)} disabled={block.minutes >= MAX_BLOCK_MINUTES}>
                <Plus size={14} />
              </Tool>
            ) : null}
          </Stack>
          {actions ? (
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
              <Button size="small" startIcon={<Pencil size={14} />} onClick={actions.onEdit} disabled={regenerating} aria-label={`Edit ${block.title}`}>
                Edit
              </Button>
              <RowMenu
                label={`More actions for ${block.title}`}
                actions={[
                  { label: 'Regenerate', icon: <RefreshCw size={16} />, onSelect: actions.onRegenerate, disabled: regenerating },
                  { label: 'Move up', icon: <ArrowUp size={16} />, onSelect: () => actions.onMove(-1), disabled: position === 0 },
                  { label: 'Move down', icon: <ArrowDown size={16} />, onSelect: () => actions.onMove(1), disabled: position === count - 1 },
                  { label: 'Delete', icon: <Trash2 size={16} />, onSelect: actions.onDelete, destructive: true },
                ]}
              />
            </Stack>
          ) : null}
        </Stack>

        <Typography variant="body2">{block.summary}</Typography>

        {block.steps.length > 0 ? (
          <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'grid', gap: 0.5 }}>
            {block.steps.map((step, i) => (
              <Typography key={i} component="li" variant="body2" color="text.secondary">
                {step}
              </Typography>
            ))}
          </Box>
        ) : null}

        {block.citations.length > 0 || links.length > 0 ? (
          <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: INNER_GAP }}>
            {block.citations.map((citation) => (
              <Stack key={`${citation.content_item_id}-${citation.page_start}`} direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                <BookOpen size={14} aria-hidden />
                <Typography variant="caption">
                  {citation.title} · {pageRangeLabel({ from: citation.page_start, to: citation.page_end })}
                </Typography>
              </Stack>
            ))}
            {links.map((link) => (
              <Button key={link.key} component={NextLink} href={link.href} size="small" variant="outlined" startIcon={<link.Icon size={14} />} sx={{ minHeight: 30 }}>
                {link.label}
              </Button>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  );
}
