'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { X } from 'lucide-react';

import { Field } from '@/components/ui/field';
import { ROSTER_KINDS, type RosterKind } from '@/constants/roster';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useRosterMember } from '@/hooks/query/use-roster-member';
import { capabilityFor } from '@/lib/core/fields';
import { fieldsIntact, nameOf, personOf } from '@/lib/core/roster';
import type { CapabilityField } from '@/types/core';
import type { RosterRow } from '@/types/roster';

import { WidgetError, WidgetLoading } from '../widget-states';

/**
 * One roster row, read on its own.
 *
 * THE FIELD LIST IS NOT WRITTEN HERE. It comes from the read capability for
 * this area: `fields.permitted` is the catalogue's own column list, filtered to
 * what this caller may read, and it carries a `name` for each. So the labels,
 * the order and the set are all the API's, and a column added to emerge-core
 * appears here without a change in this repo.
 *
 * What that list cannot do is name a column the caller may NOT read: a denied
 * column is filtered out of `permitted`, so it is invisible rather than listed
 * as withheld. The row-level banner below is what says so, and it is accurate
 * where a per-column claim would not be.
 */
export function RosterDetail({
  kind,
  id,
  onClose,
}: {
  kind: RosterKind;
  id: string;
  onClose: () => void;
}): React.ReactElement {
  const member = useRosterMember<RosterRow>(kind, id);
  const capabilities = useCapabilities();

  const capability = capabilityFor(
    capabilities.data?.capabilities,
    `core.${ROSTER_KINDS[kind].path}.read`,
  );
  const columns: readonly CapabilityField[] = capability?.fields.permitted ?? [];

  return (
    <Box
      component="section"
      aria-label="Selected record"
      sx={(theme) => ({ p: 2.5, border: `1px solid ${theme.brand.line}`, borderRadius: `${theme.band.radius.md}px`, backgroundColor: theme.brand.subtle })}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1 }}>
        <Typography variant="h4" component="h3" sx={{ flex: 1 }}>
          {member.data ? (titleFor(kind, member.data) ?? 'Record') : 'Record'}
        </Typography>
        <IconButton onClick={onClose} aria-label="Close this record" size="small">
          <X size={18} />
        </IconButton>
      </Stack>

      {member.isPending ? <WidgetLoading rows={4} /> : null}

      {member.isError ? (
        // A 404 here is the ordinary answer for a row outside the caller reach:
        // emerge-core refuses by pretending it is not there, so an id cannot be
        // probed for existence. Saying "no longer available to you" is truthful
        // for both that and a genuinely deleted row.
        member.error.status === 404 ? (
          <Alert severity="info" variant="outlined">
            That record is no longer available to you.
          </Alert>
        ) : (
          <WidgetError error={member.error} onRetry={() => void member.refetch()} />
        )
      ) : null}

      {member.data ? (
        <Stack spacing={2}>
          {!fieldsIntact(member.data) ? (
            <Alert severity="info" variant="outlined">
              Your school limits which details you may see on this record. Only the
              permitted ones are shown.
            </Alert>
          ) : null}

          {columns.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {capability
                ? 'The catalogue does not name the columns for this record, so nothing can be listed by field. The record itself was returned.'
                : capabilities.isError
                  ? 'The list of columns you may read could not be loaded, so nothing can be listed by field. The record itself was returned.'
                  : capabilities.isPending
                    ? 'Reading which columns may be shown…'
                    : 'You do not have permission to read the details of this record.'}
            </Typography>
          ) : (
            <Grid container spacing={2} component="dl" sx={{ m: 0 }}>
              {columns.map((column) => (
                <Grid key={column.key} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Field label={column.name}>
                    {display(member.data as unknown as Record<string, unknown>, column.key)}
                  </Field>
                </Grid>
              ))}
            </Grid>
          )}

          <Divider />
          <Typography variant="caption" color="text.secondary">
            Record id {member.data.id}
          </Typography>
        </Stack>
      ) : null}
    </Box>
  );
}

/**
 * A value, or why there is none.
 *
 * This column IS in `permitted`, so the caller may read it — which means an
 * absent value is genuinely unset rather than withheld. That is the whole
 * reason the field list is taken from the capability and not written by hand:
 * without it, absent would be ambiguous and would have to be reported as
 * "not shown", which would be wrong most of the time.
 */
function display(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value === undefined || value === null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function titleFor(kind: RosterKind, row: RosterRow): string | null {
  const person = personOf(kind, row);
  return person.status === 'present' ? nameOf(person.person) : null;
}
