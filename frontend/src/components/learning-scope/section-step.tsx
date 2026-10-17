'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Checkbox from '@mui/material/Checkbox';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { ArrowRight } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ClassBadge, TeacherCell } from '@/components/ui/class-structure';

import type { ScopeGrade, ScopeSection } from './scope-model';

export type SectionNote = (sectionId: string) => string | null;

const summaryOf = (grade: ScopeGrade): string => [`${grade.sections.length} ${grade.sections.length === 1 ? 'section' : 'sections'}`, grade.students === null ? null : `${grade.students} students`].filter(Boolean).join(' · ');

function Students({ section }: { section: ScopeSection }): React.ReactElement {
  if (section.students === null) return <Typography variant="body2" color="text.secondary">—</Typography>;
  return (
    <>
      <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
        {section.students}
      </Typography>
      {section.capacity !== null ? (
        <Typography component="span" variant="body2" color="text.secondary">
          {` / ${section.capacity}`}
        </Typography>
      ) : null}
    </>
  );
}

export function SectionStep({
  grade,
  multi,
  initial,
  noteOf,
  onDone,
}: {
  grade: ScopeGrade;
  multi: boolean;
  initial: readonly string[];
  noteOf?: SectionNote;
  onDone: (names: readonly string[]) => void;
}): React.ReactElement {
  const names = grade.sections.map((section) => section.name);
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(() => new Set(initial.filter((name) => names.includes(name))));
  const all = picked.size === names.length;
  const toggle = (name: string): void =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <Card>
      <CardHeader
        title="Sections"
        subheader={summaryOf(grade)}
        action={
          multi ? (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary" role="status">
                {picked.size === 0 ? 'Choose one or more' : `${picked.size} of ${names.length} chosen`}
              </Typography>
              <Button size="small" variant="contained" endIcon={<ArrowRight size={14} />} disabled={picked.size === 0} onClick={() => onDone(names.filter((name) => picked.has(name)))}>
                Continue
              </Button>
            </Stack>
          ) : null
        }
      />
      <TableContainer sx={{ border: 0, borderRadius: 0 }}>
        <Table sx={{ minWidth: 640 }} aria-label={`Sections of ${grade.name}`}>
          <TableHead>
            <TableRow>
              {multi ? (
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={all}
                    indeterminate={picked.size > 0 && !all}
                    onChange={() => setPicked(all ? new Set() : new Set(names))}
                    slotProps={{ input: { 'aria-label': `All sections of ${grade.name}` } }}
                  />
                </TableCell>
              ) : null}
              <TableCell>Section</TableCell>
              <TableCell align="right">Students</TableCell>
              <TableCell>Class teacher</TableCell>
              <TableCell>Room</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {grade.sections.map((section) => {
              const note = noteOf?.(section.id) ?? null;
              const open = (): void => onDone([section.name]);
              return (
                <TableRow key={section.id} hover selected={multi && picked.has(section.name)}>
                  {multi ? (
                    <TableCell padding="checkbox">
                      <Checkbox checked={picked.has(section.name)} onChange={() => toggle(section.name)} slotProps={{ input: { 'aria-label': `Section ${section.label}` } }} />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <ClassBadge size="row">{section.name}</ClassBadge>
                      <Link component="button" type="button" variant="subtitle1" underline="hover" color="text.primary" onClick={open}>
                        {section.label}
                      </Link>
                      {note ? <EmergeChip label={note} tone="amber" dot /> : null}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    <Students section={section} />
                  </TableCell>
                  <TableCell>
                    <TeacherCell name={section.classTeacher} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color={section.room ? 'text.primary' : 'text.secondary'}>
                      {section.room ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" endIcon={<ArrowRight size={14} />} onClick={open} aria-label={`Choose section ${section.label}`}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}
