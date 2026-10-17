'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import { ArrowRight } from 'lucide-react';

import { ClassCardHead, SectionTile } from '@/components/ui/class-structure';

import type { ScopeGrade, ScopeMode, ScopeSection } from './scope-model';

const plural = (n: number, one: string): string => `${n.toLocaleString('en-IN')} ${n === 1 ? one : `${one}s`}`;

interface Tile {
  section: ScopeSection;
  letter: string;
  onPick: () => void;
}

function GradeCard({ badge, name, students, tiles, action }: { badge: string; name: string; students: number | null; tiles: readonly Tile[]; action: { label: string; onClick: () => void } }): React.ReactElement {
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', p: 2.5, gap: 2, height: 1 }}>
      <ClassCardHead badge={badge} name={name} summary={[students === null ? null : plural(students, 'student'), plural(tiles.length, 'section')].filter(Boolean).join(' · ')} />
      <Box sx={{ display: 'grid', gap: 0.75, gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' }}>
        {tiles.map((tile) => (
          <SectionTile key={tile.section.id} onClick={tile.onPick} label={`Open section ${tile.section.label}`} letter={tile.letter} students={tile.section.students} teacher={tile.section.classTeacher} />
        ))}
      </Box>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: 'auto', pt: 0.5 }}>
        <Button size="small" variant="outlined" endIcon={<ArrowRight size={14} />} onClick={action.onClick} aria-label={`Choose ${name}`} sx={{ flexShrink: 0 }}>
          {action.label}
        </Button>
      </Stack>
    </Card>
  );
}

export interface MineOption {
  grades: readonly ScopeGrade[];
  onPick: () => void;
}

export function GradeStep({
  grades,
  mode,
  mine,
  onGrade,
  onSection,
}: {
  grades: readonly ScopeGrade[];
  mode: ScopeMode;
  mine?: MineOption;
  onGrade: (grade: ScopeGrade) => void;
  onSection: (grade: ScopeGrade, section: ScopeSection) => void;
}): React.ReactElement {
  const pick = (grade: ScopeGrade, section: ScopeSection): void => (mode === 'grade-only' ? onGrade(grade) : onSection(grade, section));
  const tilesOf = (grade: ScopeGrade, letter: (section: ScopeSection) => string): Tile[] => grade.sections.map((section) => ({ section, letter: letter(section), onPick: () => pick(grade, section) }));
  const mineSections = mine?.grades.flatMap((grade) => grade.sections) ?? [];
  const mineStudents = mineSections.every((section) => section.students !== null) ? mineSections.reduce((total, section) => total + (section.students ?? 0), 0) : null;
  return (
    <Box component="ul" aria-label="Classes" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' } }}>
      {mine ? (
        <Box component="li">
          <GradeCard badge="All" name="My classes" students={mineStudents} tiles={mine.grades.flatMap((grade) => tilesOf(grade, (section) => section.label))} action={{ label: 'Open all my classes', onClick: mine.onPick }} />
        </Box>
      ) : null}
      {grades.map((grade) => (
        <Box component="li" key={grade.id}>
          <GradeCard badge={String(grade.level)} name={grade.name} students={grade.students} tiles={tilesOf(grade, (section) => section.name)} action={{ label: `Open ${grade.name}`, onClick: () => onGrade(grade) }} />
        </Box>
      ))}
    </Box>
  );
}
