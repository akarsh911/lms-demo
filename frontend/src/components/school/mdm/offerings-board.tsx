'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { useParams } from 'next/navigation';

import {
  useCreateSubject,
  useUpdateSubject,
  useCreateOffering,
  useDeleteOffering,
  useUpdateOffering,
} from '@/hooks/mutation/use-mdm';
import {
  useMdmOfferings,
  useMdmSections,
  useMdmSubjectGroups,
  useMdmSubjects,
} from '@/hooks/query/use-mdm';
import { WidgetDegraded } from '@/components/widgets/widget-states';
import { useGradingSchemes } from '@/hooks/query/use-school';
import { useResultSchemes } from '@/hooks/query/use-result-schemes';
import { sectionLabel } from '@/lib/school/names';
import { EmergeChip } from '@/components/ui/chip';
import { paths } from '@/paths';
import { MdmBoard, StatusChip } from './mdm-board';
import { MdmDialog, MdmFormActions, MdmFormError, StatusSelect } from './mdm-dialog';
import { SectionExplorer } from './section-explorer';
import { SchoolScopeBar, useSchoolScope } from '../school-scope';
import { useUrlState } from '../url-state';
import { OfferingPupils } from '../rostering/offering-pupils-dialog';
import type { OfferingWrite, RowStatus, Subject, SubjectGroup } from '@/types/mdm';
import type { GradingScheme, SchoolOfferingRow } from '@/types/school';

const NEW_SUBJECT = '__new';

