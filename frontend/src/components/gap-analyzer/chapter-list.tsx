'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';

import { percent } from '@/lib/gap-analyzer/model';
import type { ChapterAnalysis } from '@/types/gap-analyzer';

import { StatusChip } from './status-chip';
import { TrendSparkline } from './trend-sparkline';

export function ChapterList({ chapters, selectedTopic, onSelect }: { chapters: readonly ChapterAnalysis[]; selectedTopic: string | null; onSelect: (topicId: string) => void }): React.ReactElement {
  return (
    <List disablePadding sx={{ px: 1 }}>
      {chapters.map((chapter) => (
        <li key={chapter.chapter_id}>
          <List disablePadding aria-label={chapter.title}>
            <ListSubheader sx={(theme) => ({ px: 1, lineHeight: 2.5, bgcolor: theme.brand.surface, display: 'flex', justifyContent: 'space-between', gap: 1 })}>
              <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chapter.sequence}. {chapter.title}
              </Box>
              <span>{chapter.coverage === 'not_taught' ? 'Untaught' : percent(chapter.score)}</span>
            </ListSubheader>
            {chapter.topics.map((topic) => {
              const selected = topic.topic_id === selectedTopic;
              return (
                <ListItemButton key={topic.topic_id} selected={selected} aria-current={selected ? 'true' : undefined} onClick={() => onSelect(topic.topic_id)} sx={{ borderRadius: 2, gap: 1.5, px: 1 }}>
                  <ListItemText
                    primary={topic.title}
                    secondary={topic.score === null ? 'No records' : percent(topic.score)}
                    slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'body2' } }}
                    sx={{ my: 0, minWidth: 0 }}
                  />
                  <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
                    <TrendSparkline points={topic.trend_points} trend={topic.trend} status={topic.status} width={64} height={24} />
                  </Box>
                  <StatusChip status={topic.status} />
                </ListItemButton>
              );
            })}
          </List>
        </li>
      ))}
    </List>
  );
}
