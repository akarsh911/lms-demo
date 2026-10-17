'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, CheckCircle2, CircleAlert } from 'lucide-react';

import { ClassCardHead, SectionTile } from '@/components/ui/class-structure';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useYearStructure } from '@/hooks/query/use-structure';
import { paths } from '@/paths';
import type { StructureClass } from '@/types/structure';

import { classHref, sectionHref, type StructureBase } from './structure-mode';

const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

function ClassCard({ row, base, personaSlug }: { row: StructureClass; base: StructureBase; personaSlug: string }): React.ReactElement {
  const flagged = new Set(row.issues.map((issue) => issue.section_id).filter(Boolean));
  const number = row.name.replace(/^Class\s+/, '');
  const open = paths.personaSection(personaSlug, classHref(base, row.grade_level_id));
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', p: 2.5, gap: 2 }}>
      <ClassCardHead badge={number} name={row.name} summary={`${plural(row.students, 'student')} · ${row.undivided ? (row.whole ? 'taught as one class' : 'not set up yet') : plural(row.sections.length, 'section')}`} />

      {row.undivided && !row.whole ? (
        <Typography variant="body2" color="text.secondary" sx={(theme) => ({ p: 1.5, borderRadius: `${theme.band.radius.sm}px`, border: `1px dashed ${theme.brand.line2}` })}>
          Open it to keep it as one class or divide it into sections.
        </Typography>
      ) : row.undivided ? (
        <ButtonBase component={NextLink} href={open} sx={(theme) => ({ justifyContent: 'flex-start', gap: 2, p: 1.5, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.brand.subtle, '&:hover': { outline: `1px solid ${theme.brand.ink}` } })}>
          <Stack sx={{ alignItems: 'flex-start' }}>
            <Typography variant="caption" color="text.secondary">
              Class teacher
            </Typography>
            <Typography variant="subtitle2">{row.whole?.class_teacher?.name ?? 'Not chosen'}</Typography>
          </Stack>
          <Stack sx={{ alignItems: 'flex-start' }}>
            <Typography variant="caption" color="text.secondary">
              Room
            </Typography>
            <Typography variant="subtitle2">{row.whole?.room?.name ?? 'Not chosen'}</Typography>
          </Stack>
        </ButtonBase>
      ) : (
        <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
          {row.sections.map((section) => (
            <SectionTile key={section.id} href={paths.personaSection(personaSlug, sectionHref(base, row.grade_level_id, section.id))} label={`Open section ${section.name}`} letter={section.name} students={section.students} teacher={section.class_teacher?.name ?? null} flagged={flagged.has(section.id)} />
          ))}
        </Box>
      )}

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 'auto', pt: 0.5 }}>
        {row.issues.length > 0 ? <CircleAlert size={16} color="currentColor" style={{ flexShrink: 0 }} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
        <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, color: row.issues.length > 0 ? 'warning.dark' : 'success.main', fontWeight: 600 }}>
          {row.issues.length > 0 ? `${row.issues[0]?.title ?? ''}${row.issues.length > 1 ? ` · +${row.issues.length - 1} more` : ''}` : 'Everything in place'}
        </Typography>
        <Button component={NextLink} href={open} size="small" variant="outlined" endIcon={<ArrowRight size={14} />} sx={{ flexShrink: 0 }}>
          Open {row.name}
        </Button>
      </Stack>
    </Card>
  );
}

// Every class of one year as a card: its sections, who is still unplaced, and how ready it is. The year tab, the year's setup and the sidebar all draw this.
export function ClassesStructure({ yearId, base, personaSlug }: { yearId: string; base: StructureBase; personaSlug: string }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useYearStructure(yearId);

  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const sections = data.classes.reduce((t, c) => t + c.sections.length, 0);
  const unassigned = data.classes.reduce((t, c) => t + c.unassigned, 0);
  const issues = data.classes.reduce((t, c) => t + c.issues.length, 0);

  if (data.classes.length === 0) {
    return (
      <Card>
        <EmptyState title="No classes in this year yet" body={data.lifecycle === 'draft' ? 'Bring the structure forward in the year’s setup, or add sections class by class.' : 'This year has no classes on record.'} />
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Classes', value: data.classes.length, note: `${sections} sections` },
          { label: 'Students', value: data.classes.reduce((t, c) => t + c.students, 0).toLocaleString('en-IN'), note: 'Enrolled and active' },
          { label: 'Unassigned', value: unassigned, note: unassigned > 0 ? 'Need a section' : data.classes.some((c) => c.students > 0) ? 'Everyone placed' : 'No students yet' },
          { label: 'Needs attention', value: issues, note: issues > 0 ? 'Across the classes below' : 'Nothing open' },
        ]}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
        {data.classes.map((row) => (
          <ClassCard key={row.grade_level_id} row={row} base={base} personaSlug={personaSlug} />
        ))}
      </Box>
      {/* What a timetable will need from this structure; the timetable itself is built elsewhere. */}
      <Card>
        <CardHeader title="Ready for the timetable" subheader="What a timetable for this year will need" />
        <CardContent>
          <FactStrip
            facts={[
              { label: 'Sections with subjects', value: `${data.timetable.subjects_configured.value} / ${data.timetable.subjects_configured.total}` },
              { label: 'Subjects with periods', value: `${data.timetable.periods_set.value} / ${data.timetable.periods_set.total}` },
              { label: 'Subjects with a teacher', value: `${data.timetable.teachers_assigned.value} / ${data.timetable.teachers_assigned.total}` },
              { label: 'Sections with a room', value: `${data.timetable.rooms_assigned.value} / ${data.timetable.rooms_assigned.total}` },
            ]}
          />
        </CardContent>
      </Card>
    </Stack>
  );
}
