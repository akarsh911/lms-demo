'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
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
import { ArrowRight, Pencil, Plus, UserPlus } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Avatar } from '@/components/ui/row';
import { EmptyState } from '@/components/ui/empty-state';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useClassSubjects } from '@/hooks/query/use-structure';
import { paths } from '@/paths';
import type { ClassSubject, StructureClass } from '@/types/structure';

import { AddSubjectDialog } from './add-subject-dialog';
import { sectionHref, shortSection, type StructureBase } from './structure-mode';
import { SubjectTeacherDialog } from './subject-teacher-dialog';

type Picked = { subject: ClassSubject; section: ClassSubject['sections'][number] };


const TypeChip = ({ elective }: { elective: boolean }): React.ReactElement => <EmergeChip label={elective ? 'Elective' : 'Core'} tone={elective ? 'violet' : 'blue'} />;

// One cell of the matrix: the teacher's name, or a clear prompt to assign one; a pencil shows it can be changed.
function TeacherCell({ teacher, onClick, disabled }: { teacher: string | null; onClick: () => void; disabled: boolean }): React.ReactElement {
  if (!teacher) {
    return (
      <Button size="small" variant="contained" color="warning" startIcon={<UserPlus size={14} />} onClick={onClick} disabled={disabled} sx={{ whiteSpace: 'nowrap', boxShadow: 'none' }}>
        Assign
      </Button>
    );
  }
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      sx={(theme) => ({
        width: 1,
        justifyContent: 'space-between',
        gap: 1,
        px: 1,
        py: 0.75,
        ml: -1,
        borderRadius: `${theme.band.radius.sm}px`,
        textAlign: 'left',
        '& .edit': { opacity: 0.35 },
        '&:hover, &:focus-visible': { bgcolor: theme.brand.subtle, '& .edit': { opacity: 1 } },
      })}
    >
      <Typography variant="body2" component="span" sx={{ lineHeight: 1.3 }}>
        {teacher}
      </Typography>
      <Box className="edit" sx={{ display: 'flex', color: 'text.secondary', flexShrink: 0 }}>
        <Pencil size={13} aria-hidden />
      </Box>
    </ButtonBase>
  );
}

// What a class or one section studies and who teaches it: a section-by-subject matrix for a class, a table for one section.
export function ClassSubjects({
  yearId,
  row,
  sectionId,
  editable,
  base,
  personaSlug,
}: {
  yearId: string;
  row: StructureClass;
  sectionId?: string;
  editable: boolean;
  base: StructureBase;
  personaSlug: string;
}): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useClassSubjects(yearId, row.grade_level_id);
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const [adding, setAdding] = React.useState(false);
  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const single = Boolean(sectionId) || row.undivided;
  const subjects = data
    .map((s) => ({ ...s, sections: sectionId ? s.sections.filter((x) => x.section_id === sectionId) : s.sections }))
    .filter((s) => s.sections.length > 0)
    .sort((a, b) => Number(a.elective) - Number(b.elective) || a.subject.localeCompare(b.subject));
  const label = (letter: string): string => (row.undivided ? row.name : shortSection(row.name, letter));
  const browse = (offeringId: string, section: string): string => paths.personaSection(personaSlug, `sections/${row.grade_level_id}/${section}/subjects/${offeringId}`);
  const sectionIds = sectionId ? [sectionId] : row.undivided && row.whole ? [row.whole.id] : row.sections.map((s) => s.id);
  const missing = subjects.reduce((t, s) => t + s.sections.filter((x) => !x.teacher).length, 0);

  return (
    <Card>
      <CardHeader
        title="Subjects"
        subheader={`${subjects.filter((s) => !s.elective).length} core · ${subjects.filter((s) => s.elective).length} elective${missing > 0 ? ` · ${missing} without a teacher` : ' · every subject has a teacher'}`}
        action={
          editable ? (
            <Button size="small" variant="outlined" startIcon={<Plus size={14} />} onClick={() => setAdding(true)}>
              Add Subject
            </Button>
          ) : null
        }
      />
      {subjects.length === 0 ? (
        <EmptyState title="Nothing is taught here yet" body="Add the subjects this class studies; each is then given a teacher." />
      ) : single ? (
        <TableContainer sx={{ border: 0, borderRadius: 0 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Subject</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Periods a week</TableCell>
                <TableCell>Teacher</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {subjects.map((s) => {
                const x = s.sections[0];
                if (!x) return null;
                return (
                  <TableRow key={s.subject} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{s.subject}</Typography>
                    </TableCell>
                    <TableCell>
                      <TypeChip elective={s.elective} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {s.periods}
                    </TableCell>
                    <TableCell>
                      {x.teacher ? (
                        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                          <Avatar name={x.teacher} size={28} />
                          <Typography variant="body2">{x.teacher}</Typography>
                        </Stack>
                      ) : (
                        <EmergeChip label="No teacher" tone="amber" dot />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        {editable ? (
                          <Button size="small" variant={x.teacher ? 'outlined' : 'contained'} startIcon={x.teacher ? <Pencil size={14} /> : <UserPlus size={14} />} onClick={() => setPicked({ subject: s, section: x })}>
                            {x.teacher ? 'Change teacher' : 'Assign teacher'}
                          </Button>
                        ) : null}
                        <Button size="small" variant="outlined" endIcon={<ArrowRight size={14} />} component={NextLink} href={browse(x.offering_id, x.section_id)}>
                          Open subject
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <TableContainer sx={{ border: 0, borderRadius: 0 }}>
          <Table sx={{ minWidth: 900, tableLayout: 'fixed', '& td, & th': { px: 1.5 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 72 }}>Section</TableCell>
                {subjects.map((s) => (
                  <TableCell key={s.subject} sx={{ verticalAlign: 'bottom' }}>
                    <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
                      <Box component="span" sx={{ letterSpacing: '0.04em', lineHeight: 1.3 }}>
                        {s.subject}
                      </Box>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', textTransform: 'none', letterSpacing: 0 }}>
                        <TypeChip elective={s.elective} />
                        <Typography variant="caption" color="text.secondary">
                          {s.periods}/wk
                        </Typography>
                      </Stack>
                    </Stack>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {row.sections.map((section) => (
                <TableRow key={section.id} hover>
                  <TableCell>
                    <Link component={NextLink} href={paths.personaSection(personaSlug, sectionHref(base, row.grade_level_id, section.id))} variant="subtitle2" underline="hover" color="text.primary">
                      {label(section.name)}
                    </Link>
                  </TableCell>
                  {subjects.map((s) => {
                    const x = s.sections.find((c) => c.section_id === section.id);
                    return (
                      <TableCell key={s.subject} sx={{ py: 0.75 }}>
                        {x ? <TeacherCell teacher={x.teacher} disabled={!editable} onClick={() => setPicked({ subject: s, section: x })} /> : <Typography variant="body2" color="text.disabled">Not taught</Typography>}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {picked ? (
        <SubjectTeacherDialog
          yearId={yearId}
          subject={picked.subject.subject}
          label={label(picked.section.section)}
          offeringId={picked.section.offering_id}
          current={picked.section.teacher_id}
          browseHref={browse(picked.section.offering_id, picked.section.section_id)}
          onClose={() => setPicked(null)}
        />
      ) : null}
      {adding ? (
        <AddSubjectDialog
          yearId={yearId}
          className={sectionId && !row.undivided ? label(row.sections.find((s) => s.id === sectionId)?.name ?? '') : row.name}
          sections={sectionIds.map((id) => ({ id, label: label(row.sections.find((s) => s.id === id)?.name ?? '') }))}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </Card>
  );
}
