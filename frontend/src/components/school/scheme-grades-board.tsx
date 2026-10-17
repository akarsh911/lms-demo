'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import FormLabel from '@mui/material/FormLabel';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { SectionHeader } from '@/components/ui/layout';
import {
  WidgetDegraded,
  WidgetEmpty,
  WidgetError,
  WidgetLoading,
} from '@/components/widgets/widget-states';
import { useAttachSchemeGrades, useDetachSchemeGrade } from '@/hooks/mutation/use-school';
import {
  useBranchSchemeGrades,
  useGradeLevels,
  useSchemeGrades,
} from '@/hooks/query/use-school';
import {
  freeGradeLevels,
  gradeLabel,
  gradeLevelLabel,
  schemeByGrade,
  schemeLabel,
  takenGradesFrom,
} from '@/lib/school/scheme-grades';
import { useTimetableGrants } from './timetable-grants';
import type { PeriodScheme } from '@/types/school';

export function SchemeGradesBoard({
  schemeId,
  schemes,
}: {
  schemeId: string;
  schemes: readonly PeriodScheme[];
}): React.ReactElement {
  const grants = useTimetableGrants();

  const levels = useGradeLevels();
  const links = useSchemeGrades(schemeId);

  const scheme = schemes.find((row) => row.id === schemeId);
  const levelRows = levels.data?.rows ?? [];
  const linkRows = links.data?.rows ?? [];

  return (
    <Stack spacing={2.5}>
      <SectionHeader
        title={`Grades running ${schemeLabel(scheme)}`}
        subtitle="A grade runs one pattern of the day per campus and year."
      />

      {levels.isError ? (
        <WidgetDegraded
          error={levels.error}
          denied="The grade levels could not be read, so an attached grade is named by its id and no grade can be attached here."
          unavailable="The grade levels could not be loaded, so an attached grade is named by its id and no grade can be attached here."
        />
      ) : null}

      {links.isPending ? <WidgetLoading rows={4} /> : null}
      {links.isError ? (
        <WidgetError error={links.error} onRetry={() => void links.refetch()} />
      ) : null}

      {links.data && linkRows.length === 0 ? (
        <WidgetEmpty message="No grade runs this pattern yet. Until one does, the pattern exists but describes nobody's day." />
      ) : null}

      {linkRows.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Grade</TableCell>
                {grants.mayDelete ? <TableCell align="right">Detach</TableCell> : null}
              </TableRow>
            </TableHead>
            <TableBody>
              {linkRows.map((link) => (
                <TableRow key={link.id} hover>
                  <TableCell>
                    <Typography variant="body2">{gradeLabel(link, levelRows)}</Typography>
                  </TableCell>
                  {grants.mayDelete ? (
                    <TableCell align="right">
                      <DetachButton
                        id={link.id}
                        label={gradeLabel(link, levelRows)}
                        scheme={schemeLabel(scheme)}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {grants.mayWrite && !levels.isError ? (
        <AttachGrades
          schemeId={schemeId}
          schemeName={schemeLabel(scheme)}
          schemes={schemes}
        />
      ) : null}
    </Stack>
  );
}

function DetachButton({
  id,
  label,
  scheme,
}: {
  id: string;
  label: string;
  scheme: string;
}): React.ReactElement {
  const detach = useDetachSchemeGrade();
  const [confirming, setConfirming] = React.useState(false);

  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
      {confirming ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
        >
          <Typography variant="caption" color="text.secondary">
            {label} stops running {scheme}, and anyone whose access is pinned to {label}{' '}
            stops reaching this pattern.
          </Typography>
          <Button
            size="small"
            onClick={() => setConfirming(false)}
            disabled={detach.isPending}
          >
            Keep
          </Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            disabled={detach.isPending}
            onClick={() => detach.mutate(id)}
          >
            Detach
          </Button>
        </Stack>
      ) : (
        <Button size="small" color="error" onClick={() => setConfirming(true)}>
          Detach
        </Button>
      )}

      {detach.error ? (
        <Typography variant="caption" color="error">
          {detach.error.message}
        </Typography>
      ) : null}
    </Stack>
  );
}

function AttachGrades({
  schemeId,
  schemeName,
  schemes,
}: {
  schemeId: string;
  schemeName: string;
  schemes: readonly PeriodScheme[];
}): React.ReactElement {
  const attach = useAttachSchemeGrades();
  const levels = useGradeLevels();
  const branch = useBranchSchemeGrades(schemes.map((row) => row.id));

  const [chosen, setChosen] = React.useState<readonly string[]>([]);

  const holders = schemeByGrade(branch.data);
  const levelRows = levels.data?.rows ?? [];
  const free = freeGradeLevels(levelRows, holders);
  const taken = levelRows.filter((level) => holders.get(level.id) !== schemeId && holders.has(level.id));

  const toggle = (id: string): void =>
    setChosen((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
    );

  const refused = attach.error ? takenGradesFrom(attach.error.details) : [];

  if (levels.isPending || branch.isPending) return <WidgetLoading rows={2} />;

  return (
    <FormControl component="fieldset" variant="standard" fullWidth>
      <FormLabel component="legend" sx={{ fontSize: 14 }}>
        Attach a grade to {schemeName}
      </FormLabel>

      {branch.isError ? (
        <WidgetDegraded
          error={branch.error}
          denied="Which grades other patterns hold could not be read, so every grade is listed. One that is taken will be refused when you attach it."
          unavailable="Which grades other patterns hold could not be read, so every grade is listed. One that is taken will be refused when you attach it."
        />
      ) : null}

      {free.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Every grade level on this campus already runs a pattern. Detach one from
          whichever pattern holds it before attaching it here.
        </Typography>
      ) : (
        <Box
          sx={{
            maxHeight: 200,
            overflowY: 'auto',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            px: 1.5,
            py: 0.5,
            mt: 0.5,
          }}
        >
          <FormGroup>
            {free.map((level) => (
              <FormControlLabel
                key={level.id}
                control={
                  <Checkbox
                    size="small"
                    checked={chosen.includes(level.id)}
                    onChange={() => toggle(level.id)}
                    disabled={attach.isPending}
                  />
                }
                label={<Typography variant="body2">{gradeLevelLabel(level)}</Typography>}
              />
            ))}
          </FormGroup>
        </Box>
      )}

      {taken.length > 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          Not listed, because each runs another pattern:{' '}
          {taken
            .map(
              (level) =>
                `${gradeLevelLabel(level)} (${schemeLabel(
                  schemes.find((row) => row.id === holders.get(level.id)),
                )})`,
            )
            .join(', ')}
          .
        </Typography>
      ) : null}

      {attach.error ? (
        <Alert severity="error" variant="outlined" sx={{ mt: 1.5 }}>
          {attach.error.message}
          {refused.length > 0 ? ` (${refused.join(', ')})` : ''}
        </Alert>
      ) : null}

      <Box sx={{ mt: 1.5 }}>
        <Button
          size="small"
          variant="contained"
          disabled={attach.isPending || chosen.length === 0}
          onClick={() =>
            attach.mutate(
              { schemeId, gradeLevelIds: [...chosen] },
              { onSuccess: () => setChosen([]) },
            )
          }
        >
          Attach {chosen.length > 0 ? chosen.length : ''}{' '}
          {chosen.length === 1 ? 'grade' : 'grades'}
        </Button>
      </Box>
    </FormControl>
  );
}
