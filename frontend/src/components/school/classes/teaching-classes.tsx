'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, BookOpen, ClipboardCheck } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ClassCardHead } from '@/components/ui/class-structure';
import { EmptyState } from '@/components/ui/empty-state';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMySubjects } from '@/hooks/query/use-my-subjects';
import { paths } from '@/paths';
import type { MySubject } from '@/types/teaching';

import { sectionHref, type StructureBase } from './structure-mode';

interface TaughtSection {
  section_id: string;
  grade_level_id: string;
  label: string;
  students: number;
  led: boolean;
  subjects: MySubject[];
}

function bySection(subjects: readonly MySubject[]): TaughtSection[] {
  const sections = new Map<string, TaughtSection>();
  for (const s of subjects) {
    const entry = sections.get(s.section_id) ?? { section_id: s.section_id, grade_level_id: s.grade_level_id, label: s.label, students: s.students, led: s.class_teacher, subjects: [] };
    entry.subjects.push(s);
    sections.set(s.section_id, entry);
  }
  return [...sections.values()].sort((a, b) => Number(b.led) - Number(a.led));
}

function SectionCard({ section, base, personaSlug }: { section: TaughtSection; base: StructureBase; personaSlug: string }): React.ReactElement {
  const open = paths.personaSection(personaSlug, sectionHref(base, section.grade_level_id, section.section_id));
  const periods = section.subjects.reduce((t, s) => t + s.periods, 0);
  const className = section.subjects[0]?.class_name ?? section.label;
  const letter = section.label.slice(className.replace('Class ', '').length);
  const name = letter && section.label !== className ? `${className} · Section ${letter}` : className;
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column' }}>
      <Stack spacing={2} sx={{ p: 2.5, flex: 1 }}>
        <Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <ClassCardHead badge={section.label} name={name} summary={`${section.students} students · ${periods} periods a week`} />
          {section.led ? <EmergeChip label="Class teacher" tone="rose" dot /> : null}
        </Stack>
        <Stack spacing={1}>
          <Typography variant="eyebrow" color="text.secondary">
            You teach
          </Typography>
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {section.subjects.map((s) => (
              <ButtonBase
                key={s.offering_id}
                component={NextLink}
                href={paths.personaSection(personaSlug, `${sectionHref(base, s.grade_level_id, s.section_id)}/subjects/${s.offering_id}`)}
                sx={(theme) => ({ gap: 1, px: 1.25, py: 0.75, borderRadius: `${theme.band.radius.sm}px`, border: `1px solid ${theme.brand.line2}`, bgcolor: theme.brand.surface, '&:hover': { borderColor: theme.brand.accent } })}
              >
                <BookOpen size={14} aria-hidden />
                <Typography component="span" variant="body2" sx={{ fontWeight: 500 }}>
                  {s.subject}
                </Typography>
                <Typography component="span" variant="caption" color="text.secondary">
                  {s.periods}/wk
                </Typography>
              </ButtonBase>
            ))}
          </Stack>
        </Stack>
      </Stack>
      <CardActions sx={{ justifyContent: 'flex-end', gap: 1 }}>
        {section.led ? (
          <Button component={NextLink} href={`${open}?tab=attendance`} size="small" variant="contained" startIcon={<ClipboardCheck size={14} />}>
            Take Register
          </Button>
        ) : null}
        <Button component={NextLink} href={open} size="small" variant="outlined" endIcon={<ArrowRight size={14} />}>
          Open {section.label}
        </Button>
      </CardActions>
    </Card>
  );
}

// A teacher's door to Classes & Sections: the sections they teach or lead, with the subjects they take in each.
export function TeachingClasses({ base, personaSlug }: { base: StructureBase; personaSlug: string }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useMySubjects();
  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const sections = bySection(data);
  if (sections.length === 0) {
    return (
      <Card>
        <EmptyState title="No classes this year yet" body="Once the school office gives you a subject in a section, it appears here." />
      </Card>
    );
  }
  const led = sections.filter((s) => s.led);

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Sections', value: sections.length, note: led.length > 0 ? `Class teacher of ${led.map((s) => s.label).join(', ')}` : 'Subject teacher in each' },
          { label: 'Subjects', value: data.length, note: `${new Set(data.map((s) => s.subject)).size} different` },
          { label: 'Periods a week', value: data.reduce((t, s) => t + s.periods, 0), note: 'Across your timetable' },
          { label: 'Students', value: sections.reduce((t, s) => t + s.students, 0).toLocaleString('en-IN'), note: 'In the sections you teach' },
        ]}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
        {sections.map((section) => (
          <SectionCard key={section.section_id} section={section} base={base} personaSlug={personaSlug} />
        ))}
      </Box>
    </Stack>
  );
}
