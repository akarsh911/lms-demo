'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ChevronDown, CircleAlert, LayoutGrid, Lock, Split, Users, UsersRound } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { StructureHeader } from '@/components/ui/class-structure';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useCreateSection, useKeepAsOneClass } from '@/hooks/mutation/use-structure';
import { LIFECYCLE_LABEL, LIFECYCLE_TONE, yearLifecycle } from '@/lib/school/years';
import { paths } from '@/paths';
import type { StructureClass, StructureSection } from '@/types/structure';

import { ClassSections } from './class-sections';
import { ClassStudents } from './class-students';
import { ClassSubjects } from './class-subjects';
import { IssueList } from './issue-list';
import { SectionActDialog, type SectionAct } from './section-act';
import { SectionBody } from './section-body';
import { arrangeHref, type StructureBase } from './structure-mode';
import { useStructureContext } from './use-structure-context';
import { useStructureRights } from './use-structure-rights';

const TABS = ['sections', 'students', 'subjects'] as const;
type ClassTab = (typeof TABS)[number];
const LABEL: Readonly<Record<ClassTab, string>> = { sections: 'Sections', students: 'Students', subjects: 'Subjects' };

// The gaps of a class as one folded strip above its tabs, so they are seen without taking a tab of their own.
function Attention({ row, base, personaSlug }: { row: StructureClass; base: StructureBase; personaSlug: string }): React.ReactElement | null {
  const [open, setOpen] = React.useState(false);
  if (row.issues.length === 0) return null;
  return (
    <Card sx={(theme) => ({ outline: `1px solid ${theme.hues.amber}`, bgcolor: theme.tints.amber })}>
      <CardActionArea onClick={() => setOpen(!open)} sx={{ px: 2.5, py: 1.5 }} aria-expanded={open}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', color: 'warning.dark' }}>
          <CircleAlert size={18} aria-hidden />
          <Typography variant="subtitle1" sx={{ color: 'inherit', flex: 1 }}>
            {row.issues.length} {row.issues.length === 1 ? 'thing needs' : 'things need'} attention: {row.issues[0]?.title}
            {row.issues.length > 1 ? ', and more' : ''}
          </Typography>
          <ChevronDown size={18} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} aria-hidden />
        </Stack>
      </CardActionArea>
      <Collapse in={open}>
        <Box sx={(theme) => ({ bgcolor: theme.brand.surface })}>
          <IssueList issues={row.issues} base={base} personaSlug={personaSlug} empty="" />
        </Box>
      </Collapse>
    </Card>
  );
}

// A class not set up yet chooses its shape: one group, or two sections to start.
function ChooseShape({ yearId, row }: { yearId: string; row: StructureClass }): React.ReactElement {
  const notify = useToast();
  const keep = useKeepAsOneClass(yearId, row.grade_level_id);
  const divide = useCreateSection(yearId, row.grade_level_id);
  const choice = (icon: React.ReactNode, title: string, body: string, onClick: () => void, busy: boolean): React.ReactElement => (
    <Card>
      <CardActionArea onClick={onClick} disabled={busy} sx={{ p: 3, height: '100%' }}>
        <Stack spacing={1.25}>
          <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.tints.rose, color: theme.onTint.rose })}>{icon}</Box>
          <Typography variant="h4" component="h2">
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {body}
          </Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
  return (
    <Stack spacing={2}>
      <Typography variant="body1" color="text.secondary">
        How is {row.name} taught this year?
      </Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        {choice(<UsersRound size={22} />, 'As one class', 'For a small class: one class teacher, one room, one timetable, and nobody to place.', () => keep.mutate(undefined, { onSuccess: () => notify(`${row.name} is taught as one class`) }), keep.isPending)}
        {choice(<Users size={22} />, 'In sections', 'Divides the class into sections A and B to start; more can be added later.', () => divide.mutate({ capacity: 40 }, { onSuccess: () => notify(`${row.name} divided into sections A and B`) }), divide.isPending)}
      </Box>
    </Stack>
  );
}

