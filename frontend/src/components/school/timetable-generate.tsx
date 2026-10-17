'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { queryKeys } from '@/constants/query-keys';
import { useGenerateTimetable } from '@/hooks/mutation/use-timetable-generation';
import { useGenerationJob } from '@/hooks/query/use-timetable-generation';
import {
  useAllOfferings,
  usePeriods,
  useRooms,
  useSchoolSections,
  useSlots,
  useTeacherDirectory,
  useTimetables,
} from '@/hooks/query/use-school';
import { isDenial } from '@/lib/api-failure';
import {
  buildGenerationRequest,
  emptyGenerationForm,
  type GenerationForm,
} from '@/lib/school/generation';
import { daysInUse, periodsInOrder } from '@/lib/school/grid';
import { teacherNames } from '@/lib/school/names';
import { dateOnly } from '@/lib/school/time';
import {
  MAX_SOLVE_SECONDS,
  MIN_SOLVE_SECONDS,
  type GenerationRequest,
} from '@/types/timetable-generation';
import { GenerationOptionsPanel } from './generate-options';
import { GenerationOutcome } from './generate-outcome';
import { makeNameBook, type TeacherDirectoryState } from './name-book';
import { SchoolScopeBar, useSchoolScope } from './school-scope';
import { useTimetableGrants } from './timetable-grants';
import { useUrlState } from './url-state';
import type { Timetable } from '@/types/school';

const GENERATION_UNAVAILABLE = 503;
const GENERATION_CONFLICT = 409;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function timetableLabel(row: Timetable): string {
  return `${row.name ?? row.id} (v${row.version ?? 1})`;
}

