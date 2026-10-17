'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';

import { EmergeChip, type ChipTone } from '@/components/ui/chip';
import { Divider } from '@/components/ui/layout';
import {
  WidgetDegraded,
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import {
  useBranchSchemeBells,
  useBranchSchemeGrades,
  useGradeLevels,
  usePeriodSchemes,
} from '@/hooks/query/use-school';
import { gradeLabel, schemeLabel } from '@/lib/school/scheme-grades';
import { MdmDialog } from './mdm/mdm-dialog';
import { NewSchemeDialog } from './new-scheme-dialog';
import { PeriodsBoard } from './periods-board';
import { SchemeEditDialog } from './scheme-edit-dialog';
import { SchemeGradesBoard } from './scheme-grades-board';
import { SchoolScopeBar, useSchoolScope } from './school-scope';
import { useTimetableGrants } from './timetable-grants';
import { useUrlState } from './url-state';
import type {
  BellSchedule,
  GradeLevelRef,
  PeriodScheme,
  PeriodSchemeGradeLevel,
} from '@/types/school';

export function SchemesBoard(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();
  const grants = useTimetableGrants();

  const schemes = usePeriodSchemes(scope.branchId);
  const schemeRows = React.useMemo(() => schemes.data?.rows ?? [], [schemes.data]);
  const schemeIds = React.useMemo(() => schemeRows.map((row) => row.id), [schemeRows]);

  const levels = useGradeLevels();
  const bells = useBranchSchemeBells(schemeIds);
  const grades = useBranchSchemeGrades(schemeIds);

  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<PeriodScheme | null>(null);

  const openId = get('scheme');
  const toggle = (id: string): void =>
    put({ scheme: openId === id ? null : id, bell: null });

  const bellsOf = (id: string): BellSchedule[] =>
    bells.data?.find((row) => row.schemeId === id)?.rows ?? [];
  const gradesOf = (id: string): PeriodSchemeGradeLevel[] =>
    grades.data?.find((row) => row.schemeId === id)?.rows ?? [];

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' } }}
      >
        <SchoolScopeBar scope={scope} showScheme={false} />

        {grants.mayWrite ? (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Plus size={16} />}
            onClick={() => setCreating(true)}
          >
            New pattern
          </Button>
        ) : null}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Every shape a day takes on this campus. Open one to see the periods it is made
        of, the bell schedules that give them times, and the grades that run it.
      </Typography>

      {schemes.isPending && scope.branchId ? <WidgetLoading rows={4} /> : null}
      {schemes.isError ? (
        <WidgetError error={schemes.error} onRetry={() => void schemes.refetch()} />
      ) : null}

      {schemes.data && schemeRows.length === 0 ? (
        <WidgetEmpty
          message={`This campus has no pattern of the day yet. A pattern is the list of periods a grade runs and the bell schedules that give them times — until one exists, no timetable can be built and no grade has a day. ${
            grants.mayWrite
              ? 'Create the first one above.'
              : 'Creating one needs permission to write the timetable.'
          }`}
        />
      ) : null}

      {bells.isError ? (
        <WidgetDegraded
          error={bells.error}
          denied="The bell schedules under each pattern could not be read, so they are not summarised below. Opening a pattern still shows what it can."
          unavailable="The bell schedules under each pattern could not be loaded, so they are not summarised below. Opening a pattern still shows what it can."
        />
      ) : null}

      {grades.isError ? (
        <WidgetDegraded
          error={grades.error}
          denied="Which grades run which pattern could not be read, so no pattern is summarised by its grades below."
          unavailable="Which grades run which pattern could not be loaded, so no pattern is summarised by its grades below."
        />
      ) : null}

      {schemeRows.map((scheme) => (
        <SchemeCard
          key={scheme.id}
          scheme={scheme}
          schemes={schemeRows}
          bells={bellsOf(scheme.id)}
          bellsState={stateOf(bells.isPending, bells.isError)}
          grades={gradesOf(scheme.id)}
          gradesState={stateOf(grades.isPending, grades.isError)}
          levels={levels.data?.rows ?? []}
          open={openId === scheme.id}
          onToggle={() => toggle(scheme.id)}
          mayWrite={grants.mayWrite}
          onEdit={() => setEditing(scheme)}
        />
      ))}

      <NewSchemeDialog
        open={creating}
        onClose={() => setCreating(false)}
        schemes={schemeRows}
        levels={levels.data?.rows ?? []}
        links={grades.data}
        linksError={grades.isError ? grades.error : null}
        sessionId={scope.sessionId}
        branchId={scope.branchId}
        onCreated={(created) => put({ scheme: created.id, bell: null })}
      />

      <MdmDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        formKey={editing?.id ?? 'none'}
        maxWidth="sm"
      >
        {editing ? (
          <SchemeEditDialog
            scheme={editing}
            mayDelete={grants.mayDelete}
            onClose={() => setEditing(null)}
            onDeleted={() => {
              if (openId === editing.id) put({ scheme: null, bell: null });
              setEditing(null);
            }}
          />
        ) : null}
      </MdmDialog>
    </Stack>
  );
}

