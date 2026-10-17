'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { SectionHeader } from '@/components/ui/layout';
import { WidgetDegraded, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import {
  useAllOfferings,
  useBellPeriods,
  usePeriods,
  useRooms,
  useSchoolSections,
  useSectionOfferings,
  useSectionTeachers,
  useSlots,
  useTeacherDirectory,
  useTimetableReport,
  useTimetables,
} from '@/hooks/query/use-school';
import { bellByPeriod, daysInUse, indexSlots, offeringProgress, periodsInOrder } from '@/lib/school/grid';
import { isDenial } from '@/lib/api-failure';
import { teacherNames } from '@/lib/school/names';
import { dateOnly } from '@/lib/school/time';
import { ClashList } from './clash-list';
import { makeNameBook, type TeacherDirectoryState } from './name-book';
import { OverridesPanel } from './overrides-panel';
import { RequirementsPanel } from './requirements-panel';
import { SchoolScopeBar, useSchoolScope } from './school-scope';
import { SlotDialog } from './slot-dialog';
import { TimetableGrid } from './timetable-grid';
import { useUrlState } from './url-state';
import type { Period, TimetableSlot } from '@/types/school';

/**
 * The timetable builder.
 *
 * ## One timetable, many sections
 *
 * `timetables` hang off `period_scheme_id` and the SECTION lives on the slot.
 * There is no timetable-per-section. Everything here loads the whole
 * timetable's slots and filters them to the section on screen, which is what
 * makes the standing clash report meaningful: a teacher booked in two sections
 * at once is invisible from either section alone.
 *
 * ## Occurrences are derived and are not written here
 *
 * What this edits is the PATTERN — day-of-week and period, for the life of the
 * timetable. What happens on a given date is resolved by
 * `/timetable-occurrences` from this pattern, the calendar and any deviations.
 * Nothing in this screen writes an occurrence row, because there are none to
 * write.
 *
 * ## No auto-fill
 *
 * A solver exists and is not wired to anything. Nothing here calls one, and the
 * report at the top is deliberately the same report a solver would have to
 * satisfy, so the two cannot disagree about what a clash is.
 */
export function TimetableBuilder(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();

  const timetables = useTimetables(scope.schemeId);
  const timetableRows = timetables.data?.rows ?? [];
  const chosenTimetable = get('tt');
  const timetable =
    timetableRows.find((row) => row.id === chosenTimetable) ??
    timetableRows.find((row) => row.status === 'published') ??
    timetableRows[0];
  const timetableId = timetable?.id ?? null;

  const sections = useSchoolSections(scope.branchId);
  // Each of these derives a NEW array or map every render, and three memos
  // below take them as dependencies. Memoised on the query data — which
  // TanStack keeps stable between refetches — so those memos are real rather
  // than recomputing on every keystroke in a dialog above them.
  const sectionRows = React.useMemo(() => sections.data?.rows ?? [], [sections.data]);
  const chosenSection = get('section');
  const sectionId =
    sectionRows.find((row) => row.id === chosenSection)?.id ?? sectionRows[0]?.id ?? null;

  const periods = usePeriods(scope.schemeId);
  const ordered = React.useMemo(
    () => periodsInOrder(periods.data?.rows ?? []),
    [periods.data],
  );
  const bellPeriods = useBellPeriods(scope.bellId);
  const bells = React.useMemo(
    () => bellByPeriod(bellPeriods.data?.rows ?? []),
    [bellPeriods.data],
  );

  const slots = useSlots(timetableId);
  const allSlots = React.useMemo(() => slots.data ?? [], [slots.data]);
  const byCell = React.useMemo(() => indexSlots(allSlots), [allSlots]);

  const rooms = useRooms(scope.branchId);
  const allOfferings = useAllOfferings(Boolean(scope.branchId));
  const sectionOfferings = useSectionOfferings(sectionId);
  const assignments = useSectionTeachers(sectionId);
  const directory = useTeacherDirectory(Boolean(sectionId));

  const report = useTimetableReport(timetableId);

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
        rooms: rooms.data?.rows ?? [],
        offerings: allOfferings.data ?? [],
        teachers: teacherNames(directory.data?.rows ?? []),
        teacherDirectory: directoryState,
      }),
    [sectionRows, ordered, rooms.data, allOfferings.data, directory.data, directoryState],
  );

  const [picked, setPicked] = React.useState<{
    day: number;
    period: Period;
    slot: TimetableSlot | undefined;
  } | null>(null);

  const used = daysInUse(allSlots);
  const days = used.length > 0 ? mergeDays(used) : [1, 2, 3, 4, 5, 6];

  const progress = React.useMemo(
    () =>
      sectionId
        ? offeringProgress(sectionOfferings.data ?? [], allSlots, sectionId, bells)
        : [],
    [sectionOfferings.data, allSlots, sectionId, bells],
  );

  const loading = timetables.isPending || periods.isPending || slots.isPending;
  const failed = timetables.error ?? periods.error ?? slots.error;

  return (
    <Stack spacing={2.5}>
      <SchoolScopeBar scope={scope} showBells />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ flexWrap: 'wrap' }}>
        {timetableRows.length > 0 ? (
          <TextField
            select
            size="small"
            label="Timetable"
            value={timetable?.id ?? ''}
            onChange={(event) => put({ tt: event.target.value })}
            sx={{ minWidth: 260 }}
            helperText={
              timetable
                ? `${timetable.status ?? 'draft'} · from ${dateOnly(timetable.effective_from)}`
                : undefined
            }
          >
            {timetableRows.map((row) => (
              <MenuItem key={row.id} value={row.id}>
                {row.name ?? row.id} (v{row.version ?? 1})
              </MenuItem>
            ))}
          </TextField>
        ) : null}

        {sectionRows.length > 0 ? (
          <TextField
            select
            size="small"
            label="Class"
            value={sectionId ?? ''}
            onChange={(event) => put({ section: event.target.value })}
            sx={{ minWidth: 220 }}
            helperText="One class's view of the whole week"
          >
            {sectionRows.map((row) => (
              <MenuItem key={row.id} value={row.id}>
                {names.section(row.id)}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </Stack>

      {!scope.schemeId && !scope.isPending ? (
        <Alert severity="info" variant="outlined">
          This branch has no period scheme, so there is no pattern of periods to build a
          week on. Set the periods up first.
        </Alert>
      ) : null}

      {scope.schemeId && timetableRows.length === 0 && !timetables.isPending ? (
        <Alert severity="info" variant="outlined">
          This period scheme has no timetable yet. One has to be created before lessons
          can be placed in it.
        </Alert>
      ) : null}

      {report.data ? (
        <Alert
          severity={report.data.blocking > 0 ? 'warning' : 'success'}
          variant="outlined"
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="body2">
              {report.data.blocking === 0
                ? 'Nothing in this timetable clashes'
                : `${report.data.blocking} unresolved ${report.data.blocking === 1 ? 'clash' : 'clashes'} across the whole timetable`}
            </Typography>
            {report.data.overridden > 0 ? (
              <EmergeChip
                label={`${report.data.overridden} accepted`}
                tone="amber"
              />
            ) : null}
          </Stack>
        </Alert>
      ) : null}

      {directory.isError ? (
        <WidgetDegraded
          error={directory.error}
          denied="This account cannot read the teacher directory, so teachers are listed by the subjects they are assigned to rather than by name."
          unavailable="The teacher directory could not be loaded, so teachers are listed by the subjects they are assigned to rather than by name."
        />
      ) : null}

      {loading && scope.schemeId ? <WidgetLoading rows={8} /> : null}
      {failed ? <WidgetError error={failed} onRetry={() => void slots.refetch()} /> : null}

      {timetableId && sectionId && ordered.length > 0 ? (
        <TimetableGrid
          days={days}
          periods={ordered}
          bells={bells}
          slotsByCell={byCell}
          sectionId={sectionId}
          names={names}
          onPick={(day, period, slot) => setPicked({ day, period, slot })}
        />
      ) : null}

      {sectionId ? (
        <Card>
          <CardContent>
            <SectionHeader
              title="What this class is owed"
              subtitle="Periods placed against what each subject asks for"
            />
            {sectionOfferings.isPending ? <WidgetLoading rows={4} /> : null}
            {sectionOfferings.isError ? (
              <WidgetError
                error={sectionOfferings.error}
                onRetry={() => void sectionOfferings.refetch()}
              />
            ) : null}
            {progress.length > 0 ? (
              <RequirementsPanel progress={progress} names={names} />
            ) : null}
            {sectionOfferings.data && progress.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Nothing is taught to this class yet, so the week has nothing to satisfy.
              </Typography>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {report.data && report.data.clashes.length > 0 ? (
        <Card>
          <CardContent>
            <SectionHeader
              title="Every clash in this timetable"
              subtitle="Accepted ones are listed too, and stay listed"
            />
            <ClashList clashes={report.data.clashes} names={names} ref_="" />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent>
          <SectionHeader
            title="Overrides"
            subtitle="Double-bookings this school has knowingly accepted"
          />
          <OverridesPanel slots={allSlots} names={names} />
        </CardContent>
      </Card>

      <SlotDialog
        open={picked !== null}
        onClose={() => setPicked(null)}
        timetableId={timetableId}
        sectionId={sectionId}
        defaultRoomId={sectionRows.find((row) => row.id === sectionId)?.room_id ?? null}
        slot={picked?.slot}
        day={picked?.day ?? 1}
        period={picked?.period}
        periods={ordered}
        offerings={sectionOfferings.data ?? []}
        rooms={rooms.data?.rows ?? []}
        assignments={assignments.data ?? []}
        names={names}
      />
    </Stack>
  );
}

/**
 * The days to draw.
 *
 * Every day the timetable already uses, plus Monday to Friday whether or not
 * anything is in them — a week with an empty Wednesday is a week with a gap to
 * fill, and hiding the column hides the gap. Saturday appears only when the
 * school uses it, and Sunday only when something is already there, because a
 * column nobody will ever fill is just a narrower grid.
 */
function mergeDays(used: readonly number[]): number[] {
  const days = new Set<number>([1, 2, 3, 4, 5, ...used]);
  return [...days].sort((a, b) => a - b);
}
