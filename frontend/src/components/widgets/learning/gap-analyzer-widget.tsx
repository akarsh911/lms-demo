'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';

import { ClassView } from '@/components/gap-analyzer/class-view';
import { LearnerPanel } from '@/components/gap-analyzer/learner-panel';
import { SchoolView } from '@/components/gap-analyzer/school-view';
import { useGapLinks } from '@/components/gap-analyzer/use-gap-links';
import { LearningScopeGate, type LegacyScope } from '@/components/learning-scope/learning-scope-gate';
import { choiceOfSection, type SectionSeed } from '@/components/learning-scope/scope-model';
import { useUrlState } from '@/components/school/url-state';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useGapScope } from '@/hooks/query/use-gap-analyzer';
import type { GapScope, ScopeSection } from '@/types/gap-analyzer';
import type { WidgetProps } from '@/types/widget';

const ID_PREFIX = 'gap-analyzer';
const DEFAULT_SCHOOL_SUBJECT = 'SCI';
const CLASSES_LEGACY_KEYS = ['section'];
const SCHOOL_LEGACY_KEYS = ['school_section', 'school_class_subject'];
const COHORT_TABS: Readonly<Record<string, string>> = { classes: 'school', school: 'classes' };
const NO_EVIDENCE = 'No evidence yet';
const DEFAULT_GRADE = 10;

const seedOf = (row: ScopeSection): SectionSeed => ({ id: row.section_id, grade: row.grade, name: row.label.split(/[\s·]+/).pop() ?? row.label });

interface ScopeTab {
  slug: string;
  label: string;
}

function tabsOf(scope: GapScope): ScopeTab[] {
  return [
    scope.self ? { slug: 'mine', label: 'My gaps' } : null,
    scope.wards.length > 0 ? { slug: 'children', label: scope.wards.length > 1 ? 'My children' : 'My child' } : null,
    scope.sections.length > 0 ? { slug: 'classes', label: 'My classes' } : null,
    scope.school ? { slug: 'school', label: 'School' } : null,
  ].filter((tab): tab is ScopeTab => tab !== null);
}

export function GapAnalyzerWidget({ personaSlug, reachableLinks = [] }: WidgetProps): React.ReactElement {
  const { get, put } = useUrlState();
  const scope = useGapScope();
  const links = useGapLinks(personaSlug, reachableLinks);

  if (scope.isPending) return <WidgetLoading rows={8} />;
  if (scope.isError) return <WidgetError error={scope.error} onRetry={() => void scope.refetch()} />;
  const data = scope.data;
  const tabs = tabsOf(data);
  if (tabs.length === 0) return <WidgetEmpty message="No learners linked to your account." />;

  const requested = get('tab');
  const offered = (slug: string | null | undefined): string | undefined => tabs.find((spec) => spec.slug === slug)?.slug;
  const tab = offered(requested) ?? offered(COHORT_TABS[requested ?? '']) ?? tabs[0]?.slug ?? '';
  const schoolClassSubject = get('school_class_subject') ?? get('class_subject');
  const selection = { subject: get('subject'), topic: get('topic') };
  const classesLegacy: LegacyScope = { keys: CLASSES_LEGACY_KEYS, resolve: (grades) => choiceOfSection(grades, get('section')) };
  const schoolLegacy: LegacyScope = { keys: SCHOOL_LEGACY_KEYS, resolve: (grades) => choiceOfSection(grades, get('school_section')) };
  const served = new Map(data.sections.map((row) => [row.section_id, row]));
  const schoolGrades = data.school?.grades ?? [];
  const requestedGrade = Number.parseInt(get('grade') ?? '', 10);
  const ungatedGrade = schoolGrades.includes(requestedGrade) ? requestedGrade : schoolGrades.includes(DEFAULT_GRADE) ? DEFAULT_GRADE : (schoolGrades[0] ?? DEFAULT_GRADE);
  const firstServed = data.sections[0];

  return (
    <Stack spacing={2}>
      {tabs.length > 1 ? (
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tab} onChange={(_, next: string) => put({ tab: next })} variant="scrollable" allowScrollButtonsMobile aria-label="Who to analyse">
            {tabs.map((spec) => (
              <Tab key={spec.slug} value={spec.slug} id={`${ID_PREFIX}-tab-${spec.slug}`} aria-controls={`${ID_PREFIX}-panel-${spec.slug}`} label={spec.label} />
            ))}
          </Tabs>
        </Box>
      ) : null}
      <Box role="tabpanel" id={`${ID_PREFIX}-panel-${tab}`} aria-labelledby={tabs.length > 1 ? `${ID_PREFIX}-tab-${tab}` : undefined}>
        {tab === 'mine' && data.self ? <LearnerPanel learners={[data.self]} learnerId={data.self.student_id} selection={selection} links={links} onChange={put} /> : null}
        {tab === 'children' ? <LearnerPanel learners={data.wards} learnerId={get('learner')} selection={selection} links={links} onChange={put} /> : null}
        {tab === 'classes' ? (
          <LearningScopeGate
            mode="multi"
            reach="teacher_assignment"
            grades={[...new Set(data.sections.map((row) => row.grade))]}
            sections={[...served.keys()]}
            sectionNote={(id) => (served.get(id)?.learners_with_evidence === 0 ? NO_EVIDENCE : null)}
            legacy={classesLegacy}
            fallback={data.sections.map(seedOf)}
            ungated={firstServed ? <ClassView section={served.get(get('section') ?? '') ?? firstServed} subjectCode={get('class_subject')} links={links} onSubject={(code) => put({ class_subject: code })} /> : null}
          >
            {(picked) => (
              <Stack spacing={4}>
                {picked.sections.flatMap((chosen) => {
                  const section = served.get(chosen.id);
                  return section ? [<ClassView key={chosen.id} section={section} subjectCode={get('class_subject')} links={links} onSubject={(code) => put({ class_subject: code })} heading={picked.sections.length > 1} />] : [];
                })}
              </Stack>
            )}
          </LearningScopeGate>
        ) : null}
        {tab === 'school' ? (
          <LearningScopeGate
            mode="multi"
            reach="school"
            grades={schoolGrades}
            legacy={schoolLegacy}
            ungated={
              <SchoolView
                grades={schoolGrades}
                grade={ungatedGrade}
                sectionIds={null}
                subjectCode={get('school_subject') ?? DEFAULT_SCHOOL_SUBJECT}
                sectionId={get('school_section')}
                classSubject={schoolClassSubject}
                links={links}
                onChange={put}
              />
            }
          >
            {(picked) =>
              picked.grade ? (
                <SchoolView
                  grade={picked.grade.level}
                  sectionIds={picked.allSections ? null : picked.sections.map((chosen) => chosen.id)}
                  subjectCode={get('school_subject') ?? DEFAULT_SCHOOL_SUBJECT}
                  sectionId={get('school_section')}
                  classSubject={schoolClassSubject}
                  links={links}
                  onChange={put}
                />
              ) : null
            }
          </LearningScopeGate>
        ) : null}
      </Box>
    </Stack>
  );
}
