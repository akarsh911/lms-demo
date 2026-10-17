'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { ArrowDown, ArrowUp, GripVertical, Minus, Plus } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { formatShortDate } from '@/lib/dates';
import type { ResolvedChapter, TermPlanView } from '@/lib/lesson-planner/term';

import { INNER_GAP } from './spacing';
import { chapterColours } from './term-palette';

const MIN_WEIGHT = 1;
const MAX_WEIGHT = 30;

export interface ChapterActions {
  onMove: (chapterId: string, toIndex: number) => void;
  onWeight: (chapterId: string, weight: number) => void;
}

function spans(view: TermPlanView): Map<string, { from: string; to: string }> {
  const found = new Map<string, { from: string; to: string }>();
  const periods = [...view.baseline.periods.filter((p) => p.date < view.from), ...view.forward.periods];
  for (const p of periods) {
    if (p.use.kind !== 'chapter') continue;
    const current = found.get(p.use.chapterId);
    found.set(p.use.chapterId, { from: current?.from ?? p.date, to: p.date });
  }
  return found;
}

function ChapterRow({
  chapter,
  index,
  count,
  span,
  unplaced,
  dragging,
  actions,
  drag,
}: {
  chapter: ResolvedChapter;
  index: number;
  count: number;
  span: { from: string; to: string } | undefined;
  unplaced: number;
  dragging: boolean;
  actions: ChapterActions;
  drag: { onStart: () => void; onEnter: () => void; onEnd: () => void };
}): React.ReactElement {
  const theme = useTheme();
  const { bg, fg } = chapterColours(theme, chapter.sequence);
  return (
    <Stack
      component="li"
      direction="row"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        drag.onStart();
      }}
      onDragEnter={drag.onEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={drag.onEnd}
      onDrop={(event) => event.preventDefault()}
      sx={{
        listStyle: 'none',
        alignItems: 'center',
        gap: 1,
        p: INNER_GAP,
        borderRadius: 1,
        border: `1px solid ${dragging ? fg : theme.brand.line}`,
        borderLeft: `5px solid ${fg}`,
        bgcolor: dragging ? bg : theme.brand.surface,
        cursor: 'grab',
      }}
    >
      <GripVertical size={16} aria-hidden color={theme.brand.tert} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {chapter.sequence}. {chapter.title}
        </Typography>
        <Stack direction="row" spacing={INNER_GAP} sx={{ alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            {span ? `${formatShortDate(span.from)} to ${formatShortDate(span.to)}` : chapter.remaining === 0 ? 'Done, 0 remaining' : 'Unplaced'}
          </Typography>
          {chapter.taught > 0 ? <EmergeChip tone="green" label={`${chapter.taught} taught`} /> : null}
          {unplaced > 0 ? <EmergeChip tone="red" label={`${unplaced} won't fit`} /> : null}
        </Stack>
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center' }} role="group" aria-label={`Periods for ${chapter.title}`}>
        <IconButton size="small" aria-label={`One period fewer for ${chapter.title}`} disabled={chapter.weight <= MIN_WEIGHT} onClick={() => actions.onWeight(chapter.id, chapter.weight - 1)}>
          <Minus size={14} />
        </IconButton>
        <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 22, textAlign: 'center' }}>
          {chapter.weight}
        </Typography>
        <IconButton size="small" aria-label={`One period more for ${chapter.title}`} disabled={chapter.weight >= MAX_WEIGHT} onClick={() => actions.onWeight(chapter.id, chapter.weight + 1)}>
          <Plus size={14} />
        </IconButton>
      </Stack>
      <Stack direction="row">
        <Tooltip title="Teach earlier">
          <span>
            <IconButton size="small" aria-label={`Teach ${chapter.title} earlier`} disabled={index === 0} onClick={() => actions.onMove(chapter.id, index - 1)}>
              <ArrowUp size={14} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Teach later">
          <span>
            <IconButton size="small" aria-label={`Teach ${chapter.title} later`} disabled={index === count - 1} onClick={() => actions.onMove(chapter.id, index + 1)}>
              <ArrowDown size={14} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
    </Stack>
  );
}

export function TermChapters({ view, actions }: { view: TermPlanView; actions: ChapterActions }): React.ReactElement {
  const [dragged, setDragged] = React.useState<string | null>(null);
  const placed = React.useMemo(() => spans(view), [view]);

  if (view.chapters.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No chapters left this term.
      </Typography>
    );
  }

  return (
    <Stack component="ol" spacing={INNER_GAP} sx={{ m: 0, p: 0 }} aria-label="Chapters in teaching order. Drag to reorder, or use the arrows.">
      {view.chapters.map((chapter, index) => (
        <ChapterRow
          key={chapter.id}
          chapter={chapter}
          index={index}
          count={view.chapters.length}
          span={placed.get(chapter.id)}
          unplaced={view.forward.unplaced[chapter.id] ?? 0}
          dragging={dragged === chapter.id}
          actions={actions}
          drag={{
            onStart: () => setDragged(chapter.id),
            onEnter: () => {
              if (dragged && dragged !== chapter.id) actions.onMove(dragged, index);
            },
            onEnd: () => setDragged(null),
          }}
        />
      ))}
    </Stack>
  );
}
