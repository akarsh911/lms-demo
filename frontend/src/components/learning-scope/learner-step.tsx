'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ArrowRight } from 'lucide-react';

import type { ScopeGrade, ScopeLearner } from './scope-model';

export function LearnerStep({ learners, grades, onPick }: { learners: readonly ScopeLearner[]; grades: readonly ScopeGrade[]; onPick: (learner: ScopeLearner) => void }): React.ReactElement {
  return (
    <Box component="ul" aria-label="Children" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
      {learners.map((learner) => {
        const grade = grades.find((option) => option.level === learner.grade);
        const section = grade?.sections.find((option) => option.id === learner.sectionId);
        return (
          <Box component="li" key={learner.id} sx={{ display: 'flex', '& > *': { flex: 1 } }}>
            <Card sx={{ display: 'flex' }}>
              <CardActionArea onClick={() => onPick(learner)} aria-label={`Choose ${learner.name}`} sx={{ p: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, minHeight: 112 }}>
                <div>
                  <Typography variant="h2" component="h3">
                    {learner.name}
                  </Typography>
                  <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                    {grade?.name ?? `Class ${learner.grade}`}
                    {section ? ` · Section ${section.name}` : ''}
                  </Typography>
                </div>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flex: 'none' }}>
                  <Typography variant="subtitle2" component="span">
                    Choose
                  </Typography>
                  <ArrowRight size={16} aria-hidden />
                </Stack>
              </CardActionArea>
            </Card>
          </Box>
        );
      })}
    </Box>
  );
}
