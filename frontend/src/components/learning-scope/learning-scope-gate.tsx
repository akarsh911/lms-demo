'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { StructureHeader } from '@/components/ui/class-structure';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetLoading } from '@/components/widgets/widget-states';

import { GradeStep } from './grade-step';
import { LearnerStep } from './learner-step';
import { ScopeBar, type ScopeBarActions } from './scope-bar';
import {
  chosenGrade,
  LEARNER_SCOPED,
  offersMine,
  type LearningScope,
  type MultiScope,
  type ScopeChoice,
  type ScopeGrade,
  type ScopeLearner,
  type ScopeMode,
  type ScopeReach,
} from './scope-model';
import { SectionStep, type SectionNote } from './section-step';
import { useLearningScope, type ScopeSpec } from './use-learning-scope';

export type { LegacyScope } from './use-learning-scope';

const CLEARED: ScopeChoice = { grade: null, sections: [], learner: null };
const PICK_GRADE: ScopeChoice = { ...CLEARED, pick: 'grade' };
const MINE: ScopeChoice = { ...CLEARED, mine: true };


function StepHeader({ title, body }: { title: string; body?: string }): React.ReactElement {
  return (
    <Stack spacing={0.5}>
      <Typography variant="h3" component="h2">
        {title}
      </Typography>
      {body ? (
        <Typography variant="body1" color="text.secondary">
          {body}
        </Typography>
      ) : null}
    </Stack>
  );
}

function ClassHeader({ grade, prompt, onClasses }: { grade: ScopeGrade; prompt: string | undefined; onClasses: (() => void) | undefined }): React.ReactElement {
  const summary = [grade.students === null ? null : `${grade.students} students`, `${grade.sections.length} ${grade.sections.length === 1 ? 'section' : 'sections'}`].filter(Boolean).join(' · ');
  return (
    <Stack spacing={1}>
      <Breadcrumbs sx={{ mb: 0.5 }}>
        {onClasses ? (
          <Link component="button" type="button" variant="body2" color="text.secondary" underline="hover" onClick={onClasses}>
            Classes
          </Link>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Classes
          </Typography>
        )}
        <Typography variant="body2" color="text.primary" aria-current="page">
          {grade.name}
        </Typography>
      </Breadcrumbs>
      <StructureHeader level="h2" title={grade.name} summary={prompt ? `${summary} · ${prompt}` : summary} />
    </Stack>
  );
}

interface Ready {
  userId: string;
  reach: ScopeReach;
  grades: readonly ScopeGrade[];
  learners: readonly ScopeLearner[];
  unoffered: readonly ScopeGrade[];
}

const classList = (names: readonly string[]): string => names.join(', ');

function emptyCopy(ready: Ready, offered: readonly number[] | undefined): { title: string; body: string } {
  if (ready.unoffered.length > 0) {
    const available = offered && offered.length > 0 ? ` It is set up for ${classList(offered.map((level) => `Class ${level}`))} so far.` : '';
    return { title: `Nothing for ${classList(ready.unoffered.map((grade) => grade.name))} yet`, body: `There is no material for this class here yet.${available}` };
  }
  if (LEARNER_SCOPED.has(ready.reach)) {
    return { title: 'No class on record', body: 'This year’s class placement is not on record yet. It appears here once the school places the student in a section.' };
  }
  return { title: 'No classes to choose from', body: 'You are not assigned to teach any section this year.' };
}

const choosesGrade = (ready: Ready, mode: ScopeMode): boolean => ready.grades.length > 1 || offersMine(ready.reach, mode, ready.grades);

function barActions(ready: Ready, mode: ScopeMode, scope: MultiScope, go: (next: ScopeChoice) => void): ScopeBarActions {
  if (LEARNER_SCOPED.has(ready.reach)) return ready.learners.length > 1 ? { onLearner: () => go(CLEARED) } : {};
  const onGrade = choosesGrade(ready, mode) ? { onGrade: () => go(PICK_GRADE) } : {};
  if (scope.grade === null) return onGrade;
  const level = scope.grade.level;
  const grade = ready.grades.find((option) => option.level === level);
  const sectionChoice = mode !== 'grade-only' && (grade?.sections.length ?? 0) > 1;
  const current = scope.sections.map((section) => section.name);
  return { ...onGrade, ...(sectionChoice ? { onSections: () => go({ ...CLEARED, grade: level, sections: current, pick: 'sections' }) } : {}) };
}

