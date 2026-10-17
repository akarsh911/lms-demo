'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useMdmGradeLevels, useMdmSubjects } from '@/hooks/query/use-mdm';
import type { Curriculum } from '@/types/library';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';

import { usePaperSetterCurricula } from './hooks';
import { WizardPanel, PanelNote } from './panel';

const curriculumLabel = (curriculum: Curriculum): string =>
  `${curriculum.name ?? curriculum.code ?? curriculum.id}${curriculum.board ? ` · ${curriculum.board}` : ''}`;

export function CurriculumPicker({
  subjectId,
  gradeLevelId,
  curriculumId,
  onSubject,
  onCurriculum,
  onGradeLevel,
}: {
  subjectId: string;
  gradeLevelId: string;
  curriculumId: string;
  onSubject: (next: string) => void;
  onCurriculum: (next: string) => void;
  onGradeLevel?: (next: string, name: string) => void;
}): React.ReactElement {
  const subjects = useMdmSubjects();
  const grades = useMdmGradeLevels();
  const gradeRows = grades.data?.rows ?? [];
  const curricula = usePaperSetterCurricula(subjectId || null, gradeLevelId || null);

  const subjectRows = subjects.data?.rows ?? [];
  const curriculumRows = curricula.data ?? [];

  const chosen = curriculumRows.some((row) => row.id === curriculumId) ? curriculumId : '';
  const only = curriculumRows.length === 1 ? curriculumRows[0] : undefined;

  React.useEffect(() => {
    if (only && curriculumId !== only.id) onCurriculum(only.id);
  }, [only, curriculumId, onCurriculum]);

  return (
    <WizardPanel
      title="Subject and curriculum"
      subheader="A paper is set from a curriculum, and the books behind it are the material rather than the thing you choose"
    >
      {subjects.isPending ? <WidgetLoading rows={2} /> : null}

      {subjects.isError ? (
        <WidgetError error={subjects.error} onRetry={() => void subjects.refetch()} />
      ) : null}

      {subjectRows.length > 0 ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            label="Subject"
            value={subjectRows.some((row) => row.id === subjectId) ? subjectId : ''}
            onChange={(event) => onSubject(event.target.value)}
            size="small"
            fullWidth
          >
            {subjectRows.map((subject) => (
              <MenuItem key={subject.id} value={subject.id}>
                {subject.name ?? subject.code ?? subject.id}
              </MenuItem>
            ))}
          </TextField>
          {onGradeLevel ? (
            <TextField
              select
              label="Grade and class"
              value={gradeRows.some((row) => row.id === gradeLevelId) ? gradeLevelId : ''}
              onChange={(event) => {
                const chosen = gradeRows.find((row) => row.id === event.target.value);
                onGradeLevel(event.target.value, chosen?.name ?? chosen?.code ?? event.target.value);
              }}
              size="small"
              fullWidth
            >
              {gradeRows.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.name ?? row.code ?? row.id}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
        </Stack>
      ) : null}

      {subjects.data && subjectRows.length === 0 ? (
        <WidgetEmpty message="Your school has no subjects on record yet, so there is no curriculum to set a paper from." />
      ) : null}


      {subjectId && gradeLevelId ? (
        <>
          {curricula.isPending ? <WidgetLoading rows={2} /> : null}
          {curricula.isError ? (
            <WidgetError error={curricula.error} onRetry={() => void curricula.refetch()} />
          ) : null}
          {curricula.data && curriculumRows.length === 0 ? (
            <Alert severity="info" variant="outlined">
              Your school holds no curriculum for that subject and grade. Somebody has to
              set one up in the library before a paper can be composed from it.
            </Alert>
          ) : null}
          {only ? (
            <Typography variant="body2" color="text.secondary">
              From {curriculumLabel(only)}
            </Typography>
          ) : null}
          {curriculumRows.length > 1 ? (
            <TextField
              select
              label="Curriculum"
              value={chosen}
              onChange={(event) => onCurriculum(event.target.value)}
              size="small"
              sx={{ maxWidth: 420 }}
            >
              {curriculumRows.map((curriculum) => (
                <MenuItem key={curriculum.id} value={curriculum.id}>
                  {curriculumLabel(curriculum)}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
        </>
      ) : null}

      <PanelNote>
        Changing the curriculum clears the topics, the weighting and the emphasis, because
        every one of them names a topic in the curriculum you are leaving.
      </PanelNote>
    </WizardPanel>
  );
}
