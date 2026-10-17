'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
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
import { Plus } from 'lucide-react';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import {
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import { MdmDialog, MdmFormError } from '../mdm/mdm-dialog';
import { SchoolScopeBar, useSchoolScope } from '../school-scope';
import { useUrlState } from '../url-state';
import { ComponentDialog } from './component-dialog';
import { SchemeDialog } from './scheme-dialog';
import { SourcesDialog } from './sources-dialog';
import { useResultGrants } from './result-grants';
import {
  useComponentSources,
  useResultComponents,
  useResultSchemes,
} from '@/hooks/query/use-result-schemes';
import { useReviseResultScheme } from '@/hooks/mutation/use-result-schemes';
import {
  AGGREGATION_LABELS,
  activationBlockers,
  compose,
  compositionLine,
  formatMarks,
  NO_SOURCES,
  nextPosition,
  sourcesLine,
} from '@/lib/school/result-composition';
import type { ResultComponent, ResultScheme } from '@/types/result-scheme';

const STATUS_TONE: Record<string, ChipTone> = {
  draft: 'amber',
  active: 'green',
  inactive: 'grey',
};

function schemeLabel(scheme: ResultScheme): string {
  const name = scheme.name ?? scheme.id;
  return scheme.code ? `${name} (${scheme.code})` : name;
}

export function ResultSchemesBoard(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();
  const grants = useResultGrants();

  const schemes = useResultSchemes(scope.sessionId);
  const schemeRows = React.useMemo(() => schemes.data ?? [], [schemes.data]);

  const chosen = get('rscheme');
  const schemeId =
    schemeRows.find((row) => row.id === chosen)?.id ?? schemeRows[0]?.id ?? null;
  const scheme = schemeRows.find((row) => row.id === schemeId);

  const components = useResultComponents(schemeId);
  const componentRows = React.useMemo(
    () =>
      [...(components.data ?? [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
      ),
    [components.data],
  );
  const sources = useComponentSources(componentRows);
  const sourcesOf = (id: string) => sources.byComponent.get(id) ?? NO_SOURCES;

  const [editingScheme, setEditingScheme] = React.useState<ResultScheme | 'new' | null>(
    null,
  );
  const [editingComponent, setEditingComponent] = React.useState<
    ResultComponent | 'new' | null
  >(null);
  const [sourcesFor, setSourcesFor] = React.useState<ResultComponent | null>(null);
  const [successor, setSuccessor] = React.useState<ResultScheme | null>(null);

  const activate = useReviseResultScheme();

  const composition = compose(scheme?.total_marks, componentRows);
  const draft = scheme?.status === 'draft';
  const blockers = activationBlockers(composition, componentRows, sourcesOf);
  const filled = composition.total === 0 ? 0 : (composition.allocated / composition.total) * 100;

  const onSaved = (saved: ResultScheme, superseded: boolean): void => {
    put({ rscheme: saved.id });
    setSuccessor(superseded ? saved : null);
    setEditingScheme(null);
  };

  return (
    <>
      <Stack spacing={2.5}>
        <SchoolScopeBar scope={scope} showScheme={false} />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
        >
          {schemeRows.length > 0 ? (
            <TextField
              select
              size="small"
              label="Result scheme"
              value={schemeId ?? ''}
              onChange={(event) => {
                put({ rscheme: event.target.value });
                setSuccessor(null);
                activate.reset();
              }}
              sx={{ minWidth: 280 }}
            >
              {schemeRows.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {schemeLabel(row)}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <span />
          )}

          {grants.mayWrite ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={16} />}
              onClick={() => setEditingScheme('new')}
              disabled={!scope.sessionId}
            >
              New result scheme
            </Button>
          ) : null}
        </Stack>

        {successor ? (
          <Alert
            severity="info"
            variant="outlined"
            onClose={() => setSuccessor(null)}
          >
            <AlertTitle>Saved as a new scheme</AlertTitle>
            {schemeLabel(successor)} now holds the change. The scheme it replaces
            already composed a subject&apos;s result, so editing it would have changed
            what a mark already means. Point the subject at this one when you are ready.
          </Alert>
        ) : null}

        {schemes.isPending && scope.sessionId ? <WidgetLoading rows={4} /> : null}
        {schemes.isError ? (
          <WidgetError error={schemes.error} onRetry={() => void schemes.refetch()} />
        ) : null}
        {!scope.sessionId && !scope.isPending ? (
          <Alert severity="info" variant="outlined">
            This school has no academic year yet, so there is nothing for a result to
            be composed within.
          </Alert>
        ) : null}
        {schemes.data && schemeRows.length === 0 ? (
          <WidgetEmpty message="No result scheme exists for this year. A scheme says what a subject's marks are made of — a half-yearly out of 40 carrying 20, four class tests where the best two count, and so on." />
        ) : null}

        {scheme ? (
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={2.5}>
                <SectionHeader
                  title={scheme.name ?? 'Result scheme'}
                  subtitle={
                    scheme.description ??
                    `Out of ${formatMarks(composition.total)}, in ${schemeRows.length === 1 ? 'this year' : 'the current year'}.`
                  }
                  actions={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <EmergeChip
                        label={scheme.status ?? 'draft'}
                        tone={STATUS_TONE[scheme.status ?? 'draft'] ?? 'grey'}
                      />
                      {grants.mayWrite ? (
                        <Button size="small" onClick={() => setEditingScheme(scheme)}>
                          Edit
                        </Button>
                      ) : null}
                    </Stack>
                  }
                />

                <Box>
                  <Typography
                    variant="body2"
                    aria-live="polite"
                    sx={{ fontWeight: 700, mb: 0.75 }}
                  >
                    {compositionLine(composition)}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, Math.max(0, filled))}
                    color={composition.balanced ? 'success' : 'primary'}
                    aria-label={`Marks accounted for out of ${formatMarks(composition.total)}`}
                  />
                </Box>

                {!draft ? (
                  <Alert severity="info" variant="outlined">
                    This scheme is {scheme.status ?? 'not a draft'}, so what its parts
                    are worth is settled and they cannot be changed. Return it to draft,
                    or save it under a new code to supersede it.
                  </Alert>
                ) : null}

                {draft && blockers.length > 0 ? (
                  <Alert severity="warning" variant="outlined">
                    <AlertTitle>Not ready to activate</AlertTitle>
                    <Stack component="ul" spacing={0.5} sx={{ pl: 2, m: 0 }}>
                      {blockers.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </Stack>
                  </Alert>
                ) : null}

                {components.isPending && schemeId ? <WidgetLoading rows={3} /> : null}
                {components.isError ? (
                  <WidgetError
                    error={components.error}
                    onRetry={() => void components.refetch()}
                  />
                ) : null}

                {components.data && componentRows.length === 0 ? (
                  <WidgetEmpty message="This scheme has no parts yet. Add the first one and the running total above starts filling." />
                ) : null}

                {componentRows.length > 0 ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Part</TableCell>
                          <TableCell align="right">Marked out of</TableCell>
                          <TableCell align="right">Carries</TableCell>
                          <TableCell>Combines</TableCell>
                          <TableCell>Fed by</TableCell>
                          <TableCell align="right">Change</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {componentRows.map((row) => (
                          <TableRow key={row.id} hover>
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
                              {row.weight === undefined ? '—' : formatMarks(row.weight)}
                            </TableCell>
                            <TableCell>
                              {AGGREGATION_LABELS[row.aggregation ?? 'single']}
                              {row.aggregation === 'best_of' && row.take_best !== undefined
                                ? ` ${row.take_best}`
                                : ''}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                onClick={() => setSourcesFor(row)}
                                sx={{ textTransform: 'none' }}
                              >
                                {sources.isPending
                                  ? 'counting…'
                                  : sourcesLine(sourcesOf(row.id))}
                              </Button>
                            </TableCell>
                            <TableCell align="right">
                              {grants.mayWrite && draft ? (
                                <Button
                                  size="small"
                                  onClick={() => setEditingComponent(row)}
                                >
                                  Edit
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : null}

                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  sx={{ justifyContent: 'space-between' }}
                >
                  {grants.mayWrite && draft ? (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Plus size={16} />}
                      onClick={() => setEditingComponent('new')}
                    >
                      Add a part
                    </Button>
                  ) : (
                    <span />
                  )}

                  {grants.mayWrite && draft ? (
                    <Stack spacing={1} sx={{ alignItems: 'flex-end' }}>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={activate.isPending}
                        onClick={() =>
                          activate.mutate({
                            id: scheme.id,
                            patch: { status: 'active' },
                          })
                        }
                      >
                        Activate this scheme
                      </Button>
                      <MdmFormError error={activate.error} />
                    </Stack>
                  ) : null}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </Stack>

      <MdmDialog
        open={editingScheme !== null}
        onClose={() => setEditingScheme(null)}
        formKey={editingScheme === 'new' ? 'new' : (editingScheme?.id ?? 'none')}
        maxWidth="sm"
      >
        <SchemeDialog
          scheme={editingScheme === 'new' ? undefined : (editingScheme ?? undefined)}
          sessionId={scope.sessionId}
          mayDelete={grants.mayDelete}
          onClose={() => setEditingScheme(null)}
          onSaved={onSaved}
          onDeleted={() => {
            put({ rscheme: null });
            setEditingScheme(null);
          }}
        />
      </MdmDialog>

      <MdmDialog
        open={editingComponent !== null && schemeId !== null}
        onClose={() => setEditingComponent(null)}
        formKey={editingComponent === 'new' ? 'new' : (editingComponent?.id ?? 'none')}
        maxWidth="sm"
      >
        {schemeId ? (
          <ComponentDialog
            component={
              editingComponent === 'new' ? undefined : (editingComponent ?? undefined)
            }
            schemeId={schemeId}
            totalMarks={composition.total}
            weightOfOthers={
              composition.allocated -
              (editingComponent && editingComponent !== 'new'
                ? (editingComponent.weight ?? 0)
                : 0)
            }
            defaultPosition={nextPosition(componentRows)}
            mayDelete={grants.mayDelete}
            onClose={() => setEditingComponent(null)}
          />
        ) : null}
      </MdmDialog>

      <MdmDialog
        open={sourcesFor !== null}
        onClose={() => setSourcesFor(null)}
        formKey={sourcesFor?.id ?? 'none'}
        maxWidth="md"
      >
        {sourcesFor ? (
          <SourcesDialog
            component={sourcesFor}
            sessionId={scope.sessionId}
            branchId={scope.branchId}
            frozen={!draft}
            mayWrite={grants.mayWrite}
            mayDelete={grants.mayDelete}
            mayReadExams={grants.mayReadExams}
            mayReadAssignments={grants.mayReadAssignments}
            onClose={() => setSourcesFor(null)}
          />
        ) : null}
      </MdmDialog>
    </>
  );
}
