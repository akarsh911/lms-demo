'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useRouter } from 'next/navigation';

import { NoticesBoard } from '@/components/notices/notices-board';
import { useUrlState } from '@/components/school/url-state';
import { TabLabel } from '@/components/ui/tab-label';
import { paths } from '@/paths';
import type { YearEnrollment } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';
import type { StructureClass, StructureSection } from '@/types/structure';

import { ClassSubjects } from './class-subjects';
import { MoveDialog } from './move-dialog';
import { SectionActDialog, isSectionAct } from './section-act';
import { SectionAttendance } from './section-attendance';
import { SectionOverview } from './section-overview';
import { SectionStudents } from './section-students';
import { SectionTimetable } from './section-timetable';
import { classHref, type StructureBase, type StructureMode } from './structure-mode';
import { mayAct, useStructureRights } from './use-structure-rights';

const TABS = ['overview', 'students', 'timetable', 'attendance', 'announcements', 'subjects'] as const;
type SectionTab = (typeof TABS)[number];
const LABEL: Readonly<Record<SectionTab, string>> = { overview: 'Overview', students: 'Students', timetable: 'Timetable', attendance: 'Attendance', announcements: 'Announcements', subjects: 'Subjects' };

// Everything about one teaching group: a section, or a class taught as one. `?act=` opens the fix an Actions link asked for.
export function SectionBody({
  year,
  row,
  section,
  label,
  mode,
  pupils,
  base,
  personaSlug,
}: {
  year: AcademicSession;
  row: StructureClass;
  section: StructureSection;
  label: string;
  mode: StructureMode;
  pupils: readonly YearEnrollment[];
  base: StructureBase;
  personaSlug: string;
}): React.ReactElement {
  const router = useRouter();
  const { get, put } = useUrlState();
  const [moving, setMoving] = React.useState<YearEnrollment[] | null>(null);
  const tab: SectionTab = TABS.find((t) => t === get('tab')) ?? 'overview';
  const asked = get('act');
  const act = isSectionAct(asked) ? asked : null;
  const may = useStructureRights(mode);
  const mine = pupils.filter((p) => p.section_id === section.id);
  const issues = row.issues.filter((issue) => issue.section_id === section.id).length;
  const openAct = (next: string | null): void => put({ act: next });
  const shown = TABS.filter((t) => t !== 'attendance' || mode === 'active');

  return (
    <>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={shown.includes(tab) ? tab : 'overview'} onChange={(_, next: SectionTab) => put({ tab: next === 'overview' ? null : next, from: null, view: null })} variant="scrollable" allowScrollButtonsMobile aria-label={`Parts of ${label}`}>
          {shown.map((name) => (
            <Tab key={name} value={name} label={<TabLabel label={LABEL[name]} count={name === 'overview' ? issues : 0} />} sx={name === 'overview' && issues > 0 ? { pr: 3 } : undefined} />
          ))}
        </Tabs>
      </Box>

      <Box role="tabpanel">
        {tab === 'overview' ? <SectionOverview yearId={year.id} row={row} section={section} label={label} pupils={mine} mode={mode} base={base} personaSlug={personaSlug} onAct={openAct} onTab={(next) => put({ tab: next })} /> : null}
        {tab === 'students' ? <SectionStudents yearId={year.id} label={label} section={section} pupils={mine} mode={mode} personaSlug={personaSlug} onRolls={() => openAct('rolls')} onMove={row.undivided || !may.structure ? undefined : setMoving} /> : null}
        {tab === 'timetable' ? <SectionTimetable sectionId={section.id} label={label} /> : null}
        {tab === 'attendance' && mode === 'active' ? <SectionAttendance sectionId={section.id} label={label} editable={may.lead(section.id)} /> : null}
        {tab === 'announcements' ? <NoticesBoard scope={{ label, rule: { type: 'section', id: section.id, label }, readOnly: !may.lead(section.id) }} /> : null}
        {tab === 'subjects' ? <ClassSubjects yearId={year.id} row={row} sectionId={row.undivided ? undefined : section.id} editable={may.structure} base={base} personaSlug={personaSlug} /> : null}
      </Box>

      {act && mayAct(may, act, section.id) ? (
        <SectionActDialog act={act} section={section} yearId={year.id} row={row} pupils={pupils} onClose={() => openAct(null)} onGone={() => router.replace(paths.personaSection(personaSlug, classHref(base, row.grade_level_id)))} />
      ) : null}
      {moving ? <MoveDialog yearId={year.id} className={row.name} mode={mode} students={moving} sections={row.sections} fromSectionId={section.id} onClose={() => setMoving(null)} onMoved={() => setMoving(null)} /> : null}
    </>
  );
}
