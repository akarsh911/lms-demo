'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { alpha, type Theme } from '@mui/material/styles';
import { ArrowLeft } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useGradeGaps } from '@/hooks/query/use-gap-analyzer';
import { CLASS_WIDE_SHARE, percent } from '@/lib/gap-analyzer/model';
import type { SchoolAnalysis, ScopeSection } from '@/types/gap-analyzer';

import { ClassView } from './class-view';
import type { GapLinks } from './use-gap-links';

const DARK_FROM = 0.55;

function shareFill(theme: Theme, share: number | null): Record<string, string> {
  if (share === null) return { color: theme.palette.text.disabled };
  return { backgroundColor: alpha(theme.hues.red, Math.max(0.04, share)), color: share >= DARK_FROM ? theme.palette.common.white : theme.onTint.red };
}

const scopeOf = (analysis: SchoolAnalysis, sectionId: string): ScopeSection | undefined => {
  const row = analysis.sections.find((section) => section.section_id === sectionId);
  if (!row) return undefined;
  return { section_id: row.section_id, label: row.label, grade: analysis.grade, subjects: analysis.subjects.map((subject) => ({ code: subject.code, name: subject.name, mine: false, offering_id: '' })), learners_with_evidence: row.learners };
};

function gradeRate(analysis: SchoolAnalysis): number | null {
  const rated = analysis.sections.filter((section) => section.gap_rate !== null);
  const learners = rated.reduce((sum, section) => sum + section.learners, 0);
  return learners > 0 ? rated.reduce((sum, section) => sum + (section.gap_rate ?? 0) * section.learners, 0) / learners : null;
}