function SchemeCard({
  scheme,
  schemes,
  bells,
  bellsState,
  grades,
  gradesState,
  levels,
  open,
  onToggle,
  mayWrite,
  onEdit,
}: {
  scheme: PeriodScheme;
  schemes: readonly PeriodScheme[];
  bells: readonly BellSchedule[];
  bellsState: SummaryState;
  grades: readonly PeriodSchemeGradeLevel[];
  gradesState: SummaryState;
  levels: readonly GradeLevelRef[];
  open: boolean;
  onToggle: () => void;
  mayWrite: boolean;
  onEdit: () => void;
}): React.ReactElement {
  const panelId = `scheme-panel-${scheme.id}`;
  const inactive = scheme.status === 'inactive';

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
        >
          <Button
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            startIcon={open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            sx={{
              textTransform: 'none',
              justifyContent: 'flex-start',
              textAlign: 'left',
              minWidth: 0,
              px: 1,
            }}
          >
            <Box component="span" sx={{ minWidth: 0, display: 'block' }}>
              <Typography
                component="span"
                variant="body1"
                sx={{ fontWeight: 700, display: 'block' }}
              >
                {scheme.name ?? scheme.code ?? scheme.id}
              </Typography>
              {scheme.code ? (
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block' }}
                >
                  {scheme.code}
                </Typography>
              ) : null}
            </Box>
          </Button>

          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {inactive ? <EmergeChip label="Inactive" tone="grey" /> : null}
            <SummaryChip
              state={bellsState}
              pending="counting bells…"
              empty="No bell schedule"
              filled={bellLine(bells)}
              isEmpty={bells.length === 0}
              tone="teal"
            />
            <SummaryChip
              state={gradesState}
              pending="counting grades…"
              empty="No grade runs this"
              filled={gradeLine(grades, levels)}
              isEmpty={grades.length === 0}
              tone="indigo"
            />
            {mayWrite ? (
              <Button size="small" onClick={onEdit}>
                Edit
              </Button>
            ) : null}
          </Stack>
        </Stack>

        {scheme.description ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, px: 1 }}>
            {scheme.description}
          </Typography>
        ) : null}

        <Collapse in={open} unmountOnExit>
          <Box id={panelId} sx={{ pt: 2.5 }}>
            <Stack spacing={2.5}>
              {inactive ? (
                <Alert severity="info" variant="outlined">
                  This pattern is inactive. It is kept and still readable, and anything
                  already built on it is untouched, but it is not offered where a pattern
                  is chosen.
                </Alert>
              ) : null}

              <PeriodsBoard schemeId={scheme.id} />
              <Divider />
              <SchemeGradesBoard schemeId={scheme.id} schemes={schemes} />
            </Stack>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

type SummaryState = 'pending' | 'unknown' | 'known';

function stateOf(isPending: boolean, isError: boolean): SummaryState {
  if (isError) return 'unknown';
  return isPending ? 'pending' : 'known';
}

function SummaryChip({
  state,
  pending,
  empty,
  filled,
  isEmpty,
  tone,
}: {
  state: SummaryState;
  pending: string;
  empty: string;
  filled: string;
  isEmpty: boolean;
  tone: ChipTone;
}): React.ReactElement {
  if (state === 'pending') return <EmergeChip label={pending} tone="grey" />;
  if (state === 'unknown') return <EmergeChip label="Not read" tone="grey" />;
  return <EmergeChip label={isEmpty ? empty : filled} tone={isEmpty ? 'amber' : tone} />;
}

function bellLine(bells: readonly BellSchedule[]): string {
  return bells.map((bell) => bell.name ?? bell.code ?? 'Unnamed').join(', ');
}

function gradeLine(
  grades: readonly PeriodSchemeGradeLevel[],
  levels: readonly GradeLevelRef[],
): string {
  const named = grades.map((link) => gradeLabel(link, levels));
  if (named.length <= 4) return named.join(', ');
  return `${named.slice(0, 4).join(', ')} +${named.length - 4}`;
}
