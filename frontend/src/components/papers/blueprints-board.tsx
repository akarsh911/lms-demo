'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { Plus, X } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Divider, SectionHeader } from '@/components/ui/layout';
import { useUrlState } from '@/components/school/url-state';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useBlueprint, useBlueprints, type BlueprintScope } from '@/hooks/query/use-blueprints';
import { trimNumber } from '@/lib/exams/exam';
import { durationLabel } from '@/lib/school/time';
import {
  BLUEPRINT_STATUS_LABELS,
  BLUEPRINT_STATUS_TONES,
  CONSTRAINT_TYPE_LABELS,
  REUSABLE_TEMPLATE,
  WEIGHTAGE_CAPTIONS,
  WEIGHTAGE_LABELS,
  bandRange,
  blueprintLabel,
  blueprintSubtitle,
  constraintBound,
  constraintValues,
  sectionTally,
  sessionBinding,
  unitShare,
  unitsOf,
  weightageState,
} from '@/lib/papers/blueprint';
import { BlueprintDialog } from './blueprint-dialog';
import { BlueprintSectionDialog } from './blueprint-section-dialog';
import { ConstraintDialog } from './constraint-dialog';
import { PaperReadFailure } from './form-failure';
import { FactList, type Fact } from './fact-list';
import { usePaperGrants, type PaperGrants } from './papers-grants';
import {
  BLUEPRINT_VIEWS,
  BlueprintScopeBar,
  sessionLabel,
  usePaperSessions,
  useViewState,
  type BlueprintView,
} from './paper-scope';
import type { BlueprintRow, BlueprintSectionBlock } from '@/types/blueprints';
import type { AcademicSessionRow } from '@/types/school';

