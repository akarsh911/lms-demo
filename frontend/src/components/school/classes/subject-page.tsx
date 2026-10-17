'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { Pencil, UserPlus } from 'lucide-react';

import { ContentTab } from '@/components/classroom/content-tab';
import { SharedMaterial } from '@/components/subjects/shared-material';
import { CurriculumTab } from '@/components/classroom/curriculum-tab';
import type { ScopeState } from '@/components/classroom/scope-state';
import { HomeworkBoard } from '@/components/homework/homework-board';
import { MyWork } from '@/components/homework/my-work';
import { NoticesBoard } from '@/components/notices/notices-board';
import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { Avatar } from '@/components/ui/row';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useAuthoring } from '@/hooks/query/use-authoring';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useClassSubjects } from '@/hooks/query/use-structure';
import { useReach } from '@/hooks/query/use-reach';
import { useOffering, useSection } from '@/hooks/query/use-section';
import { capabilityFor } from '@/lib/core/fields';
import { leadsSection, seesSection, teachesOffering } from '@/lib/reach/reach';

import { shortSection } from './structure-mode';
import { SubjectTeacherDialog } from './subject-teacher-dialog';
import { useStructureContext } from './use-structure-context';
import { useStructureRights } from './use-structure-rights';

const TABS = ['announcements', 'assignments', 'content', 'curriculum'] as const;
type SubjectTab = (typeof TABS)[number];
const LABEL: Readonly<Record<SubjectTab, string>> = { announcements: 'Announcements', assignments: 'Assignments', content: 'Content', curriculum: 'Curriculum' };


