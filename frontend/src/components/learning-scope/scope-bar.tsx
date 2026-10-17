'use client';

import * as React from 'react';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { StructureHeader } from '@/components/ui/class-structure';

import type { MultiScope, ScopeGrade } from './scope-model';

const MINE_LABEL = 'My classes';

export interface ScopeBarActions {
  onLearner?: () => void;
  onGrade?: () => void;
  onSections?: () => void;
}

const count = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

function studentsIn(scope: MultiScope): number | null {
  return scope.sections.every((section) => section.students !== null) ? scope.sections.reduce((total, section) => total + (section.students ?? 0), 0) : null;
}

function describe(scope: MultiScope, grade: ScopeGrade | null): { title: string; summary: string; current: string } {
  const pupils = studentsIn(scope);
  const pupilsText = pupils === null ? null : count(pupils, 'student');
  if (scope.grade === null) {
    return { title: MINE_LABEL, summary: [scope.sections.map((section) => section.label).join(', '), pupilsText].filter(Boolean).join(' · '), current: MINE_LABEL };
  }
  const total = grade?.sections.length ?? scope.sections.length;
  if (scope.sections.length === 0) {
    const students = grade?.students ?? scope.grade.students;
    return { title: scope.grade.name, summary: [students === null ? null : count(students, 'student'), count(total, 'section')].filter(Boolean).join(' · '), current: scope.grade.name };
  }
  const [only] = scope.sections;
  if (scope.sections.length === 1 && only) {
    return {
      title: `${scope.grade.name} · Section ${only.name}`,
      summary: [pupilsText, only.classTeacher ? `Class teacher ${only.classTeacher}` : 'No class teacher', only.room ?? null].filter(Boolean).join(' · '),
      current: `Section ${only.name}`,
    };
  }
  if (scope.allSections) {
    return { title: `${scope.grade.name} · All sections`, summary: [pupilsText, count(total, 'section')].filter(Boolean).join(' · '), current: 'All sections' };
  }
  const names = scope.sections.map((section) => section.name).join(', ');
  return { title: `${scope.grade.name} · Sections ${names}`, summary: [pupilsText, `${scope.sections.length} of ${total} sections`].filter(Boolean).join(' · '), current: `Sections ${names}` };
}

function Crumb({ label, onClick }: { label: string; onClick: (() => void) | undefined }): React.ReactElement {
  if (!onClick) {
    return (
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    );
  }
  return (
    <Link component="button" type="button" variant="body2" color="text.secondary" underline="hover" onClick={onClick}>
      {label}
    </Link>
  );
}

export function ScopeBar({ scope, grade, actions: offered, locked }: { scope: MultiScope; grade: ScopeGrade | null; actions: ScopeBarActions; locked?: string | null }): React.ReactElement {
  const actions: ScopeBarActions = locked ? {} : offered;
  const changeable = offered.onLearner ?? offered.onGrade ?? offered.onSections;
  const change = actions.onLearner ?? actions.onGrade ?? actions.onSections;
  const { title, summary, current } = describe(scope, grade);
  const guardian = scope.learner && scope.reach === 'guardian_ward' ? scope.learner : null;
  const button = locked && changeable ? (
    <Tooltip title={locked}>
      <span>
        <Button variant="outlined" disabled aria-description={locked}>
          Change
        </Button>
      </span>
    </Tooltip>
  ) : change ? (
    <Button variant="outlined" onClick={change} aria-label={`Change class, now ${title}`}>
      Change
    </Button>
  ) : null;

  return (
    <Stack spacing={1} component="nav" aria-label="Class in use">
      <Breadcrumbs sx={{ mb: 0.5 }}>
        {guardian ? <Crumb label={guardian.name} onClick={actions.onLearner} /> : null}
        <Crumb label="Classes" onClick={actions.onGrade} />
        {scope.grade && scope.sections.length > 0 ? <Crumb label={scope.grade.name} onClick={actions.onSections} /> : null}
        <Typography variant="body2" color="text.primary" aria-current="page">
          {current}
        </Typography>
      </Breadcrumbs>
      <StructureHeader level="h2" title={title} summary={summary} action={button} />
    </Stack>
  );
}
