'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

import { EmergeChip } from '@/components/ui/chip';
import { ClassBadge } from '@/components/ui/class-structure';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMySubjects } from '@/hooks/query/use-my-subjects';
import { paths } from '@/paths';

// The sections a teacher teaches, the one they lead first, each opening to the section.
export function MyClassesCard({ title, personaSlug }: { title: string; personaSlug: string }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useMySubjects();

  const sections = [...new Map((data ?? []).map((s) => [s.section_id, s])).values()]
    .map((s) => ({ ...s, subjects: (data ?? []).filter((x) => x.section_id === s.section_id).map((x) => x.subject) }))
    .sort((a, b) => Number(b.class_teacher) - Number(a.class_teacher));

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader title={title} subheader={sections.length > 0 ? `${sections.length} sections this year` : undefined} />
      {isPending ? (
        <Box sx={{ px: 3, pb: 3 }}>
          <WidgetLoading rows={4} />
        </Box>
      ) : isError ? (
        <Box sx={{ px: 3, pb: 3 }}>
          <WidgetError error={error} onRetry={() => void refetch()} />
        </Box>
      ) : sections.length === 0 ? (
        <Box sx={{ px: 3, pb: 3 }}>
          <WidgetEmpty message="No classes this year yet." />
        </Box>
      ) : (
        <List disablePadding sx={{ flex: 1 }}>
          {sections.map((s) => (
            <ListItemButton key={s.section_id} component={NextLink} href={paths.personaSection(personaSlug, `sections/${s.grade_level_id}/${s.section_id}`)} divider sx={{ gap: 1.5, px: 3, py: 1.25 }}>
              <ClassBadge size="row">{s.label}</ClassBadge>
              <Stack sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle2" noWrap>
                  {s.subjects.join(', ')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {s.students} students
                </Typography>
              </Stack>
              {s.class_teacher ? <EmergeChip label="Class teacher" tone="rose" dot /> : null}
            </ListItemButton>
          ))}
        </List>
      )}
      <Box sx={{ px: 3, py: 1.5 }}>
        <Button component={NextLink} href={paths.personaSection(personaSlug, 'subjects')} size="small" variant="outlined">
          My Subjects
        </Button>
      </Box>
    </Card>
  );
}
