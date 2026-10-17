'use client';

import * as React from 'react';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { BookOpen } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { WidgetError } from '@/components/widgets/widget-states';
import { useLessonOutline } from '@/hooks/query/use-lesson-planner';
import { pageRangeLabel } from '@/lib/mindmap/deep-link';
import type { PlannerChapter } from '@/types/lesson-planner';

import { INNER_GAP } from './spacing';
import type { ResourceResolver } from './use-resource-links';

export function ChapterSelect({
  curriculumId,
  chapterId,
  onChapter,
}: {
  curriculumId: string | null;
  chapterId: string | null;
  onChapter: (chapter: PlannerChapter) => void;
}): React.ReactElement {
  const outline = useLessonOutline(curriculumId);
  if (curriculumId && outline.isPending) return <Skeleton variant="rounded" width={260} height={40} />;
  if (outline.isError) return <WidgetError error={outline.error} onRetry={() => void outline.refetch()} />;
  const chapters = outline.data?.chapters ?? [];
  return (
    <TextField
      select
      size="small"
      label="Chapter"
      value={chapters.some((c) => c.id === chapterId) ? (chapterId ?? '') : ''}
      disabled={chapters.length === 0}
      onChange={(event) => {
        const next = chapters.find((candidate) => candidate.id === event.target.value);
        if (next) onChapter(next);
      }}
      sx={{ width: { xs: '100%', sm: 280 } }}
    >
      {chapters.map((candidate) => (
        <MenuItem key={candidate.id} value={candidate.id}>
          {candidate.sequence}. {candidate.title}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function TopicFocus({
  chapter,
  topicIds,
  focusTitles,
  onChange,
}: {
  chapter: PlannerChapter;
  topicIds: readonly string[];
  focusTitles: readonly string[];
  onChange: (topicIds: string[], focusTitles: string[]) => void;
}): React.ReactElement {
  const onTopics = (ids: string[]): void => onChange(ids, [...focusTitles]);
  return (
    <Stack direction="row" role="group" aria-label={`Topics of ${chapter.title}`} sx={{ flexWrap: 'wrap', gap: INNER_GAP }}>
      {focusTitles.map((title) => (
        <Chip
          key={title}
          size="small"
          label={title}
          color="primary"
          aria-pressed
          onDelete={() => onChange([...topicIds], focusTitles.filter((other) => other !== title))}
        />
      ))}
      {chapter.topics.map((topic) => {
        const on = topicIds.includes(topic.id);
        return (
          <Chip
            key={topic.id}
            size="small"
            label={topic.title}
            color={on ? 'primary' : 'default'}
            variant={on ? 'filled' : 'outlined'}
            aria-pressed={on}
            onClick={() => onTopics(on ? topicIds.filter((id) => id !== topic.id) : chapter.topics.filter((t) => t.id === topic.id || topicIds.includes(t.id)).map((t) => t.id))}
          />
        );
      })}
    </Stack>
  );
}

export function ChapterExtras({ chapter, resolve }: { chapter: PlannerChapter; resolve: ResourceResolver }): React.ReactElement {
  const links = chapter.resources.flatMap((resource) => resolve(resource) ?? []);
  const groups = [...links.reduce((found, link) => {
    const name = link.label.split(' · ')[0] ?? link.label;
    const current = found.get(name);
    found.set(name, { name, Icon: link.Icon, labels: [...(current?.labels ?? []), link.label] });
    return found;
  }, new Map<string, { name: string; Icon: (typeof links)[number]['Icon']; labels: string[] }>()).values()];
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: INNER_GAP }}>
      {chapter.citations.map((citation) => (
        <EmergeChip key={citation.content_item_id} tone="grey" icon={<BookOpen size={13} />} label={`${citation.title}, ${pageRangeLabel({ from: citation.page_start, to: citation.page_end }).toLowerCase()}`} />
      ))}
      {groups.map((group) => (
        <Tooltip key={group.name} title={group.labels.join(', ')}>
          <span>
            <EmergeChip tone="violet" icon={<group.Icon size={13} />} label={group.labels.length > 1 ? `${group.name} ×${group.labels.length}` : group.name} />
          </span>
        </Tooltip>
      ))}
    </Stack>
  );
}