// One subject as one section takes it: its teacher, then the announcements and assignments of that subject alone, its content and its curriculum.
export function SubjectPage({ gradeId, sectionId, offeringId, personaSlug }: { gradeId: string; sectionId: string; offeringId: string; personaSlug: string }): React.ReactElement {
  const { get, put } = useUrlState();
  const ctx = useStructureContext(undefined, gradeId);
  const offering = useOffering(offeringId);
  const sectionRow = useSection(sectionId);
  const subjects = useClassSubjects(ctx.year?.id ?? '', gradeId);
  const authoring = useAuthoring();
  const capabilities = useCapabilities();
  const reach = useReach();
  const may = useStructureRights(ctx.mode);
  const [changing, setChanging] = React.useState(false);
  const tab: SubjectTab = TABS.find((t) => t === get('tab')) ?? 'announcements';

  if (ctx.isPending || offering.isPending || subjects.isPending || !reach) return <WidgetLoading rows={6} />;
  if (offering.isError) return <WidgetError error={offering.error} onRetry={() => void offering.refetch()} />;
  if (!ctx.year || !ctx.row) return <WidgetError error={new Error('This class is not in the current year.')} onRetry={ctx.refetch} />;

  const row = ctx.row;
  const subject = subjects.data?.find((s) => s.sections.some((x) => x.offering_id === offeringId));
  const cell = subject?.sections.find((x) => x.offering_id === offeringId);
  const name = subject?.subject ?? offering.data.edges?.subject?.name ?? 'Subject';
  const where = row.undivided ? row.name : shortSection(row.name, cell?.section ?? sectionRow.data?.name ?? '');
  const label = `${name} in ${where}`;
  const editable = may.structure;
  // The subject's own teacher writes here; the class teacher and the pupils of the section read it.
  const teaches = teachesOffering(reach, offeringId);
  const home = offering.data.section_id ?? '';
  const reads = home === sectionId && (teaches || leadsSection(reach, home) || (reach.kind === 'self' && seesSection(reach, home)));
  const scopeState: ScopeState = offering.isError || sectionRow.isError ? 'failed' : sectionRow.isPending ? 'pending' : 'ready';
  const has = (key: string): boolean => capabilityFor(capabilities.data?.capabilities ?? [], key) !== undefined;

  if (!reads) {
    return (
      <Alert severity="info" variant="outlined">
        {name} in {where} is open to its teacher, the class teacher and the students who take it.
      </Alert>
    );
  }

  return (
    <Stack spacing={3}>
      <Card sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
          <Box>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="h2" component="h1">
                {name}
              </Typography>
              <EmergeChip label={subject?.elective ? 'Elective' : 'Core'} tone={subject?.elective ? 'violet' : 'blue'} />
            </Stack>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
              {where} · {subject?.periods ?? offering.data.periods_per_week ?? '—'} periods a week · {offering.data.maximum_marks ?? 100} marks
            </Typography>
          </Box>
          <Stack direction="row" spacing={2} sx={(theme) => ({ alignItems: 'center', p: 1.5, pr: 2, borderRadius: `${theme.band.radius.sm}px`, bgcolor: theme.brand.subtle })}>
            {cell?.teacher ? (
              <Avatar name={cell.teacher} size={40} />
            ) : (
              <Avatar name="?" size={40} />
            )}
            <Box sx={{ minWidth: 140 }}>
              <Typography variant="caption" color="text.secondary">
                Subject teacher
              </Typography>
              <Typography variant="subtitle1" color={cell?.teacher ? 'text.primary' : 'warning.dark'}>
                {cell?.teacher ?? 'Not assigned'}
              </Typography>
            </Box>
            {editable && cell ? (
              <Button size="small" variant={cell.teacher ? 'outlined' : 'contained'} startIcon={cell.teacher ? <Pencil size={14} /> : <UserPlus size={14} />} onClick={() => setChanging(true)}>
                {cell.teacher ? 'Change' : 'Assign'}
              </Button>
            ) : null}
          </Stack>
        </Stack>
      </Card>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, next: SubjectTab) => put({ tab: next === 'announcements' ? null : next, open: null, view: null })} variant="scrollable" allowScrollButtonsMobile aria-label={`Parts of ${label}`}>
          {TABS.map((t) => (
            <Tab key={t} value={t} label={LABEL[t]} />
          ))}
        </Tabs>
      </Box>

      <Stack role="tabpanel" spacing={2}>
        {tab === 'announcements' ? <NoticesBoard scope={{ label, rule: { type: 'offering', id: offeringId, label }, readOnly: !teaches }} /> : null}
        {tab === 'assignments' && reach.kind === 'self' ? <MyWork offeringId={offeringId} /> : null}
        {tab === 'assignments' && reach.kind !== 'self' ? (
          <HomeworkBoard personaSlug={personaSlug} scope={{ label, offering_id: offeringId, grade_level_id: gradeId, subject_id: offering.data.subject_id ?? '', section_id: sectionId, readOnly: !teaches }} />
        ) : null}
        {tab === 'content' ? <SharedMaterial offeringId={offeringId} sectionId={home} label={where} teaches={teaches} /> : null}
        {tab === 'content' ? <ContentTab offeringId={offeringId} subjectId={offering.data.subject_id} gradeLevelId={gradeId} scopeState={scopeState} subjectName={name} mayFile={teaches && authoring.mayFileMaterial} /> : null}
        {tab === 'curriculum' ? (
          <CurriculumTab
            subjectId={offering.data.subject_id}
            gradeLevelId={gradeId}
            sessionId={offering.data.academic_session_id ?? ctx.year.id}
            gradingSchemeId={offering.data.grading_scheme_id}
            resultSchemeId={offering.data.result_scheme_id}
            scopeState={scopeState}
            mayEdit={has('core.curriculum.write')}
            mayCreate={has('core.curriculum.create')}
          />
        ) : null}
      </Stack>

      {changing && cell ? <SubjectTeacherDialog yearId={ctx.year.id} subject={name} label={where} offeringId={offeringId} current={cell.teacher_id} browseHref="" onClose={() => setChanging(false)} /> : null}
    </Stack>
  );
}
