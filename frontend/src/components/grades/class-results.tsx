'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
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
import { ChevronDown, ChevronRight } from 'lucide-react';

import { useUrlState } from '@/components/school/url-state';
import {
  WidgetDegraded,
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import { useOfferingResults } from '@/hooks/query/use-offering-results';
import { usePaperRoster } from '@/hooks/query/use-paper-roster';
import { useAllOfferings } from '@/hooks/query/use-school';
import { useReach } from '@/hooks/query/use-reach';
import { nameOf, personOf } from '@/lib/core/roster';
import { rollLine } from '@/lib/classroom/roll';
import { compositionGaps, refusalOf } from '@/lib/results/outcome';
import { offeringLabel, sectionLabel } from '@/lib/school/names';
import { RESULT_ROSTER_PAGE } from '@/services/results';
import type { PaperRosterRow } from '@/lib/exams/paper-roster';
import type { SchoolOfferingRow } from '@/types/school';

import { ResultBreakdown, ResultScore } from './result-breakdown';

const WITHHELD_NAME = 'Name not shown to you';

export function ClassResults(): React.ReactElement {
  const { get, put } = useUrlState();
  const offeringId = get('offering');

  const offerings = useAllOfferings(true);
  const reach = useReach();
  // A teacher reads results for what they teach, and every subject of a section they lead.
  const offeringRows = React.useMemo(
    () => (offerings.data ?? []).filter((row) => reach?.kind !== 'teaching' || reach.offerings.has(row.id) || reach.led.has(row.section_id ?? row.edges?.section?.id ?? '')),
    [offerings.data, reach],
  );
  const offering = offeringRows.find((row) => row.id === offeringId);
  const sectionId = offering?.section_id ?? offering?.edges?.section?.id ?? null;

  const results = useOfferingResults(offeringId);
  const roster = usePaperRoster(offeringId, sectionId);

  const [open, setOpen] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState(offeringId ?? '');
  if (scope !== (offeringId ?? '')) {
    setScope(offeringId ?? '');
    setOpen(null);
  }

  const rosterById = React.useMemo(() => {
    const out = new Map<string, PaperRosterRow>();
    for (const row of roster.rows) out.set(row.studentId, row);
    return out;
  }, [roster.rows]);

  const refusal = refusalOf(results.error);
  const gaps = compositionGaps(results.data?.composition ?? refusal?.composition);

  return (
    <Stack spacing={2.5}>
      <TextField
        select
        size="small"
        label="Subject"
        value={offerings.data ? (offering?.id ?? '') : ''}
        disabled={!offerings.data || offeringRows.length === 0}
        onChange={(event) => put({ offering: event.target.value })}
        sx={{ maxWidth: 420 }}
      >
        {offeringRows.map((row) => (
          <MenuItem key={row.id} value={row.id}>
            {subjectLine(row)}
          </MenuItem>
        ))}
      </TextField>

      {offerings.isPending ? <WidgetLoading rows={1} /> : null}
      {offerings.isError ? (
        <WidgetError error={offerings.error} onRetry={() => void offerings.refetch()} />
      ) : null}
      {offerings.data && offeringRows.length === 0 ? (
        <WidgetEmpty message="No subject here is one you may open." />
      ) : null}

      {!offeringId ? (
        <WidgetEmpty message="Choose a subject to see what everyone taking it has scored." />
      ) : null}

      {offeringId && results.isPending ? <WidgetLoading rows={6} /> : null}

      {refusal ? (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>No result can be computed for this subject</AlertTitle>
          {refusal.message}
        </Alert>
      ) : null}

      {offeringId && results.isError && !refusal ? (
        <WidgetError error={results.error} onRetry={() => void results.refetch()} />
      ) : null}

      {results.data && !results.data.composed ? (
        <WidgetEmpty message={results.data.reason ?? 'This subject has no result scheme.'} />
      ) : null}

      {gaps.components.length > 0 ? (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>Part of the scheme is not set for this subject</AlertTitle>
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
            {gaps.components.map((gap) => (
              <Typography component="li" variant="body2" key={gap.id}>
                <strong>{gap.name}</strong> carries {gap.weight}: {gap.reason}
              </Typography>
            ))}
          </Stack>
        </Alert>
      ) : null}

      {gaps.sources.length > 0 ? (
        <Alert severity="info" variant="outlined">
          <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2.5 }}>
            {gaps.sources.map((gap) => (
              <Typography
                component="li"
                variant="body2"
                key={`${gap.result_component_id}:${gap.ref.id}`}
              >
                <strong>{gap.label ?? gap.ref.kind}</strong> feeds {gap.component}:{' '}
                {gap.reason}
              </Typography>
            ))}
          </Stack>
        </Alert>
      ) : null}

      {results.data?.composed && results.data.results.length === 0 ? (
        <WidgetEmpty message="Nobody is actively enrolled in this subject, so there is no result to compute." />
      ) : null}

      {results.data?.composed && results.data.results.length > 0 ? (
        <>
          {roster.isEmptyFailure ? (
            <WidgetDegraded
              error={roster.takersError}
              denied="You may not read this school's roll, so the results below are listed against admission ids rather than names."
              unavailable="The roll could not be loaded, so the results below are listed against admission ids rather than names."
            />
          ) : null}
          {!roster.isEmptyFailure && roster.studentsError ? (
            <WidgetDegraded
              error={roster.studentsError}
              denied="You may not read this school's student records, so these rows carry roll numbers and no names."
              unavailable="Student records could not be loaded, so these rows carry roll numbers and no names."
            />
          ) : null}

          {results.data.page?.has_more ? (
            <Alert severity="warning" variant="outlined">
              This class is longer than the {RESULT_ROSTER_PAGE} rows one page carries,
              so not everybody is shown.
            </Alert>
          ) : null}

          <TableContainer>
            <Table size="small" aria-label="What each pupil has scored in this subject">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 64 }}>Roll</TableCell>
                  <TableCell>Pupil</TableCell>
                  <TableCell sx={{ width: 260 }}>Result</TableCell>
                  <TableCell sx={{ width: 56 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {results.data.results.map((pupil) => {
                  const entry = rosterById.get(pupil.student_id);
                  const person = entry?.entry.student
                    ? personOf('students', entry.entry.student)
                    : null;
                  const name =
                    person?.status === 'present'
                      ? (nameOf(person.person) ?? WITHHELD_NAME)
                      : WITHHELD_NAME;
                  const secondary = entry ? rollLine(entry.entry) : null;
                  const expanded = open === pupil.student_id;
                  const panelId = `result-${pupil.student_id}`;

                  return (
                    <React.Fragment key={pupil.student_id}>
                      <TableRow>
                        <TableCell>
                          <Typography
                            variant="body2"
                            sx={{ fontVariantNumeric: 'tabular-nums' }}
                          >
                            {entry?.entry.enrollment?.roll_number ?? '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {name}
                          </Typography>
                          {secondary ? (
                            <Typography variant="caption" color="text.secondary">
                              {secondary}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <ResultScore pupil={pupil} gaps={gaps} />
                        </TableCell>
                        <TableCell>
                          <IconButton
                            size="small"
                            aria-expanded={expanded}
                            aria-controls={panelId}
                            aria-label={`Why ${name} scored this`}
                            onClick={() =>
                              setOpen(expanded ? null : pupil.student_id)
                            }
                          >
                            {expanded ? (
                              <ChevronDown size={18} />
                            ) : (
                              <ChevronRight size={18} />
                            )}
                          </IconButton>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}
                        >
                          <Collapse in={expanded} unmountOnExit>
                            <Box id={panelId} sx={{ py: 2 }}>
                              <ResultBreakdown
                                pupil={pupil}
                                composition={gaps}
                                showGaps={false}
                              />
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : null}
    </Stack>
  );
}

function subjectLine(offering: SchoolOfferingRow): string {
  return `${offeringLabel(offering)} · ${sectionLabel(offering.edges?.section)}`;
}
