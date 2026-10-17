'use client';

import * as React from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ChevronDown } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { SlotGrid, type SlotGridColumn, type SlotGridRow } from '@/components/ui/slot-grid';
import { WidgetDegraded } from '@/components/widgets/widget-states';
import { DAY_NAMES, DAY_SHORT, ISO_DAYS } from '@/constants/school';
import {
  MINUTES_BASIS_LABELS,
  WEIGHT_LABELS,
  pinnedTotal,
  sameCell,
  type ContactRuleDraft,
  type GenerationForm,
} from '@/lib/school/generation';
import { periodLabel } from '@/lib/school/names';
import {
  GENERATION_WEIGHT_NAMES,
  MINUTES_BASES,
  type GenerationCell,
  type MinutesBasis,
} from '@/types/timetable-generation';
import { ContactRulesPanel } from './generate-contact-rules';
import type { NameBook } from './name-book';
import type { Period, Room, SchoolOfferingRow, SectionRow } from '@/types/school';
import type { TeacherRow } from '@/types/roster';

const UNNAMED_SUBJECTS_SHOWN = 12;

export interface GenerationOptionsPanelProps {
  form: GenerationForm;
  onChange: (patch: Partial<GenerationForm>) => void;
  disabled: boolean;
  days: readonly number[];
  periods: readonly Period[];
  sections: readonly SectionRow[];
  offerings: readonly SchoolOfferingRow[];
  rooms: readonly Room[];
  teachers: readonly TeacherRow[];
  teacherError: unknown;
  names: NameBook;
}

interface SubjectChoice {
  code: string;
  label: string;
}