export function TimetableGenerate(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();
  const queryClient = useQueryClient();
  const grants = useTimetableGrants();

  const timetables = useTimetables(scope.schemeId);
  const timetableRows = timetables.data?.rows ?? [];
  const drafts = timetableRows.filter((row) => row.status === 'draft');
  const chosen = get('tt');
  const timetable =
    timetableRows.find((row) => row.id === chosen) ?? drafts[0] ?? timetableRows[0];
  const timetableId = timetable?.id ?? null;
  const isDraft = timetable?.status === 'draft';

  const sections = useSchoolSections(scope.branchId);
  const sectionRows = React.useMemo(() => sections.data?.rows ?? [], [sections.data]);
  const periods = usePeriods(scope.schemeId);
  const ordered = React.useMemo(
    () => periodsInOrder(periods.data?.rows ?? []),
    [periods.data],
  );
  const rooms = useRooms(scope.branchId);
  const roomRows = React.useMemo(() => rooms.data?.rows ?? [], [rooms.data]);
  const offerings = useAllOfferings(Boolean(scope.branchId));
  const offeringRows = React.useMemo(() => offerings.data ?? [], [offerings.data]);
  const slots = useSlots(timetableId);
  const allSlots = React.useMemo(() => slots.data ?? [], [slots.data]);
  const directory = useTeacherDirectory(Boolean(scope.branchId));
  const teacherRows = React.useMemo(() => directory.data?.rows ?? [], [directory.data]);

  const directoryState: TeacherDirectoryState = !directory.isError
    ? 'readable'
    : isDenial(directory.error)
      ? 'denied'
      : 'unavailable';

  const names = React.useMemo(
    () =>
      makeNameBook({
        sections: sectionRows,
        periods: ordered,
        rooms: roomRows,
        offerings: offeringRows,
        teachers: teacherNames(teacherRows),
        teacherDirectory: directoryState,
      }),
    [sectionRows, ordered, roomRows, offeringRows, teacherRows, directoryState],
  );

  const [form, setForm] = React.useState<GenerationForm>(emptyGenerationForm);
  const [confirmingReplace, setConfirmingReplace] = React.useState(false);
  const patch = React.useCallback(
    (changes: Partial<GenerationForm>) => setForm((current) => ({ ...current, ...changes })),
    [],
  );

  const generate = useGenerateTimetable(timetableId);
  const jobId = get('gen');
  const job = useGenerationJob(timetableId, jobId);
  const live = job.data && !job.data.terminal;

  const settled = React.useRef<string | null>(null);
  React.useEffect(() => {
    const answer = job.data;
    if (!answer?.terminal || answer.status !== 'succeeded') return;
    if (settled.current === answer.id) return;
    settled.current = answer.id;
    void queryClient.invalidateQueries({ queryKey: queryKeys.school.all });
  }, [job.data, queryClient]);

  const placed = allSlots.filter((slot) => slot.subject_offering_id);
  const overridden = placed.filter((slot) => slot.clash_override);
  const withTeacher = placed.filter((slot) => slot.teacher_id);
  const mustReplace = placed.length > 0;
  const days = React.useMemo(() => {
    const used = daysInUse(allSlots);
    return [...new Set([1, 2, 3, 4, 5, ...used])].sort((a, b) => a - b);
  }, [allSlots]);

  const built = buildGenerationRequest(form, Boolean(timetable?.supersedes_id));
  const blocked = built.problems.length > 0 || (mustReplace && !form.replaceExisting);

  const run = (override?: Partial<GenerationRequest>): void => {
    setConfirmingReplace(false);
    generate.mutate(
      { ...built.request, ...override },
      { onSuccess: (created) => put({ gen: created.id }) },
    );
  };

  const raiseSeconds = (seconds: number): void => {
    patch({ maxSeconds: seconds });
    run({ max_seconds: seconds });
  };

  const unavailableService =
    generate.error?.status === GENERATION_UNAVAILABLE ? generate.error.message : null;
  const conflict = generate.error?.status === GENERATION_CONFLICT;
  const refused =
    generate.error && !unavailableService && !conflict ? generate.error.message : null;

  const loading = timetables.isPending || periods.isPending;
  const failed = timetables.error ?? periods.error;

  return (
    <Stack spacing={2.5}>
      <SchoolScopeBar scope={scope} showBells />

      {timetableRows.length > 0 ? (
        <TextField
          select
          size="small"
          label="Draft to fill in"
          value={timetable?.id ?? ''}
          onChange={(event) => put({ tt: event.target.value, gen: null })}
          sx={{ maxWidth: 360 }}
          helperText={
            timetable
              ? `${timetable.status ?? 'draft'} · from ${dateOnly(timetable.effective_from)}`
              : undefined
          }
        >
          {timetableRows.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {timetableLabel(row)}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      {!scope.schemeId && !scope.isPending ? (
        <Alert severity="info" variant="outlined">
          This branch has no period scheme, so there is no pattern of periods to place
          lessons in. Set the periods up first.
        </Alert>
      ) : null}

      {scope.schemeId && timetableRows.length === 0 && !timetables.isPending ? (
        <Alert severity="info" variant="outlined">
          This period scheme has no timetable yet. Create one in the builder first: a
          generated week is written into a draft, so there has to be a draft to write it
          into.
        </Alert>
      ) : null}

      {timetable && !isDraft ? (
        <Alert severity="info" variant="outlined">
          <AlertTitle>
            {`${timetableLabel(timetable)} is ${timetable.status ?? 'not a draft'}, so it cannot be filled in`}
          </AlertTitle>
          A generated week is written as a draft for a person to read and publish, so
          auto-fill only runs on a draft.
          {drafts.length > 0
            ? ' Choose a draft above.'
            : ' There is no draft on this pattern yet; create one in the builder.'}
        </Alert>
      ) : null}

      {!grants.mayGenerate ? (
        <Alert severity="info" variant="outlined">
          This account may read the timetable but not run the generator, so the controls
          below are shown without the button that starts it. Someone holding{' '}
          <code>core.timetable.generate</code> has to run it.
        </Alert>
      ) : null}

      {loading && scope.schemeId ? <WidgetLoading rows={6} /> : null}
      {failed ? (
        <WidgetError error={failed} onRetry={() => void timetables.refetch()} />
      ) : null}

      {timetableId && isDraft ? (
        <Card>
          <CardContent>
            <SectionHeader
              title="Fill this draft in"
              subtitle="One run at a time, and it writes the whole week rather than adding to it"
            />

            <Stack spacing={2.5}>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                <EmergeChip
                  label={`${plural(placed.length, 'lesson', 'lessons')} in this draft now`}
                  tone={placed.length > 0 ? 'amber' : 'grey'}
                />
                <EmergeChip
                  label={`${plural(sectionRows.length, 'class', 'classes')} on this campus`}
                  tone="grey"
                />
                <EmergeChip
                  label={`${plural(ordered.length, 'period', 'periods')} a day`}
                  tone="grey"
                />
              </Stack>

              <TextField
                size="small"
                type="number"
                label="Give it at most"
                value={String(form.maxSeconds)}
                disabled={live}
                onChange={(event) => patch({ maxSeconds: Number(event.target.value) })}
                slotProps={{
                  htmlInput: { min: MIN_SOLVE_SECONDS, max: MAX_SOLVE_SECONDS, step: 1 },
                }}
                sx={{ maxWidth: 260 }}
                helperText={`Seconds, ${MIN_SOLVE_SECONDS} to ${MAX_SOLVE_SECONDS}. It stops itself, and a run that ends early has finished, not given up.`}
              />

              {mustReplace ? (
                <Alert severity="error" variant="outlined">
                  <AlertTitle>
                    {`Filling this draft in destroys the ${plural(placed.length, 'lesson', 'lessons')} already in it`}
                  </AlertTitle>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    The generator does not add to a week. It writes a whole one, so
                    everything now in this draft is deleted first and replaced by what it
                    produces. That means:
                  </Typography>
                  <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, m: 0, mb: 1 }}>
                    <li>
                      <Typography variant="body2">
                        {`${plural(placed.length, 'placed lesson', 'placed lessons')} deleted, including ${plural(withTeacher.length, 'one', 'ones')} with a teacher chosen by hand`}
                      </Typography>
                    </li>
                    {overridden.length > 0 ? (
                      <li>
                        <Typography variant="body2">
                          {`${plural(overridden.length, 'accepted double-booking', 'accepted double-bookings')} lost with ${overridden.length === 1 ? 'its' : 'their'} reason and who accepted ${overridden.length === 1 ? 'it' : 'them'}`}
                        </Typography>
                      </li>
                    ) : null}
                    <li>
                      <Typography variant="body2">
                        no undo: the rows are deleted in the same transaction that writes
                        the new week
                      </Typography>
                    </li>
                  </Stack>
                  <Typography variant="body2">
                    Only this draft is touched. A published week, and any other version,
                    is left exactly as it is.
                  </Typography>

                  {!form.replaceExisting ? (
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      sx={{ mt: 1.5 }}
                      disabled={live}
                      onClick={() => patch({ replaceExisting: true })}
                    >
                      {`Allow it to replace those ${plural(placed.length, 'lesson', 'lessons')}`}
                    </Button>
                  ) : (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ mt: 1.5, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
                    >
                      <EmergeChip
                        label={`${plural(placed.length, 'lesson', 'lessons')} will be deleted`}
                        tone="red"
                        dot
                      />
                      <Button
                        size="small"
                        disabled={live}
                        onClick={() => patch({ replaceExisting: false })}
                      >
                        Keep them instead
                      </Button>
                    </Stack>
                  )}
                </Alert>
              ) : (
                <Alert severity="success" variant="outlined">
                  This draft holds no lessons, so there is nothing to lose. Nothing outside
                  it is touched either way.
                </Alert>
              )}

              {timetable?.supersedes_id ? (
                <Alert severity="info" variant="outlined">
                  This draft replaces an earlier version, so the week already in force can
                  be handed to the solver as a starting point. It makes the new week look
                  like the old one where it can.{' '}
                  <Button
                    size="small"
                    disabled={live}
                    onClick={() => patch({ hint: !form.hint })}
                  >
                    {form.hint ? 'Start from scratch instead' : 'Start from the week in force'}
                  </Button>
                </Alert>
              ) : null}

              {built.problems.length > 0 ? (
                <Alert severity="warning" variant="outlined">
                  <AlertTitle>Settle these first</AlertTitle>
                  <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, m: 0 }}>
                    {built.problems.map((problem) => (
                      <Typography key={problem} component="li" variant="body2">
                        {problem}
                      </Typography>
                    ))}
                  </Stack>
                </Alert>
              ) : null}

              {unavailableService ? (
                <Alert severity="info" variant="outlined">
                  <AlertTitle>Automatic generation is switched off here</AlertTitle>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    {unavailableService}
                  </Typography>
                  <Typography variant="body2">
                    Nothing on this screen is wrong and nothing was sent. The solver runs
                    as a separate service and this deployment has not been pointed at one.
                  </Typography>
                </Alert>
              ) : null}

              {conflict ? (
                <Alert severity="warning" variant="outlined">
                  <AlertTitle>A run is already going on this timetable</AlertTitle>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Only one generation may be live per timetable, so this one was not
                    queued behind it and nothing was started. Wait for the one already
                    running to finish.
                  </Typography>
                  <Typography variant="body2">
                    If it was started somewhere else, this screen cannot show it:
                    emerge-core answers for a generation by its id and has no way to list
                    them, so the run is only visible to whoever holds its link.
                  </Typography>
                </Alert>
              ) : null}

              {refused ? (
                <Alert severity="warning" variant="outlined">
                  <AlertTitle>It would not take this request</AlertTitle>
                  <Typography variant="body2">{refused}</Typography>
                </Alert>
              ) : null}

              {grants.mayGenerate ? (
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}
                >
                  {confirmingReplace ? (
                    <>
                      <Typography variant="body2">
                        {`Delete ${plural(placed.length, 'lesson', 'lessons')} and write a generated week over them?`}
                      </Typography>
                      <Button variant="outlined" size="small" onClick={() => setConfirmingReplace(false)}>
                        Cancel
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        variant="contained"
                        onClick={() => run()}
                      >
                        Yes, replace them
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="contained"
                      color={form.replaceExisting ? 'error' : 'primary'}
                      disabled={blocked || live || generate.isPending}
                      onClick={() =>
                        form.replaceExisting ? setConfirmingReplace(true) : run()
                      }
                    >
                      {form.replaceExisting
                        ? `Replace ${plural(placed.length, 'lesson', 'lessons')} and fill the week in`
                        : 'Fill the week in'}
                    </Button>
                  )}
                  {live ? (
                    <Typography variant="body2" color="text.secondary">
                      A run is going. Nothing else can start until it ends.
                    </Typography>
                  ) : null}
                </Stack>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {jobId && job.isError ? (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>That run could not be read back</AlertTitle>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {isDenial(job.error)
              ? 'This account may not read this generation.'
              : job.error?.message}
          </Typography>
          <Button size="small" onClick={() => put({ gen: null })}>
            Forget it and start again
          </Button>
        </Alert>
      ) : null}

      {job.data ? (
        <Box>
          <SectionHeader
            title="The last run on this draft"
            subtitle={`Started ${job.data.created_at ? dateOnly(job.data.created_at) : 'recently'} with a limit of ${job.data.max_seconds} seconds`}
          />
          <GenerationOutcome job={job.data} onRaiseSeconds={raiseSeconds} />
        </Box>
      ) : null}

      {timetableId && isDraft ? (
        <Card>
          <CardContent>
            <SectionHeader
              title="What to ask for"
              subtitle="Every one of these is optional, and the defaults are a whole week's answer"
            />
            <GenerationOptionsPanel
              form={form}
              onChange={patch}
              disabled={Boolean(live)}
              days={days}
              periods={ordered}
              sections={sectionRows}
              offerings={offeringRows}
              rooms={roomRows}
              teachers={teacherRows}
              teacherError={directory.isError ? directory.error : null}
              names={names}
            />
          </CardContent>
        </Card>
      ) : null}
    </Stack>
  );
}
