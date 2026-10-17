import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Pin } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { formatMoment } from '@/lib/dates';
import type { NoticeCategory } from '@/types/notices';

import { CATEGORY } from './notice-meta';

// The announcement as a student or parent will see it in their feed.
export function NoticePreview({
  title,
  body,
  category,
  pinned,
  acknowledge,
  when,
}: {
  title: string;
  body: string;
  category: NoticeCategory;
  pinned: boolean;
  acknowledge: boolean;
  when: string | null;
}): React.ReactElement {
  const meta = CATEGORY[category];
  return (
    <Stack spacing={1.5} sx={{ p: 2.5 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints[meta.tone], color: theme.onTint[meta.tone] })}>
          {meta.icon}
        </Box>
        <Stack sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>
            {title.trim() || 'Your title'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {when ? formatMoment(when) : 'Just now'}
          </Typography>
        </Stack>
        {pinned ? <Pin size={16} aria-label="Pinned" /> : null}
      </Stack>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: body.trim() ? 'text.primary' : 'text.secondary', overflowWrap: 'anywhere' }}>
        {body.trim() || 'The message appears here as you write it.'}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <EmergeChip label={meta.label} tone={meta.tone} />
        {acknowledge ? <EmergeChip label="Tap to acknowledge" tone="amber" dot /> : null}
      </Stack>
    </Stack>
  );
}