function GradeGrid({ analysis, onSection }: { analysis: SchoolAnalysis; onSection: (sectionId: string) => void }): React.ReactElement {
  const shown = new Set(analysis.sections.flatMap((section) => section.chapters.filter((cell) => cell.weak_share !== null).map((cell) => cell.chapter_id)));
  const chapters = analysis.chapters.filter((chapter) => shown.has(chapter.chapter_id));
  return (
    <TableContainer>
      <Table size="small" aria-label={`Share of learners weak, by section and chapter, ${analysis.subject_name} Class ${analysis.grade}`}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ pl: 3 }}>Section</TableCell>
            <Tooltip title="Share of topic-level results that are gaps">
              <TableCell align="right">Gaps</TableCell>
            </Tooltip>
            {chapters.map((chapter) => (
              <Tooltip key={chapter.chapter_id} title={chapter.title}>
                <TableCell align="center" aria-label={chapter.title} sx={{ px: 0.5 }}>
                  {chapter.sequence}. {chapter.title.length > 14 ? `${chapter.title.slice(0, 12)}…` : chapter.title}
                </TableCell>
              </Tooltip>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {analysis.sections.map((section) => (
            <TableRow key={section.section_id} hover>
              <TableCell component="th" scope="row" sx={{ pl: 3 }}>
                <Link component="button" type="button" variant="subtitle2" onClick={() => onSection(section.section_id)} sx={{ whiteSpace: 'nowrap' }}>
                  {section.label}
                </Link>
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {percent(section.gap_rate)}
              </TableCell>
              {section.chapters
                .filter((cell) => shown.has(cell.chapter_id))
                .map((cell) => {
                  const title = analysis.chapters.find((chapter) => chapter.chapter_id === cell.chapter_id)?.title ?? '';
                  const label = cell.weak_share === null ? `${section.label}, ${title}: no evidence` : `${section.label}, ${title}: ${percent(cell.weak_share)} weak`;
                  return (
                    <TableCell key={cell.chapter_id} align="center" title={label} aria-label={label} sx={(theme) => ({ ...shareFill(theme, cell.weak_share), px: 0.5, fontVariantNumeric: 'tabular-nums', fontWeight: 600 })}>
                      {cell.weak_share === null ? '—' : Math.round(cell.weak_share * 100)}
                    </TableCell>
                  );
                })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function SchoolView({
  grades,
  grade,
  sectionIds,
  subjectCode,
  sectionId,
  classSubject,
  links,
  onChange,
}: {
  grades?: readonly number[];
  grade: number;
  sectionIds: readonly string[] | null;
  subjectCode: string;
  sectionId: string | null;
  classSubject: string | null;
  links: GapLinks;
  onChange: (next: Record<string, string | null>) => void;
}): React.ReactElement {
  const query = useGradeGaps(grade, subjectCode);

  if (query.isPending) return <WidgetLoading rows={8} />;
  if (query.isError) return <WidgetError error={query.error} onRetry={() => void query.refetch()} />;
  const analysis = query.data;

  const onClassSubject = (code: string): void => onChange({ school_class_subject: code });

  if (sectionIds) {
    return (
      <Stack spacing={4}>
        {sectionIds.map((id) => (
          <ClassView key={id} section={scopeOf(analysis, id)} subjectCode={classSubject ?? analysis.subject_code} links={links} onSubject={onClassSubject} planAny heading={sectionIds.length > 1} />
        ))}
      </Stack>
    );
  }

  if (sectionId) {
    return (
      <Stack spacing={2}>
        <Button variant="outlined" size="small" startIcon={<ArrowLeft size={14} aria-hidden />} onClick={() => onChange({ school_section: null, school_class_subject: null })} sx={{ alignSelf: 'flex-start' }}>
          All sections of Class {analysis.grade}
        </Button>
        <ClassView section={scopeOf(analysis, sectionId)} subjectCode={classSubject ?? analysis.subject_code} links={links} onSubject={onClassSubject} planAny />
      </Stack>
    );
  }

  const hasData = analysis.sections.some((section) => section.gap_rate !== null);
  const learners = analysis.sections.reduce((sum, section) => sum + section.learners, 0);
  const [weakest] = analysis.weakest;

  return (
    <Stack spacing={2}>
      {grades ? (
        <TextField select size="small" label="Class" value={String(grade)} onChange={(event) => onChange({ grade: event.target.value, school_subject: null })} sx={{ minWidth: 140, alignSelf: 'flex-end' }}>
          {grades.map((row) => (
            <MenuItem key={row} value={String(row)}>
              Class {row}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={analysis.subject_code} onChange={(_, next: string) => onChange({ school_subject: next })} variant="scrollable" allowScrollButtonsMobile aria-label="Subjects">
          {analysis.subjects.map((row) => (
            <Tab key={row.code} value={row.code} label={row.name} />
          ))}
        </Tabs>
      </Box>

      {hasData ? (
        <>
          <FactStrip
            facts={[
              { label: 'Sections', value: analysis.sections.length, note: `Class ${analysis.grade}` },
              { label: 'Learners', value: learners.toLocaleString('en-IN') },
              { label: 'Gap rate', value: percent(gradeRate(analysis)), note: 'Of topic-level results' },
              { label: 'Weakest topic', value: weakest ? `${percent(weakest.weak_share)} weak` : 'None', note: weakest?.title },
            ]}
          />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 8fr) minmax(0, 4fr)' }, alignItems: 'start' }}>
            <Card>
              <CardHeader title="By section" subheader="Share weak per chapter · choose a section" />
              <GradeGrid analysis={analysis} onSection={(id) => onChange({ school_section: id, school_class_subject: analysis.subject_code })} />
            </Card>
            <Card>
              <CardHeader title="Weakest topics" subheader={`Across Class ${analysis.grade}`} />
              <List disablePadding sx={{ px: 3, py: 1 }}>
                {analysis.weakest.map((topic, index) => (
                  <ListItem key={topic.topic_id} disableGutters divider={index < analysis.weakest.length - 1} sx={{ gap: 1.5 }}>
                    <ListItemText
                      primary={topic.title}
                      secondary={`${topic.chapter_title} · ${topic.sections_affected > 0 ? `class-wide gap in ${topic.sections_affected} of ${analysis.sections.length} sections` : `spread across all ${analysis.sections.length} sections`}`}
                      slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'body2', noWrap: true } }}
                      sx={{ my: 0, minWidth: 0 }}
                    />
                    <EmergeChip label={percent(topic.weak_share)} tone={topic.weak_share >= CLASS_WIDE_SHARE ? 'red' : 'amber'} />
                  </ListItem>
                ))}
              </List>
            </Card>
          </Box>
        </>
      ) : (
        <Alert severity="info" variant="outlined">
          No topic-level records yet.
        </Alert>
      )}
    </Stack>
  );
}
