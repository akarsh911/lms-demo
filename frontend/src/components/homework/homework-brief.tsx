import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link2, Paperclip } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { formatMoment } from '@/lib/dates';
import type { HomeworkDetail } from '@/types/homework';

import { TYPE } from './homework-meta';

// What the students were given: the task, how to hand it in, the files, and the rules it runs by.
export function HomeworkBrief({ homework }: { homework: HomeworkDetail }): React.ReactElement {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'start' }}>
      <Card>
        <CardHeader title="The task" subheader="As students see it" />
        <CardContent>
          <Stack spacing={2.5}>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
              {homework.description || 'No description was given.'}
            </Typography>
            {homework.instructions ? (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2">How to hand it in</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                  {homework.instructions}
                </Typography>
              </Stack>
            ) : null}
            <Stack spacing={1}>
              <Typography variant="subtitle2">Attachments</Typography>
              {homework.attachments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  None
                </Typography>
              ) : (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {homework.attachments.map((a) => (
                    <Chip key={a.name} icon={a.kind === 'link' ? <Link2 size={14} /> : <Paperclip size={14} />} label={a.name} variant="outlined" />
                  ))}
                </Stack>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Rules" />
        <CardContent>
          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 3, rowGap: 2.5, m: 0 }}>
            <Field label="Kind">{TYPE[homework.type].label}</Field>
            <Field label="Maximum marks">{homework.max_marks}</Field>
            <Field label="Opens">{formatMoment(homework.available_from)}</Field>
            <Field label="Due">{formatMoment(homework.due_at)}</Field>
            <Field label="Late work">{homework.late_allowed ? 'Accepted, marked late' : 'Not accepted'}</Field>
            <Field label="For">{homework.students_only === null ? `All of ${homework.section}` : `${homework.students_only} chosen students`}</Field>
          </Box>
          {homework.items.length > 0 ? (
            <Stack spacing={0.75} sx={{ mt: 3 }}>
              <Typography variant="eyebrow" color="text.secondary">
                Questions
              </Typography>
              {homework.items.map((i) => (
                <Stack key={i.position} direction="row" sx={{ justifyContent: 'space-between' }}>
                  <Typography variant="body2">{i.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {i.marks} marks
                  </Typography>
                </Stack>
              ))}
            </Stack>
          ) : null}
        </CardContent>
      </Card>
    </Box>
  );
}