// One class of one year: its sections first, or, for a class taught as one, everything about that one group.
export function ClassWorkspace({ yearId, gradeId, base, personaSlug }: { yearId?: string; gradeId: string; base: StructureBase; personaSlug: string }): React.ReactElement {
  const { get, put } = useUrlState();
  const ctx = useStructureContext(yearId, gradeId);
  const editable = useStructureRights(ctx.mode).structure;
  const [open, setOpen] = React.useState<{ act: SectionAct; section: StructureSection | null } | null>(null);
  const tab = TABS.find((name) => name === get('tab')) ?? 'sections';

  if (ctx.isPending) return <WidgetLoading rows={6} />;
  if (ctx.error) return <WidgetError error={ctx.error} onRetry={ctx.refetch} />;
  if (!ctx.year || !ctx.row) {
    return (
      <Alert severity="info" variant="outlined">
        {ctx.year ? 'This class is not part of that academic year.' : 'No academic year is active, so there is no current class to show.'}
      </Alert>
    );
  }
  const { year, row, mode, pupils } = ctx;
  const life = yearLifecycle(year);
  const shape = row.undivided ? (row.whole ? 'one' : 'none') : 'sections';

  return (
    <Stack spacing={3}>
      <StructureHeader
        title={row.name}
        chip={<EmergeChip label={`${year.name ?? year.code} · ${LIFECYCLE_LABEL[life]}`} tone={LIFECYCLE_TONE[life]} dot={life === 'active'} />}
        summary={
          <>
            {row.students} students ·{' '}
            {shape === 'one' ? `taught as one class · ${row.whole?.class_teacher ? `class teacher ${row.whole.class_teacher.name}` : 'no class teacher'} · ${row.whole?.room?.name ?? 'no room'}` : shape === 'none' ? 'not set up yet' : `${row.sections.length} ${row.sections.length === 1 ? 'section' : 'sections'}${row.unassigned > 0 ? ` · ${row.unassigned} awaiting a section` : ''}`}
          </>
        }
        action={
          <>
            {editable && shape === 'sections' ? (
              <Button component={NextLink} href={paths.personaSection(personaSlug, arrangeHref(base, gradeId))} variant="contained" startIcon={<LayoutGrid size={16} />}>
                Arrange Students
              </Button>
            ) : null}
            {editable && shape === 'one' && row.whole ? (
              <Button variant="contained" startIcon={<Split size={16} />} onClick={() => setOpen({ act: 'split', section: row.whole })}>
                Divide into Sections
              </Button>
            ) : null}
          </>
        }
      />

      {mode === 'readOnly' ? (
        <Alert severity="info" variant="outlined" icon={<Lock size={18} />}>
          {year.name} is closed. This is how {row.name} stood; nothing can be changed.
        </Alert>
      ) : null}

      {shape === 'none' ? editable ? <ChooseShape yearId={year.id} row={row} /> : null : null}

      {shape === 'one' && row.whole ? <SectionBody year={year} row={row} section={row.whole} label={row.name} mode={mode} pupils={pupils} base={base} personaSlug={personaSlug} /> : null}

      {shape === 'sections' ? (
        <>
          <Attention row={row} base={base} personaSlug={personaSlug} />
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tab} onChange={(_, next: ClassTab) => put({ tab: next === 'sections' ? null : next, section: null })} variant="scrollable" allowScrollButtonsMobile aria-label={`Parts of ${row.name}`}>
              {TABS.map((name) => (
                <Tab key={name} value={name} label={LABEL[name]} />
              ))}
            </Tabs>
          </Box>
          <Box role="tabpanel">
            {tab === 'sections' ? <ClassSections row={row} mode={mode} base={base} personaSlug={personaSlug} onAct={(act, section) => setOpen({ act, section })} /> : null}
            {tab === 'students' ? <ClassStudents yearId={year.id} row={row} pupils={pupils} mode={mode} base={base} personaSlug={personaSlug} initial={get('section')} /> : null}
            {tab === 'subjects' ? <ClassSubjects yearId={year.id} row={row} editable={editable} base={base} personaSlug={personaSlug} /> : null}
          </Box>
        </>
      ) : null}

      {open ? <SectionActDialog act={open.act} section={open.section} yearId={year.id} row={row} pupils={pupils} onClose={() => setOpen(null)} /> : null}
    </Stack>
  );
}
