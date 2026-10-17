'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ClassBadge } from '@/components/ui/class-structure';
import { EmptyState } from '@/components/ui/empty-state';
import { Avatar } from '@/components/ui/row';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMySubjects } from '@/hooks/query/use-my-subjects';
import { useReach } from '@/hooks/query/use-reach';
import { paths } from '@/paths';
import type { MySubject } from '@/types/teaching';

// "Class 6 · Section A", or the class alone when it is taught as one group.
const sectionTitle = (s: MySubject): string => (s.label === s.class_name ? s.class_name : `${s.class_name} · Section ${s.label.slice(s.class_name.replace('Class ', '').length)}`);

const GRID = { display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } } as const;

function SubjectCard({ subject, teaching, personaSlug }: { subject: MySubject; teaching: boolean; personaSlug: string }): React.ReactElement {
  return (
    <Card>
      <CardActionArea component={NextLink} href={paths.personaSection(personaSlug, `subjects/${subject.offering_id}`)} sx={{ p: 2.5, height: 1 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            {teaching ? <ClassBadge size="card">{subject.label}</ClassBadge> : <Avatar name={subject.subject} size={44} />}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h5" component="h3" noWrap>
                {teaching ? sectionTitle(subject) : subject.subject}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {teaching ? `${subject.students} students` : (subject.teacher ?? 'Teacher to be named')}
              </Typography>
            </Box>
            <ArrowRight size={18} aria-hidden />
          </Stack>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            <EmergeChip label={`${subject.periods} periods a week`} tone="grey" />
            {subject.elective ? <EmergeChip label="Elective" tone="violet" /> : null}
            {subject.class_teacher ? <EmergeChip label="Your class" tone="rose" dot /> : null}
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  );
}

// A teacher's subjects grouped by subject, one card per section; a pupil's as one set of cards naming who teaches each.
export function MySubjects({ personaSlug }: { personaSlug: string }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useMySubjects();
  const reach = useReach();
  if (isPending || !reach) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  if (data.length === 0) {
    return (
      <Card>
        <EmptyState title="No subjects this year yet" body={reach.kind === 'teaching' ? 'Once the school office gives you a subject in a section, it appears here.' : 'Your subjects appear here once you are placed in a section.'} />
      </Card>
    );
  }

  if (reach.kind !== 'teaching') {
    return (
      <Box sx={GRID}>
        {data.map((s) => (
          <SubjectCard key={s.offering_id} subject={s} teaching={false} personaSlug={personaSlug} />
        ))}
      </Box>
    );
  }

  const groups = [...new Set(data.map((s) => s.subject))].map((name) => ({ name, rows: data.filter((s) => s.subject === name) }));
  return (
    <Stack spacing={3}>
      {groups.map((g) => (
        <Stack key={g.name} spacing={1.5}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline' }}>
            <Typography variant="h4" component="h2">
              {g.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {g.rows.length} {g.rows.length === 1 ? 'section' : 'sections'} · {g.rows.reduce((t, s) => t + s.periods, 0)} periods a week
            </Typography>
          </Stack>
          <Box sx={GRID}>
            {g.rows.map((s) => (
              <SubjectCard key={s.offering_id} subject={s} teaching personaSlug={personaSlug} />
            ))}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}
