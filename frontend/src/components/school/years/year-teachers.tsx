'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ArrowLeftRight, CircleAlert, UserRoundMinus, UserRoundPlus, UserRoundX } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { Segmented } from '@/components/ui/segmented';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useYearTeaching } from '@/hooks/query/use-foundation';
import { formatDay } from '@/lib/dates';
import type { TeachingChange, YearSectionTeaching, YearTeacherLoad } from '@/types/foundation';
import type { AcademicSession } from '@/types/mdm';

import { FactStrip } from '@/components/ui/fact-strip';

const VIEWS = [
  { value: 'sections', label: 'By class & section' },
  { value: 'teachers', label: 'By teacher' },
  { value: 'changes', label: 'Changes' },
] as const;

type View = (typeof VIEWS)[number]['value'];

const CHANGE_ICON: Readonly<Record<TeachingChange['kind'], React.ReactElement>> = {
  joined: <UserRoundPlus size={18} aria-hidden />,
  left: <UserRoundMinus size={18} aria-hidden />,
  assigned: <UserRoundPlus size={18} aria-hidden />,
  reassigned: <ArrowLeftRight size={18} aria-hidden />,
  class_teacher: <UserRoundX size={18} aria-hidden />,
  vacant: <CircleAlert size={18} aria-hidden />,
};

const Unassigned = (): React.ReactElement => <EmergeChip label="Unassigned" tone="amber" dot />;