function Picker({
  ready,
  mode,
  prompt,
  choice,
  noteOf,
  go,
}: {
  ready: Ready;
  mode: ScopeMode;
  prompt: string | undefined;
  choice: ScopeChoice;
  noteOf: SectionNote | undefined;
  go: (next: ScopeChoice) => void;
}): React.ReactElement {
  if (LEARNER_SCOPED.has(ready.reach)) {
    return (
      <Stack spacing={2.5}>
        <StepHeader title="Choose your child" body={prompt} />
        <LearnerStep learners={ready.learners} grades={ready.grades} onPick={(learner) => go({ ...CLEARED, learner: learner.id })} />
      </Stack>
    );
  }

  const grade = choice.pick === 'grade' ? null : chosenGrade(ready.grades, choice);
  if (!grade) {
    const mine = offersMine(ready.reach, mode, ready.grades) ? { grades: ready.grades, onPick: () => go(MINE) } : undefined;
    return (
      <Stack spacing={2.5}>
        <StepHeader title="Choose a class" body={prompt} />
        <GradeStep
          grades={ready.grades}
          mode={mode}
          mine={mine}
          onGrade={(next) => go({ ...CLEARED, grade: next.level, ...(mode === 'grade-only' ? {} : { pick: 'sections' as const }) })}
          onSection={(next, section) => go({ ...CLEARED, grade: next.level, sections: [section.name] })}
        />
      </Stack>
    );
  }

  const multi = mode === 'multi';
  return (
    <Stack spacing={2.5}>
      <ClassHeader grade={grade} prompt={prompt} onClasses={choosesGrade(ready, mode) ? () => go(PICK_GRADE) : undefined} />
      <SectionStep key={grade.id} grade={grade} multi={multi} initial={choice.sections} noteOf={noteOf} onDone={(names) => go({ ...CLEARED, grade: grade.level, sections: names })} />
    </Stack>
  );
}

interface GateCommon extends Omit<ScopeSpec, 'mode' | 'preferMine'> {
  sectionNote?: SectionNote;
  prompt?: string;
  ungated?: React.ReactNode;
  locked?: string | null;
}

type GateProps =
  | (GateCommon & { mode: 'multi'; preferMine?: boolean; children: (scope: MultiScope) => React.ReactNode })
  | (GateCommon & { mode: 'single' | 'grade-only'; children: (scope: LearningScope) => React.ReactNode });

function Unavailable({ ungated }: { ungated: React.ReactNode }): React.ReactElement {
  if (ungated !== undefined) return <>{ungated}</>;
  return (
    <Alert severity="info" variant="outlined">
      The class list could not be loaded, so there is no class to open this for yet. Reload the page to try again.
    </Alert>
  );
}

function render(props: GateProps, scope: MultiScope): React.ReactNode {
  if (props.mode === 'multi') return props.children(scope);
  const grade = scope.grade;
  return grade ? props.children({ ...scope, grade }) : null;
}

export function LearningScopeGate(props: GateProps): React.ReactElement {
  const { sectionNote, prompt, ungated, locked, children: _children, ...spec } = props;
  const { mode, grades } = spec;
  const { options, choice, scope, go } = useLearningScope({ ...spec, preferMine: props.mode === 'multi' && props.preferMine === true });

  switch (options.status) {
    case 'pending':
      return <WidgetLoading rows={6} />;
    case 'unavailable':
      return <Unavailable ungated={ungated} />;
    case 'unreachable':
      return (
        <Card>
          <EmptyState title="No classes to choose from" body="Your account does not reach any class for this. Ask your school administrator if that is wrong." />
        </Card>
      );
    case 'ready':
      break;
    default: {
      const unhandled: never = options;
      return unhandled;
    }
  }

  if (options.grades.length === 0 || (LEARNER_SCOPED.has(options.reach) && options.learners.length === 0)) {
    const copy = emptyCopy(options, grades);
    return (
      <Card>
        <EmptyState title={copy.title} body={copy.body} />
      </Card>
    );
  }

  if (!scope) {
    return (
      <Box sx={{ height: '100%', overflowY: 'auto' }}>
        <Picker ready={options} mode={mode} prompt={prompt} choice={choice} noteOf={sectionNote} go={go} />
      </Box>
    );
  }

  return (
    <Stack spacing={2} sx={{ height: '100%', minHeight: 0 }}>
      <ScopeBar scope={scope} grade={scope.grade ? (options.grades.find((option) => option.level === scope.grade?.level) ?? null) : null} actions={barActions(options, mode, scope, go)} locked={locked} />
      <Box sx={{ flex: 1, minHeight: 0 }}>{render(props, scope)}</Box>
    </Stack>
  );
}
