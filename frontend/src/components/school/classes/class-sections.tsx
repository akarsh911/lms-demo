'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, DoorOpen, GitMerge, ListOrdered, Pencil, Plus, Split, UserRoundCog } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { ClassBadge, TeacherCell } from '@/components/ui/class-structure';
import { RowMenu, type RowAction } from '@/components/ui/row-menu';
import { paths } from '@/paths';
import type { StructureClass, StructureSection } from '@/types/structure';

import type { SectionAct } from './section-act';
import { sectionHref, shortSection, type StructureBase, type StructureMode } from './structure-mode';
import { useStructureRights } from './use-structure-rights';

// The sections of a divided class, one row each, every row opening its section.
export function ClassSections({
  row,
  mode,
  base,
  personaSlug,
  onAct,
}: {
  row: StructureClass;
  mode: StructureMode;
  base: StructureBase;
  personaSlug: string;
  onAct: (act: SectionAct, section: StructureSection | null) => void;
}): React.ReactElement {
  const editable = useStructureRights(mode).structure;
  const actions = (section: StructureSection): RowAction[] => [
    { label: 'Change class teacher', icon: <UserRoundCog size={16} />, onSelect: () => onAct('teacher', section) },
    { label: 'Change room', icon: <DoorOpen size={16} />, onSelect: () => onAct('room', section) },
    { label: 'Assign roll numbers', icon: <ListOrdered size={16} />, onSelect: () => onAct('rolls', section), disabled: section.students === 0 },
    { label: 'Rename or resize', icon: <Pencil size={16} />, onSelect: () => onAct('edit', section) },
    { label: 'Split into two', icon: <Split size={16} />, onSelect: () => onAct('split', section), disabled: section.students < 2 },
    { label: row.sections.length === 2 ? 'Merge: teach the class as one' : 'Merge into another', icon: <GitMerge size={16} />, onSelect: () => onAct('merge', section) },
  ];

  return (
    <Card>
      <CardHeader
        title="Sections"
        subheader={`${row.sections.length} ${row.sections.length === 1 ? 'section' : 'sections'} · ${row.students} students${row.unassigned > 0 ? ` · ${row.unassigned} awaiting a section` : ''}`}
        action={
          editable ? (
            <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={() => onAct('edit', null)}>
              Add Section
            </Button>
          ) : null
        }
      />
      <TableContainer sx={{ border: 0, borderRadius: 0 }}>
        <Table sx={{ minWidth: 860 }}>
          <TableHead>
            <TableRow>
              <TableCell>Section</TableCell>
              <TableCell align="right">Students</TableCell>
              <TableCell>Class teacher</TableCell>
              <TableCell>Room</TableCell>
              <TableCell>Roll numbers</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {row.sections.map((section) => {
              const href = paths.personaSection(personaSlug, sectionHref(base, row.grade_level_id, section.id));
              const over = section.capacity !== null && section.students > section.capacity;
              const cramped = section.room?.capacity != null && section.students > section.room.capacity;
              const gaps = row.issues.filter((i) => i.section_id === section.id).length;
              return (
                <TableRow key={section.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      <ClassBadge size="row">{section.name}</ClassBadge>
                      <Link component={NextLink} href={href} variant="subtitle1" underline="hover" color="text.primary">
                        {shortSection(row.name, section.name)}
                      </Link>
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    <Typography component="span" variant="body2" sx={{ fontWeight: 600, color: over ? 'warning.dark' : 'text.primary' }}>
                      {section.students}
                    </Typography>
                    {section.capacity !== null ? (
                      <Typography component="span" variant="body2" color="text.secondary">
                        {` / ${section.capacity}`}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <TeacherCell name={section.class_teacher?.name ?? null} />
                  </TableCell>
                  <TableCell>
                    {section.room ? (
                      <Typography variant="body2" color={cramped ? 'warning.dark' : 'text.primary'}>
                        {section.room.name}
                        {cramped ? ` · seats ${section.room.capacity}` : ''}
                      </Typography>
                    ) : (
                      <EmergeChip label="None" tone="amber" dot />
                    )}
                  </TableCell>
                  <TableCell>{section.rolls.missing > 0 ? <EmergeChip label={`${section.rolls.missing} missing`} tone="amber" /> : section.students === 0 ? <Typography variant="body2" color="text.secondary">—</Typography> : <EmergeChip label="Complete" tone="green" />}</TableCell>
                  <TableCell>{gaps > 0 ? <EmergeChip label={`${gaps} to fix`} tone="amber" dot /> : <EmergeChip label="All set" tone="green" />}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                      {editable ? <RowMenu label={`Change ${shortSection(row.name, section.name)}`} actions={actions(section)} /> : null}
                      <Button size="small" variant="outlined" endIcon={<ArrowRight size={14} />} component={NextLink} href={href}>
                        Open
                      </Button>
                    </Stack>
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