function subjectChoices(offerings: readonly SchoolOfferingRow[]): SubjectChoice[] {
  const byCode = new Map<string, string>();
  for (const offering of offerings) {
    const code = offering.edges?.subject?.code;
    if (!code) continue;
    byCode.set(code, offering.edges?.subject?.name ?? code);
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, label: `${name} (${code})` }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function roomTypesInBranch(rooms: readonly Room[]): string[] {
  const types = new Set<string>();
  for (const room of rooms) {
    if (room.room_type) types.add(room.room_type);
  }
  return [...types].sort();
}

function countedBy(rooms: readonly Room[], type: string): number {
  return rooms.filter((room) => room.room_type === type).length;
}

function OptionSection({
  title,
  summary,
  count,
  children,
}: {
  title: string;
  summary: string;
  count: number;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Accordion disableGutters variant="outlined">
      <AccordionSummary expandIcon={<ChevronDown size={18} />}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography variant="subtitle2">{title}</Typography>
          {count > 0 ? <EmergeChip label={count} tone="violet" /> : null}
          <Typography variant="caption" color="text.secondary">
            {summary}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}

export function GenerationOptionsPanel({
  form,
  onChange,
  disabled,
  days,
  periods,
  sections,
  offerings,
  rooms,
  teachers,
  teacherError,
  names,
}: GenerationOptionsPanelProps): React.ReactElement {
  const [demandSection, setDemandSection] = React.useState('');
  const [pinSection, setPinSection] = React.useState('');
  const [pinOffering, setPinOffering] = React.useState('');
  const [teacherId, setTeacherId] = React.useState('');

  const subjects = React.useMemo(() => subjectChoices(offerings), [offerings]);
  const roomTypes = React.useMemo(() => roomTypesInBranch(rooms), [rooms]);
  const sectionIds = React.useMemo(
    () => new Set(sections.map((section) => section.id)),
    [sections],
  );
  const inBranch = React.useMemo(
    () => offerings.filter((row) => row.section_id && sectionIds.has(row.section_id)),
    [offerings, sectionIds],
  );
  const withoutDemand = React.useMemo(
    () =>
      inBranch.filter(
        (row) =>
          typeof row.periods_per_week !== 'number' &&
          (form.demand[row.id] ?? '').trim() === '',
      ),
    [inBranch, form.demand],
  );

  const demandRows = inBranch.filter((row) => row.section_id === demandSection);
  const pinRows = inBranch.filter((row) => row.section_id === pinSection);
  const pinned = form.pins[pinOffering] ?? {};
  const pinnedOffering = inBranch.find((row) => row.id === pinOffering);
  const pinnedAsked =
    Number(form.demand[pinOffering] ?? '') || pinnedOffering?.periods_per_week || 0;
  const blockedCells = form.unavailable[teacherId] ?? [];

  const setDemand = (offeringId: string, value: string): void =>
    onChange({ demand: { ...form.demand, [offeringId]: value } });

  const setPin = (day: number, value: string): void => {
    if (pinOffering === '') return;
    onChange({
      pins: { ...form.pins, [pinOffering]: { ...pinned, [String(day)]: value } },
    });
  };

  const toggleCell = (cell: GenerationCell): void => {
    if (teacherId === '') return;
    const held = blockedCells.some((one) => sameCell(one, cell));
    const next = held
      ? blockedCells.filter((one) => !sameCell(one, cell))
      : [...blockedCells, cell];
    onChange({ unavailable: { ...form.unavailable, [teacherId]: next } });
  };

  const columns: SlotGridColumn[] = days.map((day) => ({
    key: String(day),
    label: DAY_NAMES[day] ?? `Day ${day}`,
    short: DAY_SHORT[day] ?? String(day),
  }));
  const gridRows: SlotGridRow[] = periods.map((period) => ({
    key: period.id,
    label: periodLabel(period),
  }));

  const demandCount = Object.values(form.demand).filter((value) => value.trim() !== '').length;
  const pinCount = Object.values(form.pins).filter(
    (byDay) => Object.values(byDay).some((value) => value.trim() !== ''),
  ).length;
  const unavailableCount = Object.values(form.unavailable).filter(
    (cells) => cells.length > 0,
  ).length;
  const roomTypeCount = Object.values(form.requiredRoomType).filter(
    (value) => value.trim() !== '',
  ).length;
  const weightCount = GENERATION_WEIGHT_NAMES.filter(
    (name) => (form.weights[name] ?? '').trim() !== '',
  ).length;

  return (
    <Stack spacing={1}>
      {withoutDemand.length > 0 ? (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>
            {`${withoutDemand.length} ${withoutDemand.length === 1 ? 'subject has' : 'subjects have'} no lessons a week recorded`}
          </AlertTitle>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The generator places an exact number of lessons per subject and takes that
            number from the offering. An offering with none is refused before any
            searching starts. Give each a number under <em>Lessons a week</em>, or set
            <code> periods_per_week </code> on the offering itself so every screen agrees.
          </Typography>
          <Typography variant="body2">
            {withoutDemand
              .slice(0, UNNAMED_SUBJECTS_SHOWN)
              .map((row) => `${names.section(row.section_id)} · ${names.offering(row.id)}`)
              .join(', ')}
            {withoutDemand.length > UNNAMED_SUBJECTS_SHOWN
              ? `, and ${withoutDemand.length - UNNAMED_SUBJECTS_SHOWN} more`
              : ''}
          </Typography>
        </Alert>
      ) : null}

      <OptionSection
        title="Lessons a week"
        summary="Overrides what each subject asks for"
        count={demandCount}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Left blank, a subject is placed as many times as its offering says. A number
            typed here is used instead, for this run only, and nothing on the offering
            changes.
          </Typography>
          <TextField
            select
            size="small"
            label="Class"
            value={demandSection}
            onChange={(event) => setDemandSection(event.target.value)}
            sx={{ maxWidth: 320 }}
          >
            <MenuItem value="">Choose a class</MenuItem>
            {sections.map((section) => (
              <MenuItem key={section.id} value={section.id}>
                {names.section(section.id)}
              </MenuItem>
            ))}
          </TextField>

          {demandSection !== '' && demandRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nothing is taught to this class yet.
            </Typography>
          ) : null}

          <Stack spacing={1.5}>
            {demandRows.map((row) => (
              <Stack
                key={row.id}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{ alignItems: { sm: 'center' } }}
              >
                <Typography variant="body2" sx={{ minWidth: 220 }}>
                  {names.offering(row.id)}
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  label="Lessons a week"
                  value={form.demand[row.id] ?? ''}
                  disabled={disabled}
                  onChange={(event) => setDemand(row.id, event.target.value)}
                  slotProps={{ htmlInput: { min: 0, max: 40, step: 1 } }}
                  placeholder={
                    typeof row.periods_per_week === 'number'
                      ? String(row.periods_per_week)
                      : 'not recorded'
                  }
                  sx={{ maxWidth: 180 }}
                  helperText={
                    typeof row.periods_per_week === 'number'
                      ? `The offering says ${row.periods_per_week}`
                      : 'The offering says nothing, so a number is required'
                  }
                />
              </Stack>
            ))}
          </Stack>
        </Stack>
      </OptionSection>

      <OptionSection
        title="Lessons pinned to a day"
        summary="Forces a count on a given weekday"
        count={pinCount}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            A pin fixes how many lessons of one subject fall on one day. Pinning more
            across the week than the subject is asked for is refused before the run
            starts, so the totals are shown as you type.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              size="small"
              label="Class"
              value={pinSection}
              onChange={(event) => {
                setPinSection(event.target.value);
                setPinOffering('');
              }}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Choose a class</MenuItem>
              {sections.map((section) => (
                <MenuItem key={section.id} value={section.id}>
                  {names.section(section.id)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Subject"
              value={pinOffering}
              disabled={pinSection === ''}
              onChange={(event) => setPinOffering(event.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Choose a subject</MenuItem>
              {pinRows.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {names.offering(row.id)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {pinOffering !== '' ? (
            <>
              <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>
                {ISO_DAYS.map((day) => (
                  <TextField
                    key={day}
                    size="small"
                    type="number"
                    label={DAY_SHORT[day]}
                    value={pinned[String(day)] ?? ''}
                    disabled={disabled}
                    onChange={(event) => setPin(day, event.target.value)}
                    slotProps={{ htmlInput: { min: 0, max: 12, step: 1 } }}
                    sx={{ width: 96 }}
                  />
                ))}
              </Stack>
              <Typography
                variant="body2"
                color={
                  pinnedAsked > 0 && pinnedTotal(pinned) > pinnedAsked
                    ? 'error.main'
                    : 'text.secondary'
                }
              >
                {`Pinned across the week: ${pinnedTotal(pinned)}. This subject is asked for ${pinnedAsked > 0 ? pinnedAsked : 'no stated number of'} ${pinnedAsked === 1 ? 'lesson' : 'lessons'}.`}
              </Typography>
            </>
          ) : null}
        </Stack>
      </OptionSection>

      <OptionSection
        title="Teachers unavailable"
        summary="Periods a teacher must not be given"
        count={unavailableCount}
      >
        <Stack spacing={2}>
          {teacherError ? (
            <WidgetDegraded
              error={teacherError}
              denied="This account cannot read the teacher directory, so there is no list of teachers to mark unavailable. The rest of the options still work."
              unavailable="The teacher directory could not be loaded, so there is no list of teachers to mark unavailable. The rest of the options still work."
            />
          ) : null}
          <Typography variant="body2" color="text.secondary">
            A blocked period is absolute: nothing will be placed there for that teacher.
            Blocking more of the week than their lessons can fit around is refused before
            the run starts.
          </Typography>
          <TextField
            select
            size="small"
            label="Teacher"
            value={teacherId}
            disabled={teachers.length === 0}
            onChange={(event) => setTeacherId(event.target.value)}
            sx={{ maxWidth: 320 }}
          >
            <MenuItem value="">Choose a teacher</MenuItem>
            {teachers.map((teacher) => (
              <MenuItem key={teacher.id} value={teacher.id}>
                {names.teacher(teacher.id)}
              </MenuItem>
            ))}
          </TextField>

          {teacherId !== '' && periods.length > 0 ? (
            <>
              <SlotGrid
                columns={columns}
                rows={gridRows}
                ariaLabel={`Periods ${names.teacher(teacherId)} is unavailable for`}
                renderCell={(row, column) => {
                  const cell: GenerationCell = {
                    day_of_week: Number(column.key),
                    period_id: row.key,
                  };
                  const held = blockedCells.some((one) => sameCell(one, cell));
                  return (
                    <Checkbox
                      size="small"
                      checked={held}
                      disabled={disabled}
                      onChange={() => toggleCell(cell)}
                      slotProps={{
                        input: {
                          'aria-label': `${String(column.label)} ${String(row.label)} unavailable`,
                        },
                      }}
                    />
                  );
                }}
              />
              <Typography variant="body2" color="text.secondary">
                {`${blockedCells.length} ${blockedCells.length === 1 ? 'period' : 'periods'} blocked for ${names.teacher(teacherId)}.`}
              </Typography>
            </>
          ) : null}
        </Stack>
      </OptionSection>

      <OptionSection
        title="Rooms a subject must have"
        summary="Keyed by subject code, not by class"
        count={roomTypeCount}
      >
        <Stack spacing={2}>
          <Alert severity="warning" variant="outlined">
            <AlertTitle>This applies to a subject everywhere it is taught</AlertTitle>
            A requirement here is by subject CODE, so requiring a laboratory for Science
            requires it for every class that takes Science. Naming a type also means
            <strong> only</strong> rooms of that type qualify: a required laboratory does
            not fall back to a classroom, and a branch with none of that type is refused
            before the run starts.
          </Alert>
          {roomTypes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No room on this campus records a type, so there is nothing to require.
            </Typography>
          ) : null}
          <Stack spacing={1.5}>
            {subjects.map((subject) => (
              <Stack
                key={subject.code}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{ alignItems: { sm: 'center' } }}
              >
                <Typography variant="body2" sx={{ minWidth: 240 }}>
                  {subject.label}
                </Typography>
                <TextField
                  select
                  size="small"
                  label="Must be taught in"
                  value={form.requiredRoomType[subject.code] ?? ''}
                  disabled={disabled || roomTypes.length === 0}
                  onChange={(event) =>
                    onChange({
                      requiredRoomType: {
                        ...form.requiredRoomType,
                        [subject.code]: event.target.value,
                      },
                    })
                  }
                  sx={{ minWidth: 240 }}
                >
                  <MenuItem value="">Any room it is already taught in</MenuItem>
                  {roomTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {`${type} (${countedBy(rooms, type)} on this campus)`}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </OptionSection>

      <OptionSection
        title="Demanding subjects"
        summary="Kept out of the last period of a day where possible"
        count={form.heavySubjects.length}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            A preference, not a rule. The week will still put one last if that is the only
            way to fit everything, and it says so afterwards. By subject code, so it
            applies to every class taking it.
          </Typography>
          <FormControl size="small" fullWidth>
            <InputLabel id="heavy-subjects">Subjects</InputLabel>
            <Select
              multiple
              labelId="heavy-subjects"
              input={<OutlinedInput label="Subjects" />}
              value={[...form.heavySubjects]}
              disabled={disabled || subjects.length === 0}
              onChange={(event) =>
                onChange({
                  heavySubjects:
                    typeof event.target.value === 'string'
                      ? [event.target.value]
                      : event.target.value,
                })
              }
              renderValue={(chosen) => (
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  {chosen.map((code) => (
                    <Chip key={code} size="small" label={code} />
                  ))}
                </Stack>
              )}
            >
              {subjects.map((subject) => (
                <MenuItem key={subject.code} value={subject.code}>
                  {subject.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </OptionSection>

      <OptionSection
        title="How a period is measured"
        summary="Only matters where bells differ from the pattern"
        count={form.minutesBasis === 'nominal' ? 0 : 1}
      >
        <FormControl>
          <FormLabel id="minutes-basis" sx={{ fontSize: 14 }}>
            When the week counts the minutes a subject received
          </FormLabel>
          <RadioGroup
            aria-labelledby="minutes-basis"
            value={form.minutesBasis}
            onChange={(event) =>
              onChange({ minutesBasis: event.target.value as MinutesBasis })
            }
          >
            {MINUTES_BASES.map((basis) => (
              <FormControlLabel
                key={basis}
                value={basis}
                control={<Radio size="small" disabled={disabled} />}
                label={
                  <Typography variant="body2">{MINUTES_BASIS_LABELS[basis]}</Typography>
                }
              />
            ))}
          </RadioGroup>
        </FormControl>
      </OptionSection>

      <OptionSection
        title="What it should try to avoid"
        summary="Penalties it weighs against each other"
        count={weightCount}
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Each is a penalty the week is scored on, and every one of them can be broken
            if that is what it takes to place the lessons. Zero switches a preference off.
            Left blank, the solver keeps its own default.
          </Typography>
          <Stack spacing={1.5}>
            {GENERATION_WEIGHT_NAMES.map((name) => (
              <Stack
                key={name}
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{ alignItems: { sm: 'center' } }}
              >
                <Typography variant="body2" sx={{ minWidth: 320 }}>
                  {WEIGHT_LABELS[name]}
                </Typography>
                <TextField
                  size="small"
                  type="number"
                  label="Penalty"
                  value={form.weights[name] ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({ weights: { ...form.weights, [name]: event.target.value } })
                  }
                  slotProps={{ htmlInput: { min: 0, max: 1000, step: 1 } }}
                  placeholder="default"
                  sx={{ maxWidth: 160 }}
                />
              </Stack>
            ))}
          </Stack>
        </Stack>
      </OptionSection>

      <OptionSection
        title="Daily contact"
        summary="A class that must see the same subjects every day"
        count={form.dailyContact.length}
      >
        <ContactRulesPanel
          rules={form.dailyContact}
          sections={sections}
          offerings={inBranch}
          names={names}
          disabled={disabled}
          onChange={(rules: readonly ContactRuleDraft[]) => onChange({ dailyContact: rules })}
        />
      </OptionSection>
    </Stack>
  );
}