// One class across: its sections down, its subjects along, a teacher in each cell.
export function SectionMatrix({ rows }: { rows: readonly YearSectionTeaching[] }): React.ReactElement {
  const subjects = [...new Set(rows.flatMap((row) => row.subjects.map((s) => s.subject)))].sort();
  return (
    <TableContainer>
      <Table size="small" sx={{ minWidth: 640 }}>
        <TableHead>
          <TableRow>
            <TableCell>Section</TableCell>
            <TableCell>Class teacher</TableCell>
            {subjects.map((subject) => (
              <TableCell key={subject}>{subject}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.section_id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Typography variant="subtitle2" component="span">
                  {row.class_name} {row.section_name}
                </Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.class_teacher ?? <Unassigned />}</TableCell>
              {subjects.map((subject) => {
                const cell = row.subjects.find((s) => s.subject === subject);
                return (
                  <TableCell key={subject} sx={{ whiteSpace: 'nowrap' }}>
                    {cell === undefined ? (
                      <Typography component="span" variant="body2" color="text.disabled">
                        —
                      </Typography>
                    ) : (
                      (cell.teacher ?? <Unassigned />)
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function TeacherRows({ rows, yearStart }: { rows: readonly YearTeacherLoad[]; yearStart: string }): React.ReactElement {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Teacher</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Class teacher of</TableCell>
            <TableCell>Teaches</TableCell>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>In the year</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.teacher_id} hover>
              <TableCell sx={{ verticalAlign: 'top' }}>
                <Typography variant="subtitle2" component="p">
                  {row.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {row.specialization ?? 'No specialisation recorded'}
                </Typography>
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, verticalAlign: 'top', color: row.class_teacher_of ? 'text.primary' : 'text.secondary' }}>{row.class_teacher_of ?? 'None'}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {row.assignments.map((a) => (
                    <Chip key={`${a.section}-${a.subject}`} size="small" label={`${a.section} · ${a.subject}`} />
                  ))}
                </Stack>
              </TableCell>
              <TableCell sx={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                {row.left ? <EmergeChip label={`Left ${formatDay(row.left)}`} tone="grey" /> : row.joined ? <EmergeChip label={`Joined ${formatDay(row.joined)}`} tone="blue" /> : <Typography variant="body2" color="text.secondary">Since {formatDay(yearStart)}</Typography>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// Who teaches what in this year, from the class's side and from the teacher's, and every change along the way.
export function YearTeachers({ year }: { year: AcademicSession }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useYearTeaching(year.id);
  const [view, setView] = React.useState<View>('sections');
  const [gradeId, setGradeId] = React.useState('');
  const [search, setSearch] = React.useState('');

  if (isPending) return <WidgetLoading rows={6} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;

  const classes = [...new Map(data.by_section.map((row) => [row.class_name, row])).values()];
  const grade = gradeId || classes[0]?.class_name || '';
  const sections = data.by_section.filter((row) => row.class_name === grade);
  const needle = search.trim().toLowerCase();
  const teachers = data.by_teacher.filter((row) => needle === '' || row.name.toLowerCase().includes(needle) || row.assignments.some((a) => `${a.section} ${a.subject}`.toLowerCase().includes(needle)));
  const untaught = data.assignments.total - data.assignments.value;

  return (
    <Stack spacing={2}>
      <FactStrip
        facts={[
          { label: 'Teachers this year', value: data.teachers ?? 'None', note: data.teachers === null ? 'No teaching recorded' : undefined },
          { label: 'Class teachers', value: `${data.class_teachers.value} of ${data.class_teachers.total}`, note: 'Sections with one' },
          { label: 'Subjects with a teacher', value: `${data.assignments.value} of ${data.assignments.total}`, note: untaught > 0 ? `${untaught} unassigned` : undefined },
          { label: 'Changes', value: data.changes.length, note: 'Joins, leaves and moves' },
        ]}
      />

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <CardToolbar start={<Segmented ariaLabel="Which side to see teaching from" value={view} onChange={setView} options={VIEWS} />}>
              {view === 'sections' ? (
                <TextField select size="small" label="Class" value={grade} onChange={(event) => setGradeId(event.target.value)} sx={{ minWidth: 140 }}>
                  {classes.map((row) => (
                    <MenuItem key={row.class_name} value={row.class_name}>
                      {row.class_name}
                    </MenuItem>
                  ))}
                </TextField>
              ) : null}
              {view === 'teachers' ? <SearchField label="Search teachers or classes" value={search} onChange={setSearch} width={260} /> : null}
            </CardToolbar>

            {view === 'sections' ? (
              sections.length === 0 ? (
                <EmptyState title="No teaching recorded" body="Sections and their subjects appear here once the year has classes." />
              ) : (
                <SectionMatrix rows={sections} />
              )
            ) : null}

            {view === 'teachers' ? (
              teachers.length === 0 ? (
                <EmptyState title={needle ? 'No teacher matches.' : 'No teaching recorded'} body={needle ? undefined : 'Teachers appear here once subjects are assigned to them.'} />
              ) : (
                <TeacherRows rows={teachers} yearStart={(year.start_date ?? '').slice(0, 10)} />
              )
            ) : null}

            {view === 'changes' ? (
              data.changes.length === 0 ? (
                <EmptyState title="No staffing changes recorded" body="Joins, leaves and reassignments during the year are listed here." />
              ) : (
                <List disablePadding>
                  {data.changes.map((change, index) => (
                    <ListItem key={change.id} disableGutters divider={index < data.changes.length - 1} sx={{ alignItems: 'flex-start', gap: 2, py: 1.5 }}>
                      <Box sx={(theme) => ({ display: 'grid', placeItems: 'center', width: 40, height: 40, flex: 'none', borderRadius: '999px', bgcolor: change.kind === 'vacant' ? theme.tints.amber : theme.tints.grey, color: change.kind === 'vacant' ? theme.onTint.amber : theme.onTint.grey })}>
                        {CHANGE_ICON[change.kind]}
                      </Box>
                      <ListItemText
                        primary={change.title}
                        secondary={
                          <Stack component="span" spacing={0.25} sx={{ mt: 0.5 }}>
                            {change.impact.map((line) => (
                              <Typography key={line} component="span" variant="body2" color="text.secondary">
                                {line}
                              </Typography>
                            ))}
                          </Stack>
                        }
                        slotProps={{ primary: { variant: 'subtitle1' }, secondary: { component: 'span' } }}
                        sx={{ my: 0 }}
                      />
                      <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', pt: 0.5 }}>
                        {formatDay(change.date)}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              )
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
