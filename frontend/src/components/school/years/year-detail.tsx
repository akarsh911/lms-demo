'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, Lock, Pencil } from 'lucide-react';

import { ClassesStructure } from '@/components/school/classes/classes-structure';
import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { TabLabel } from '@/components/ui/tab-label';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { usePendingTasks, useYearRegister } from '@/hooks/query/use-foundation';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { dayRange } from '@/lib/dates';
import { STUDENT_VIEWS } from '@/lib/school/enrollments';
import { LIFECYCLE_LABEL, LIFECYCLE_TONE, yearLifecycle } from '@/lib/school/years';
import { paths } from '@/paths';
import { YEAR_TABS, type YearTab } from '@/types/foundation';

import { YearActions } from './year-actions';
import { YearCalendar } from './year-calendar';
import { YearExaminations } from './year-examinations';
import { YearDialog } from './year-dialog';
import { YearModeProvider } from './year-mode';
import { YearOverview } from './year-overview';
import { YearStudents } from './year-students';
import { YearTeachers } from './year-teachers';

const TAB_LABEL: Readonly<Record<YearTab, string>> = {
  overview: 'Overview',
  students: 'Students',
  classes: 'Classes & Sections',
  teachers: 'Teachers & Assignments',
  examinations: 'Examinations',
  calendar: 'Calendar',
  actions: 'Actions',
};

// Older links named tabs this page no longer has; they land on the tab that holds that work now.
const RETIRED_TABS: Readonly<Record<string, YearTab>> = { admissions: 'students', transition: 'overview' };

// One academic year as the school's register for that session: who was in it, what it ran on, and what is still open.
export function YearDetail({ yearId, personaSlug }: { yearId: string; personaSlug: string }): React.ReactElement {
  const years = useMdmSessions();
  const register = useYearRegister(yearId);
  const { get, put } = useUrlState();
  const [editing, setEditing] = React.useState(false);

  const tasks = usePendingTasks(yearId);
  const waiting = (tasks.data ?? []).reduce((sum, task) => sum + task.count, 0);
  const asked = get('tab') ?? '';
  const tab = YEAR_TABS.find((name) => name === asked) ?? RETIRED_TABS[asked] ?? 'overview';
  const view = get('view');
  const openTab = (next: YearTab, nextView?: string): void => put({ tab: next === 'overview' ? null : next, view: nextView ?? null });
  const openView = (nextView: string | null): void => put({ view: nextView });

  if (years.isPending) return <WidgetLoading rows={6} />;
  if (years.isError) return <WidgetError error={years.error} onRetry={() => void years.refetch()} />;

  const year = years.data.rows.find((row) => row.id === yearId);
  if (!year) {
    return (
      <Alert severity="info" variant="outlined">
        That academic year is not here any more. It may have been removed.
      </Alert>
    );
  }

  const life = yearLifecycle(year);
  const setupHref = paths.personaSection(personaSlug, `school/years/${year.id}/setup`);

  return (
    <YearModeProvider readOnly={life === 'closed'}>
      <Stack spacing={3}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
          <div>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
              <Typography variant="h2" component="h1">
                Academic Year {year.name ?? year.code}
              </Typography>
              <EmergeChip label={life === 'draft' ? 'Draft · Setup in progress' : LIFECYCLE_LABEL[life]} tone={LIFECYCLE_TONE[life]} dot={life === 'active'} />
            </Stack>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
              {dayRange(year.start_date, year.end_date)}
              {life === 'draft' && register.data ? ` · ${register.data.areas_ready} of ${register.data.areas_total} areas ready` : ''}
            </Typography>
          </div>
          {/* A closed year offers nothing to press: it is read. */}
          {life === 'closed' ? null : (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Button variant="outlined" startIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
                Edit Basic Details
              </Button>
              {life === 'draft' ? (
                <Button component={NextLink} href={setupHref} variant="contained" endIcon={<ArrowRight size={16} />}>
                  Continue Setup
                </Button>
              ) : null}
            </Stack>
          )}
        </Stack>

        {life === 'closed' ? (
          <Alert severity="info" variant="outlined" icon={<Lock size={18} />}>
            <AlertTitle>Historical Academic Year</AlertTitle>
            This year is closed and is available for reference only. Editing is disabled.
          </Alert>
        ) : null}

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, next: YearTab) => openTab(next)} variant="scrollable" allowScrollButtonsMobile aria-label="Parts of this academic year">
            {YEAR_TABS.filter((name) => name !== 'actions' || life === 'active').map((name) => (
              <Tab
                key={name}
                value={name}
                id={`year-tab-${name}`}
                aria-controls={`year-panel-${name}`}
                label={<TabLabel label={TAB_LABEL[name]} count={name === 'actions' ? waiting : 0} />}
                sx={name === 'actions' ? { pr: 3 } : undefined}
              />
            ))}
          </Tabs>
        </Box>

        <Box role="tabpanel" id={`year-panel-${tab}`} aria-labelledby={`year-tab-${tab}`}>
          {tab === 'overview' ? <YearOverview year={year} personaSlug={personaSlug} setupHref={setupHref} onOpen={openTab} /> : null}
          {tab === 'students' ? (
            <YearStudents year={year} personaSlug={personaSlug} view={STUDENT_VIEWS.find((name) => name === view) ?? 'all'} onView={(next) => openView(next === 'all' ? null : next)} />
          ) : null}
          {tab === 'classes' ? <ClassesStructure yearId={year.id} base={{ path: `school/years/${year.id}/classes` }} personaSlug={personaSlug} /> : null}
          {tab === 'teachers' ? <YearTeachers year={year} /> : null}
          {tab === 'examinations' ? <YearExaminations year={year} personaSlug={personaSlug} /> : null}
          {tab === 'calendar' ? <YearCalendar year={year} /> : null}
          {tab === 'actions' && life === 'active' ? <YearActions year={year} personaSlug={personaSlug} onOpen={openTab} /> : null}
        </Box>

        {editing ? <YearDialog year={year} onClose={() => setEditing(false)} /> : null}
      </Stack>
    </YearModeProvider>
  );
}