export function BlueprintsBoard(): React.ReactElement {
  const { get, put } = useUrlState();
  const grants = usePaperGrants();
  const sessions = usePaperSessions();
  const { view, setView } = useViewState<BlueprintView>(
    'patterns',
    'current',
    BLUEPRINT_VIEWS,
  );

  const scope = scopeFor(view, sessions.current?.id ?? null);
  const blueprints = useBlueprints(scope);
  const rows = blueprints.data?.rows ?? [];
  const selected = get('pattern');

  const [editing, setEditing] = React.useState<BlueprintRow | 'new' | null>(null);

  const year = sessionLabel(sessions.sessions, sessions.current?.id);

  return (
    <Stack spacing={2.5}>
      <BlueprintScopeBar
        view={view}
        onChange={setView}
        caption={captionFor(view, rows.length, year)}
        action={
          grants.mayCreateBlueprint ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={16} />}
              onClick={() => setEditing('new')}
            >
              New pattern
            </Button>
          ) : undefined
        }
      />

      {view === 'reusable' ? (
        <Alert severity="info" variant="outlined">
          A reusable pattern belongs to no academic year on purpose, so next year&rsquo;s
          papers can be built from it without copying it first.
        </Alert>
      ) : null}

      {blueprints.isPending ? <WidgetLoading rows={4} /> : null}

      {blueprints.isError ? (
        <PaperReadFailure
          error={blueprints.error}
          onRetry={() => void blueprints.refetch()}
        />
      ) : null}

      {blueprints.data && rows.length === 0 ? (
        <WidgetEmpty message={emptyFor(view)} />
      ) : null}

      {rows.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Pattern</TableCell>
                <TableCell>Year</TableCell>
                <TableCell>Marks</TableCell>
                <TableCell>Time</TableCell>
                <TableCell>Status</TableCell>
                {grants.mayWriteBlueprint ? (
                  <TableCell align="right">Edit</TableCell>
                ) : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} hover selected={row.id === selected}>
                  <TableCell>
                    <Button
                      size="small"
                      sx={{ justifyContent: 'flex-start', textAlign: 'left', px: 0.5 }}
                      onClick={() => put({ pattern: row.id })}
                    >
                      {blueprintLabel(row)}
                    </Button>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', pl: 0.5 }}
                    >
                      {blueprintSubtitle(row) ?? 'No details were recorded'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <YearCell
                      blueprint={row}
                      grants={grants}
                      sessions={sessions.sessions}
                    />
                  </TableCell>
                  <TableCell>
                    {typeof row.total_marks === 'number'
                      ? trimNumber(row.total_marks)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {typeof row.duration_minutes === 'number'
                      ? durationLabel(row.duration_minutes)
                      : 'Not stated'}
                  </TableCell>
                  <TableCell>
                    <EmergeChip
                      label={row.status ? BLUEPRINT_STATUS_LABELS[row.status] : '—'}
                      tone={row.status ? BLUEPRINT_STATUS_TONES[row.status] : 'grey'}
                    />
                  </TableCell>
                  {grants.mayWriteBlueprint ? (
                    <TableCell align="right">
                      <Button size="small" onClick={() => setEditing(row)}>
                        Edit
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {selected ? (
        <BlueprintDetail
          blueprintId={selected}
          grants={grants}
          sessions={sessions.sessions}
          onClose={() => put({ pattern: null })}
        />
      ) : null}

      <BlueprintDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        blueprint={editing === 'new' ? undefined : (editing ?? undefined)}
        sessions={sessions.sessions}
        defaultSessionId={sessions.current?.id ?? null}
        readCapability={grants.blueprintRead}
        mayDelete={grants.mayDeleteBlueprint}
        onCreated={(id) => put({ pattern: id })}
      />
    </Stack>
  );
}

function YearCell({
  blueprint,
  grants,
  sessions,
}: {
  blueprint: BlueprintRow;
  grants: PaperGrants;
  sessions: readonly AcademicSessionRow[];
}): React.ReactElement {
  const binding = sessionBinding(blueprint, grants.blueprintRead);

  if (binding === 'reusable') {
    return <EmergeChip tone="lilac" label={REUSABLE_TEMPLATE} />;
  }
  if (binding === 'withheld') {
    return (
      <Typography variant="body2" color="text.secondary">
        Not shown to you
      </Typography>
    );
  }
  return (
    <Typography variant="body2">
      {sessionLabel(sessions, blueprint.academic_session_id) ?? '—'}
    </Typography>
  );
}

function BlueprintDetail({
  blueprintId,
  grants,
  sessions,
  onClose,
}: {
  blueprintId: string;
  grants: PaperGrants;
  sessions: readonly AcademicSessionRow[];
  onClose: () => void;
}): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useBlueprint(blueprintId);
  const panel = React.useRef<HTMLDivElement>(null);
  const [addingSection, setAddingSection] = React.useState(false);
  const [constraining, setConstraining] = React.useState<BlueprintSectionBlock | null>(null);

  React.useEffect(() => {
    panel.current?.focus();
  }, [blueprintId]);

  const blueprint = data?.blueprint;
  const sectionBlocks = data?.sections ?? [];
  const nextPosition =
    sectionBlocks.reduce((top, block) => Math.max(top, block.section.position ?? 0), 0) + 1;

  const binding = blueprint ? sessionBinding(blueprint, grants.blueprintRead) : 'withheld';
  const weighting = blueprint ? weightageState(blueprint, grants.blueprintRead) : 'withheld';
  const units = unitsOf(blueprint?.unit_weightage);
  const bands = blueprint?.cognitive_scheme?.bands ?? [];

  const facts: Fact[] = blueprint
    ? [
        {
          label: 'Academic year',
          value:
            binding === 'reusable'
              ? REUSABLE_TEMPLATE
              : binding === 'withheld'
                ? 'Not shown to you'
                : (sessionLabel(sessions, blueprint.academic_session_id) ?? '—'),
          caption:
            binding === 'reusable'
              ? 'Belongs to no year, so it carries across them'
              : undefined,
        },
        {
          label: 'Unit weighting',
          value: WEIGHTAGE_LABELS[weighting],
          caption: WEIGHTAGE_CAPTIONS[weighting],
        },
        {
          label: 'Cognitive scheme',
          value: blueprint.cognitive_scheme?.name ?? 'Not shown to you',
          caption:
            bands.length > 0
              ? `${bands.length === 1 ? '1 band' : `${bands.length} bands`}`
              : undefined,
        },
      ]
    : [];

  return (
    <Box
      ref={panel}
      tabIndex={-1}
      role="region"
      aria-label="The pattern you chose"
      sx={{ outline: 'none' }}
    >
      <Box sx={{ mb: 2 }}>
        <Divider />
      </Box>

      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h4" component="h3">
              {blueprint ? blueprintLabel(blueprint) : 'Paper pattern'}
            </Typography>
            {blueprint ? (
              <Typography variant="body2" color="text.secondary">
                {blueprintSubtitle(blueprint) ?? 'No details were recorded.'}
              </Typography>
            ) : null}
            {blueprint?.description ? (
              <Typography variant="body2" sx={{ mt: 0.75 }}>
                {blueprint.description}
              </Typography>
            ) : null}
          </Box>
          <Button size="small" startIcon={<X size={16} />} onClick={onClose}>
            Close
          </Button>
        </Stack>

        {isPending ? <WidgetLoading rows={4} /> : null}

        {isError ? (
          <PaperReadFailure
            error={error}
            onRetry={() => void refetch()}
            missing="That pattern is no longer there. It may have been deleted since this list was loaded."
          />
        ) : null}

        {blueprint ? <FactList facts={facts} /> : null}

        {weighting === 'empty' ? (
          <Alert severity="warning" variant="outlined">
            <AlertTitle>A weighting that names no unit</AlertTitle>
            {WEIGHTAGE_CAPTIONS.empty}
          </Alert>
        ) : null}

        {weighting === 'listed' ? (
          <Box component="section">
            <SectionHeader
              title="Unit weighting"
              subtitle="What share of the paper each unit carries"
            />
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {units.map((unit) => (
                <Box
                  component="li"
                  key={unit.key}
                  sx={{ display: 'flex', gap: 1.5, py: 0.75, alignItems: 'baseline' }}
                >
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                    {unit.label ?? unit.key}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {unitShare(unit) ?? 'No share stated'}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}

        {bands.length > 0 ? (
          <Box component="section">
            <SectionHeader
              title={blueprint?.cognitive_scheme?.name ?? 'Cognitive scheme'}
              subtitle="The bands this scheme names, and the share each takes"
            />
            <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
              {bands.map((band) => (
                <EmergeChip
                  key={band.key}
                  tone="violet"
                  label={`${band.label || band.key}${bandRange(band) ? ` · ${bandRange(band)}` : ''}`}
                />
              ))}
            </Stack>
          </Box>
        ) : null}

        <Box component="section">
          <SectionHeader
            title="Sections"
            subtitle="How the paper is divided, and what each part must satisfy"
            actions={
              grants.mayWriteBlueprint ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Plus size={16} />}
                  onClick={() => setAddingSection(true)}
                >
                  Add a section
                </Button>
              ) : undefined
            }
          />

          {data && sectionBlocks.length === 0 ? (
            <WidgetEmpty message="This pattern has no sections yet, so it does not describe a paper." />
          ) : null}

          <Stack spacing={2.5}>
            {sectionBlocks.map((block) => (
              <Box component="section" key={block.section.id}>
                <SectionHeader
                  title={block.section.name ?? block.section.section_code ?? 'Section'}
                  subtitle={sectionTally(block.section)}
                  actions={
                    grants.mayWriteBlueprint ? (
                      <Button size="small" onClick={() => setConstraining(block)}>
                        Add a constraint
                      </Button>
                    ) : undefined
                  }
                />

                {block.constraints.length === 0 ? (
                  <WidgetEmpty message="No constraints, so any question of the right marks fits here." />
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Constrains</TableCell>
                          <TableCell>Value</TableCell>
                          <TableCell>Bounds</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {block.constraints.map((constraint) => (
                          <TableRow key={constraint.id}>
                            <TableCell>
                              {constraint.constraint_type
                                ? CONSTRAINT_TYPE_LABELS[constraint.constraint_type]
                                : '—'}
                            </TableCell>
                            <TableCell>{constraintValues(constraint) ?? 'Nothing named'}</TableCell>
                            <TableCell>{constraintBound(constraint) ?? 'None'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Box>
            ))}
          </Stack>
        </Box>
      </Stack>

      <BlueprintSectionDialog
        open={addingSection}
        onClose={() => setAddingSection(false)}
        blueprintId={blueprintId}
        nextPosition={nextPosition}
      />

      <ConstraintDialog
        open={constraining !== null}
        onClose={() => setConstraining(null)}
        sectionId={constraining?.section.id ?? null}
        sectionName={
          constraining?.section.name ?? constraining?.section.section_code ?? 'this section'
        }
      />
    </Box>
  );
}

function scopeFor(view: BlueprintView, sessionId: string | null): BlueprintScope {
  if (view === 'reusable') return 'reusable';
  if (view === 'current' && sessionId) return { sessionId };
  return 'all';
}

function captionFor(view: BlueprintView, count: number, year: string | null): string {
  const counted = count === 1 ? '1 pattern' : `${count} patterns`;
  if (view === 'reusable') return `${counted} that belong to no year`;
  if (view === 'current') return `${counted} in ${year ?? 'this academic year'}`;
  return `${counted} across every year, reusable ones included`;
}

function emptyFor(view: BlueprintView): string {
  if (view === 'reusable') {
    return 'No reusable patterns yet. One that belongs to no academic year appears here.';
  }
  if (view === 'current') {
    return 'No patterns in this year yet. A reusable one would be under the next tab.';
  }
  return 'No paper patterns have been recorded for this school yet.';
}