export function OfferingsBoard(): React.ReactElement {
  const scope = useSchoolScope();
  const { get, put } = useUrlState();

  const sections = useMdmSections(scope.branchId, scope.sessionId);
  const sectionRows = React.useMemo(() => sections.data?.rows ?? [], [sections.data]);
  const chosen = get('section');
  const sectionId =
    sectionRows.find((row) => row.id === chosen)?.id ?? sectionRows[0]?.id ?? null;

  const offerings = useMdmOfferings(sectionId);
  const subjects = useMdmSubjects();
  const groups = useMdmSubjectGroups();
  const schemes = useGradingSchemes(scope.sessionId ?? undefined);
  const resultSchemes = useResultSchemes(scope.sessionId);

  const [editing, setEditing] = React.useState<SchoolOfferingRow | 'new' | null>(null);
  const [pupilsOf, setPupilsOf] = React.useState<SchoolOfferingRow | null>(null);

  const returned = React.useMemo(() => offerings.data?.rows ?? [], [offerings.data]);
  const inScope = React.useMemo(
    () => new Set(sectionRows.map((row) => row.id)),
    [sectionRows],
  );
  const rows = React.useMemo(
    () =>
      returned.filter(
        (offering) =>
          offering.section_id !== undefined &&
          inScope.has(offering.section_id) &&
          offering.section_id === sectionId &&
          (scope.sessionId === null ||
            offering.academic_session_id === undefined ||
            offering.academic_session_id === scope.sessionId),
      ),
    [returned, inScope, sectionId, scope.sessionId],
  );
  const dropped = returned.length - rows.length;

  const { persona } = useParams<{ persona: string }>();
  const section = sectionRows.find((row) => row.id === sectionId);
  const subjectHref = (offering: SchoolOfferingRow): string => paths.personaSection(persona, `sections/${section?.grade_level_id ?? ''}/${offering.section_id ?? ''}/subjects/${offering.id}`);
  const electiveIds = React.useMemo(() => new Set((subjects.data?.rows ?? []).filter((row) => row.is_elective).map((row) => row.id)), [subjects.data]);

  const groupsById = React.useMemo(
    () => new Map((groups.data?.rows ?? []).map((row) => [row.id, row])),
    [groups.data],
  );
  const schemesById = React.useMemo(
    () => new Map((schemes.data?.rows ?? []).map((row) => [row.id, row])),
    [schemes.data],
  );
  const resultSchemesById = React.useMemo(
    () => new Map((resultSchemes.data ?? []).map((row) => [row.id, row])),
    [resultSchemes.data],
  );

  return (
    <>
      <MdmBoard
        summary={`${rows.length} ${rows.length === 1 ? 'subject' : 'subjects'} taught in this class`}
        addLabel="Add a subject to this class"
        onAdd={() => setEditing('new')}
        addDisabled={!sectionId || !scope.sessionId}
        isPending={offerings.isPending && Boolean(sectionId)}
        error={offerings.error}
        onRetry={() => void offerings.refetch()}
        isEmpty={rows.length === 0}
        emptyMessage="Nothing is taught in this class yet. An offering is what puts a subject on its timetable."
        controls={
          <Stack spacing={1.5}>
            <SchoolScopeBar scope={scope} showScheme={false} />
            {sectionRows.length > 0 ? <SectionExplorer sections={sectionRows} value={sectionId} onChange={(id) => put({ section: id })} /> : null}
          </Stack>
        }
        notice={
          <Stack spacing={1.5}>
            {sectionRows.length === 0 && !sections.isPending && scope.branchId ? (
              <Alert severity="info" variant="outlined">
                This branch has no classes for the current year, so there is nothing to
                teach a subject to yet.
              </Alert>
            ) : null}
            {schemes.isError ? (
              <WidgetDegraded
                error={schemes.error}
                denied="This account cannot read grading schemes, so an offering keeps whichever scheme it already has."
                unavailable="Grading schemes could not be loaded, so an offering keeps whichever scheme it already has."
              />
            ) : null}
            {dropped > 0 ? (
              <Alert severity="warning" variant="outlined">
                {dropped} {dropped === 1 ? 'offering' : 'offerings'} came back from the
                API for another class or another year and {dropped === 1 ? 'is' : 'are'}{' '}
                not listed here.
              </Alert>
            ) : null}
          </Stack>
        }
      >
        <TableHead>
          <TableRow>
            <TableCell>Subject</TableCell>
            <TableCell>Group</TableCell>
            <TableCell align="right">Periods a week</TableCell>
            <TableCell align="right">Marks</TableCell>
            <TableCell>Grading</TableCell>
            <TableCell>Composition</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Pupils</TableCell>
            <TableCell align="right">Edit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((offering) => (
            <TableRow key={offering.id} hover>
              <TableCell>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Link component={NextLink} href={subjectHref(offering)} variant="subtitle2" underline="hover" color="text.primary">
                    {offering.edges?.subject?.name ?? 'Unknown subject'}
                  </Link>
                  <EmergeChip label={electiveIds.has(offering.subject_id ?? '') ? 'Elective' : 'Core'} tone={electiveIds.has(offering.subject_id ?? '') ? 'violet' : 'blue'} />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {offering.edges?.subject?.code ?? ''}
                </Typography>
              </TableCell>
              <TableCell>
                {offering.subject_group_id
                  ? (groupsById.get(offering.subject_group_id)?.name ?? 'Named elsewhere')
                  : '—'}
              </TableCell>
              <TableCell align="right">{offering.periods_per_week ?? '—'}</TableCell>
              <TableCell align="right">
                {offering.maximum_marks === undefined
                  ? '—'
                  : `${offering.pass_marks ?? 0} / ${offering.maximum_marks}`}
              </TableCell>
              <TableCell>
                {offering.grading_scheme_id
                  ? (schemesById.get(offering.grading_scheme_id)?.name ??
                    'Named elsewhere')
                  : '—'}
              </TableCell>
              <TableCell>
                {offering.result_scheme_id
                  ? (resultSchemesById.get(offering.result_scheme_id)?.name ??
                    'Named elsewhere')
                  : '—'}
              </TableCell>
              <TableCell>
                <StatusChip status={offering.status} />
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setPupilsOf(offering)}>
                  Pupils
                </Button>
              </TableCell>
              <TableCell align="right">
                <Button size="small" onClick={() => setEditing(offering)}>
                  Edit
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </MdmBoard>

      <MdmDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        formKey={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        maxWidth="sm"
      >
        <OfferingForm
          offering={editing === 'new' ? undefined : (editing ?? undefined)}
          resultSchemeName={
            editing !== null && editing !== 'new' && editing.result_scheme_id
              ? (resultSchemesById.get(editing.result_scheme_id)?.name ?? null)
              : null
          }
          sectionId={sectionId}
          sessionId={scope.sessionId}
          subjects={subjects.data?.rows ?? []}
          groups={groups.data?.rows ?? []}
          schemes={schemes.data?.rows ?? []}
          onClose={() => setEditing(null)}
        />
      </MdmDialog>

      <MdmDialog
        open={pupilsOf !== null}
        onClose={() => setPupilsOf(null)}
        formKey={pupilsOf?.id ?? 'none'}
        maxWidth="md"
      >
        {pupilsOf ? (
          <OfferingPupils
            offering={pupilsOf}
            sectionId={sectionId}
            onClose={() => setPupilsOf(null)}
          />
        ) : null}
      </MdmDialog>
    </>
  );
}

function OfferingForm({
  offering,
  resultSchemeName,
  sectionId,
  sessionId,
  subjects,
  groups,
  schemes,
  onClose,
}: {
  offering: SchoolOfferingRow | undefined;
  resultSchemeName: string | null;
  sectionId: string | null;
  sessionId: string | null;
  subjects: readonly Subject[];
  groups: readonly SubjectGroup[];
  schemes: readonly GradingScheme[];
  onClose: () => void;
}): React.ReactElement {
  const create = useCreateOffering();
  const update = useUpdateOffering();
  const remove = useDeleteOffering();

  const [subjectId, setSubjectId] = React.useState(offering?.subject_id ?? '');
  const [draftName, setDraftName] = React.useState('');
  const [elective, setElective] = React.useState(subjects.find((x) => x.id === offering?.subject_id)?.is_elective ?? false);
  const createSubject = useCreateSubject();
  const updateSubject = useUpdateSubject();
  const [groupId, setGroupId] = React.useState(offering?.subject_group_id ?? '');
  const [periods, setPeriods] = React.useState(
    offering?.periods_per_week === undefined ? '' : String(offering.periods_per_week),
  );
  const [maximum, setMaximum] = React.useState(
    offering?.maximum_marks === undefined ? '' : String(offering.maximum_marks),
  );
  const [pass, setPass] = React.useState(
    offering?.pass_marks === undefined ? '' : String(offering.pass_marks),
  );
  const [schemeId, setSchemeId] = React.useState(offering?.grading_scheme_id ?? '');
  const [status, setStatus] = React.useState<string>(offering?.status ?? 'active');

  const parsedPeriods = intOrNull(periods);
  const parsedMaximum = floatOrNull(maximum);
  const parsedPass = floatOrNull(pass);
  const periodsUsable = parsedPeriods !== 'bad' && (parsedPeriods ?? 0) >= 0;
  const marksUsable =
    parsedMaximum !== 'bad' &&
    parsedPass !== 'bad' &&
    (parsedMaximum ?? 0) >= 0 &&
    (parsedPass ?? 0) >= 0;
  const passTooHigh =
    typeof parsedMaximum === 'number' &&
    typeof parsedPass === 'number' &&
    parsedPass > parsedMaximum;
  const usable = subjectId !== '' && periodsUsable && marksUsable && !passTooHigh;
  const busy = create.isPending || update.isPending || remove.isPending;
  const failure = create.error ?? update.error ?? remove.error;

  const save = (): void => {
    if (!usable) return;
    const patch: OfferingWrite = {
      subject_group_id: groupId === '' ? null : groupId,
      periods_per_week: parsedPeriods,
      maximum_marks: parsedMaximum,
      pass_marks: parsedPass,
      grading_scheme_id: schemeId === '' ? null : schemeId,
      status: status as RowStatus,
    };
    if (offering) {
      update.mutate({ id: offering.id, patch }, { onSuccess: onClose });
      return;
    }
    if (!sectionId || !sessionId) return;
    create.mutate(
      {
        academic_session_id: sessionId,
        section_id: sectionId,
        subject_id: subjectId,
        ...withoutNulls(patch),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <DialogTitle>{offering ? 'Edit offering' : 'Add a subject to this class'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Autocomplete
            options={[...subjects, ...(draftName.trim() && !subjects.some((x) => (x.name ?? '').toLowerCase() === draftName.trim().toLowerCase()) ? [{ id: NEW_SUBJECT, name: draftName.trim() } satisfies Subject] : [])]}
            value={subjects.find((x) => x.id === subjectId) ?? null}
            disabled={Boolean(offering) || createSubject.isPending}
            onInputChange={(_, next, reason) => {
              if (reason === 'input') setDraftName(next);
            }}
            onChange={(_, picked) => {
              if (!picked) return setSubjectId('');
              if (picked.id !== NEW_SUBJECT) return setSubjectId(picked.id);
              createSubject.mutate(
                { name: picked.name ?? '', code: (picked.name ?? '').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase(), subject_type: 'scholastic', is_elective: elective, status: 'active' },
                { onSuccess: (made) => setSubjectId(made.id) },
              );
            }}
            getOptionLabel={(x) => (x.id === NEW_SUBJECT ? `Add “${x.name ?? ''}” as a new subject` : (x.name ?? x.code ?? x.id))}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Subject"
                size="small"
                required
                helperText={offering ? 'An offering cannot be moved to another subject. Delete it and add the right one.' : 'Pick one, or type a name to add a new subject to the school.'}
              />
            )}
          />
          <ToggleButtonGroup
            exclusive
            size="small"
            value={elective ? 'elective' : 'core'}
            onChange={(_, next: string | null) => {
              if (!next) return;
              setElective(next === 'elective');
              if (subjectId) updateSubject.mutate({ id: subjectId, patch: { is_elective: next === 'elective' } });
            }}
            aria-label="Core or elective"
          >
            <ToggleButton value="core">Core: every student takes it</ToggleButton>
            <ToggleButton value="elective">Elective: chosen students</ToggleButton>
          </ToggleButtonGroup>

          <TextField
            select
            label="Subject group"
            size="small"
            value={groups.some((group) => group.id === groupId) ? groupId : ''}
            onChange={(event) => setGroupId(event.target.value)}
            helperText="Optional. A school-wide taxonomy, not a pick-one list."
          >
            <MenuItem value="">No group</MenuItem>
            {groups.map((group) => (
              <MenuItem key={group.id} value={group.id}>
                {group.name ?? group.id}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="Periods a week"
            size="small"
            type="number"
            value={periods}
            onChange={(event) => setPeriods(event.target.value)}
            error={!periodsUsable}
            helperText={
              periodsUsable
                ? 'What the timetable has to place. Leave it empty and nothing is required.'
                : 'Periods a week has to be zero or above.'
            }
          />

          <Alert severity="info" variant="outlined">
            Minutes a week is
            {offering?.minutes_per_week === undefined
              ? ' not set'
              : ` ${offering.minutes_per_week}`}
            . It is recorded on the offering and there is no field on the write, so it
            cannot be changed from here.
          </Alert>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Maximum marks"
              size="small"
              type="number"
              value={maximum}
              onChange={(event) => setMaximum(event.target.value)}
              error={parsedMaximum === 'bad'}
              fullWidth
            />
            <TextField
              label="Pass marks"
              size="small"
              type="number"
              value={pass}
              onChange={(event) => setPass(event.target.value)}
              error={parsedPass === 'bad' || passTooHigh}
              helperText={passTooHigh ? 'Pass marks cannot exceed the maximum.' : undefined}
              fullWidth
            />
          </Stack>

          <TextField
            select
            label="Grading scheme"
            size="small"
            value={schemes.some((scheme) => scheme.id === schemeId) ? schemeId : ''}
            onChange={(event) => setSchemeId(event.target.value)}
            helperText={
              schemes.length === 0
                ? 'No grading scheme is readable for this year.'
                : 'A grade already awarded keeps the scheme it was awarded under.'
            }
          >
            <MenuItem value="">No scheme</MenuItem>
            {schemes.map((scheme) => (
              <MenuItem key={scheme.id} value={scheme.id}>
                {scheme.name ?? scheme.code ?? scheme.id}
              </MenuItem>
            ))}
          </TextField>

          <Alert severity="info" variant="outlined">
            {resultSchemeName === null
              ? 'What the marks are made of is not composed for this subject yet.'
              : `The marks are made up as ${resultSchemeName} says.`}{' '}
            The offering write carries no field for the result scheme, so it is
            composed in the Result schemes panel below and cannot be chosen here.
          </Alert>

          <StatusSelect value={status} onChange={setStatus} />

          <MdmFormError error={failure} />
        </Stack>
      </DialogContent>
      <MdmFormActions
        onDelete={
          offering ? () => remove.mutate(offering.id, { onSuccess: onClose }) : undefined
        }
        onCancel={onClose}
        onSave={save}
        busy={busy}
        canSave={usable && (Boolean(offering) || (Boolean(sectionId) && Boolean(sessionId)))}
      />
    </>
  );
}

function intOrNull(raw: string): number | null | 'bad' {
  if (raw.trim() === '') return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value >= 0 ? value : 'bad';
}

function floatOrNull(raw: string): number | null | 'bad' {
  if (raw.trim() === '') return null;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : 'bad';
}

function withoutNulls(patch: OfferingWrite): OfferingWrite {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== null),
  ) as OfferingWrite;
}
