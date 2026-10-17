'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { useResultGrants } from '@/components/school/results/result-grants';
import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import {
  WidgetDegraded,
  WidgetEmpty,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import {
  NO_LINKS,
  useComponentLinks,
  useResultComponents,
  useResultSchemes,
  useSessionAssignments,
  useSessionExams,
  type ComponentLinks,
} from '@/hooks/query/use-result-schemes';
import {
  AGGREGATION_LABELS,
  compose,
  formatMarks,
  sourcesLine,
} from '@/lib/school/result-composition';
import type { AssignmentRow } from '@/types/classroom';
import type { ExamRow, ResultComponent } from '@/types/result-scheme';

import type { ScopeState } from './scope-state';

const STATUS_TONE: Record<string, ChipTone> = {
  draft: 'amber',
  active: 'green',
  inactive: 'grey',
};

const STATUS_NOTE: Record<string, string> = {
  draft:
    'This breakdown is still a draft, so it is not yet what this subject is marked by.',
  inactive: 'This breakdown is no longer in force for this subject.',
};

export function ResultCompositionCard({
  resultSchemeId,
  sessionId,
  scopeState,
}: {
  resultSchemeId: string | undefined;
  sessionId: string | undefined;
  scopeState: ScopeState;
}): React.ReactElement | null {
  const grants = useResultGrants();

  const schemes = useResultSchemes(resultSchemeId ? (sessionId ?? null) : null);
  const scheme = React.useMemo(
    () => (schemes.data ?? []).find((row) => row.id === resultSchemeId),
    [schemes.data, resultSchemeId],
  );

  const components = useResultComponents(scheme?.id ?? null);
  const componentRows = React.useMemo(
    () =>
      [...(components.data ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
      ),
    [components.data],
  );

  const links = useComponentLinks(componentRows);
  const linksOf = (id: string): ComponentLinks => links.byComponent.get(id) ?? NO_LINKS;

  const anyExams = componentRows.some((row) => linksOf(row.id).exams.length > 0);
  const anyAssignments = componentRows.some(
    (row) => linksOf(row.id).assignments.length > 0,
  );

  const exams = useSessionExams(
    anyExams && grants.mayReadExams ? (sessionId ?? null) : null,
    null,
  );
  const assignments = useSessionAssignments(
    anyAssignments && grants.mayReadAssignments ? (sessionId ?? null) : null,
  );

  const examsById = React.useMemo(
    () => new Map((exams.data ?? []).map((row) => [row.id, row])),
    [exams.data],
  );
  const assignmentsById = React.useMemo(
    () => new Map((assignments.data ?? []).map((row) => [row.id, row])),
    [assignments.data],
  );

  if (scopeState === 'failed') return null;
  if (scopeState === 'pending') return <WidgetLoading rows={3} />;

  if (!resultSchemeId) {
    return (
      <WidgetEmpty message="No breakdown of marks is attached to this subject, so its marks are not split into parts." />
    );
  }

  if (!sessionId) {
    return (
      <WidgetEmpty message="The academic year of this subject is not known here, so its breakdown of marks cannot be looked up." />
    );
  }

  if (schemes.isError) {
    return (
      <WidgetDegraded
        error={schemes.error}
        denied="This account cannot read result schemes, so what this subject's marks are made of is not shown."
        unavailable="Result schemes could not be loaded, so what this subject's marks are made of is not shown."
      />
    );
  }
  if (schemes.isPending) return <WidgetLoading rows={3} />;
  if (!scheme) {
    return (
      <WidgetEmpty message="The breakdown of marks attached to this subject is not among this year's result schemes, so it cannot be shown." />
    );
  }

  const composition = compose(scheme.total_marks, componentRows);
  const status = scheme.status ?? 'draft';
  const note = STATUS_NOTE[status];
  const namesMissing = exams.isError || assignments.isError;

  const share = (weight: number): string | null =>
    composition.total > 0
      ? `${formatMarks((weight / composition.total) * 100)}% of the total`
      : null;

  const totalLine = composition.balanced
    ? `The parts add up to the ${formatMarks(composition.total)} marks this subject is out of.`
    : `The parts add up to ${formatMarks(composition.allocated)}, not the ${formatMarks(composition.total)} this breakdown is out of.`;

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={1.5}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexWrap: 'wrap' }}
          >
            <Typography variant="h4" component="h3">
              {scheme.name ?? scheme.code ?? 'Breakdown of marks'}
            </Typography>
            <EmergeChip label={status} tone={STATUS_TONE[status] ?? 'grey'} dot />
          </Stack>

          {scheme.description ? (
            <Typography variant="body2" color="text.secondary">
              {scheme.description}
            </Typography>
          ) : null}

          <Typography variant="body2">
            What the {formatMarks(composition.total)} marks of this subject are made of.
          </Typography>

          {note ? (
            <Alert severity="info" variant="outlined">
              {note}
            </Alert>
          ) : null}

          {components.isPending ? <WidgetLoading rows={3} /> : null}
          {components.isError ? (
            <WidgetDegraded
              error={components.error}
              denied="This account cannot read the parts of this scheme, so the breakdown is not shown."
              unavailable="The parts of this scheme could not be loaded, so the breakdown is not shown."
            />
          ) : null}

          {components.data && componentRows.length === 0 ? (
            <WidgetEmpty message="This breakdown has no parts recorded yet, so the marks are not split up." />
          ) : null}

          {componentRows.length > 0 ? (
            <>
              <TableContainer>
                <Table
                  size="small"
                  aria-label={`What the ${formatMarks(composition.total)} marks of this subject are made of`}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell>Part</TableCell>
                      <TableCell align="right">Marked out of</TableCell>
                      <TableCell align="right">Carries</TableCell>
                      <TableCell>Combines</TableCell>
                      <TableCell>Fed by</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {componentRows.map((row) => {
                      const linked = linksOf(row.id);
                      const weight = row.weight;
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>
                              {row.name ?? 'Unnamed part'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {row.maximum_marks === undefined
                              ? '—'
                              : formatMarks(row.maximum_marks)}
                          </TableCell>
                          <TableCell align="right">
                            {weight === undefined ? '—' : formatMarks(weight)}
                            {weight !== undefined && share(weight) ? (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block' }}
                              >
                                {share(weight)}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {combinesLine(row, sourceCountOf(linked))}
                          </TableCell>
                          <TableCell>
                            {links.isPending
                              ? 'counting…'
                              : fedByLine(linked, examsById, assignmentsById)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Total
                        </Typography>
                      </TableCell>
                      <TableCell />
                      <TableCell align="right">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {formatMarks(composition.allocated)} of{' '}
                          {formatMarks(composition.total)}
                        </Typography>
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableContainer>

              <Typography variant="body2" color="text.secondary">
                {totalLine}
              </Typography>

              {namesMissing ? (
                <Typography variant="caption" color="text.secondary">
                  The exams and assignments behind each part are not named here, so they
                  are counted instead.
                </Typography>
              ) : null}
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

function sourceCountOf(linked: ComponentLinks): number {
  return linked.exams.length + linked.assignments.length;
}

function combinesLine(row: ResultComponent, linked: number): string {
  if (row.aggregation === 'best_of') {
    if (row.take_best === undefined) return AGGREGATION_LABELS.best_of ?? 'Best of';
    return linked > 0 ? `Best ${row.take_best} of ${linked}` : `Best ${row.take_best}`;
  }
  return AGGREGATION_LABELS[row.aggregation ?? 'single'] ?? 'One sitting';
}

function fedByLine(
  linked: ComponentLinks,
  examsById: ReadonlyMap<string, ExamRow>,
  assignmentsById: ReadonlyMap<string, AssignmentRow>,
): string {
  const names: string[] = [];
  let unnamed = 0;

  for (const link of linked.exams) {
    const exam = link.exam_id ? examsById.get(link.exam_id) : undefined;
    if (exam) names.push(exam.name ?? exam.code ?? exam.id);
    else unnamed += 1;
  }
  for (const link of linked.assignments) {
    const assignment = link.assignment_id
      ? assignmentsById.get(link.assignment_id)
      : undefined;
    if (assignment) names.push(assignment.title ?? assignment.id);
    else unnamed += 1;
  }

  const tally = { exams: linked.exams.length, assignments: linked.assignments.length };
  if (names.length === 0) return sourcesLine(tally);
  if (unnamed > 0) names.push(`${unnamed} more`);
  return names.join(', ');
}
