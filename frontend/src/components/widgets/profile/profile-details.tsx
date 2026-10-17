'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CardActions from '@mui/material/CardActions';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Pencil } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { SettingsSection } from '@/components/ui/settings-section';
import { Avatar } from '@/components/ui/row';
import { useUpdatePerson } from '@/hooks/mutation/use-update-person';
import { deniedFieldsFrom, mayWriteField, readVisibility } from '@/lib/core/fields';
import type { ApiError } from '@/services/api';
import type { Capability, CorePerson } from '@/types/core';

import { PROFILE_FIELDS, PROFILE_GROUPS, changedFields, type ProfileField } from './profile-fields';

const GRID = { display: 'grid', columnGap: 3, rowGap: 2.5, m: 0 } as const;
const TWO_UP = { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } as const;
// Read-only values are short, so a wide screen takes four to a row; inputs stay two.
const FOUR_UP = { ...TWO_UP, xl: 'repeat(4, minmax(0, 1fr))' } as const;

// The person's readable values as form strings. A withheld field reads ''.
function valuesOf(person: CorePerson): Record<string, string> {
  return Object.fromEntries(PROFILE_FIELDS.map((field) => [field.key, person[field.key] ?? '']));
}

function nameOf(person: CorePerson): string {
  return person.display_name ?? [person.first_name, person.last_name].filter(Boolean).join(' ');
}

export function ProfileDetails({
  title,
  school,
  person,
  read,
  write,
}: {
  title: string;
  school: string | undefined;
  person: CorePerson;
  read: Capability | undefined;
  write: Capability | undefined;
}): React.ReactElement {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>(() => valuesOf(person));
  const initial = React.useRef<Record<string, string>>(valuesOf(person));

  const mutation = useUpdatePerson(person.id);

  // Presentation first (no input exists for status or the photo id), then the caller's write policy.
  const editable = PROFILE_FIELDS.filter((field) => field.editable && mayWriteField(write, field.key));
  const denied = mutation.error?.isForbidden ? deniedFieldsFrom(mutation.error.message) : [];

  // Focus goes to the first refused input: an error the keyboard was not taken to has to be hunted for.
  const inputs = React.useRef(new Map<string, HTMLInputElement>());
  const firstDenied = denied[0];
  React.useEffect(() => {
    if (firstDenied) inputs.current.get(firstDenied)?.focus();
  }, [firstDenied]);

  const beginEdit = (): void => {
    // Seeded here, not from an effect on `person`: a refetch landing mid-edit would discard what was typed.
    const values = valuesOf(person);
    initial.current = values;
    setDraft(values);
    mutation.reset();
    setEditing(true);
  };

  const cancelEdit = (): void => {
    mutation.reset();
    setEditing(false);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const patch = changedFields(initial.current, draft, editable);
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    mutation.mutate(patch, { onSuccess: () => setEditing(false) });
  };

  const name = nameOf(person);
  const identity = (
    <Stack
      direction="row"
      spacing={2.5}
      sx={(theme) => ({ alignItems: 'center', px: 3, py: 3, backgroundColor: theme.brand.subtle, borderBottom: `1px solid ${theme.brand.line}` })}
    >
      <Avatar name={name || '?'} size={72} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="h2" component="p" sx={{ overflowWrap: 'anywhere' }}>
          {name || 'Name not shown to you'}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {[person.email, school].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      {/* The value the record carries; no endpoint enumerates these. */}
      {person.status ? <EmergeChip label={person.status} dot /> : null}
    </Stack>
  );

  if (!editing) {
    return (
      <>
        <CardHeader
          title={title}
          subheader="What your school holds about you"
          action={
            editable.length > 0 ? (
              <Button variant="outlined" size="small" startIcon={<Pencil size={14} />} onClick={beginEdit}>
                Edit details
              </Button>
            ) : undefined
          }
        />
        {identity}

        {mutation.isSuccess ? (
          <Alert severity="success" variant="outlined" role="status" sx={{ mx: 3, mt: 3 }}>
            Your details were saved.
          </Alert>
        ) : null}

        {PROFILE_GROUPS.map((group) => (
          <SettingsSection key={group.key} title={group.title} hint={group.hint}>
            <Box component="dl" sx={{ ...GRID, gridTemplateColumns: FOUR_UP }}>
              {PROFILE_FIELDS.filter((field) => field.group === group.key).map((field) => {
                const visibility = readVisibility(read, field.key, person[field.key]);
                return (
                  <Field key={field.key} label={field.label} quiet={visibility !== 'shown'}>
                    {/* Withheld is not empty: "Not set" would say the school holds nothing when it holds something unreadable. */}
                    {visibility === 'shown' ? person[field.key] : visibility === 'withheld' ? 'Not shown to you' : 'Not set'}
                  </Field>
                );
              })}
            </Box>
          </SettingsSection>
        ))}

        {editable.length === 0 ? (
          <CardActions>
            <Typography variant="body2" color="text.secondary">
              Your school manages these details. Contact the office to change them.
            </Typography>
          </CardActions>
        ) : null}
      </>
    );
  }

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <CardHeader title="Edit your details" subheader="Only what you change is sent" />
      {identity}

      {mutation.isError ? (
        <Box sx={{ px: 3, pt: 3 }}>
          <SaveError error={mutation.error} denied={denied} />
        </Box>
      ) : null}

      {PROFILE_GROUPS.map((group) => {
        const fields = editable.filter((field) => field.group === group.key);
        if (fields.length === 0) return null;
        return (
          <SettingsSection key={group.key} title={group.title} hint={group.hint}>
            <Box sx={{ ...GRID, gridTemplateColumns: TWO_UP }}>
              {fields.map((field) => (
                <ProfileInput
                  key={field.key}
                  field={field}
                  value={draft[field.key] ?? ''}
                  refused={denied.includes(field.key)}
                  hidden={readVisibility(read, field.key, person[field.key]) === 'withheld'}
                  disabled={mutation.isPending}
                  onChange={(next) => setDraft((prev) => ({ ...prev, [field.key]: next }))}
                  inputRef={(el) => {
                    if (el) inputs.current.set(field.key, el);
                    else inputs.current.delete(field.key);
                  }}
                />
              ))}
            </Box>
          </SettingsSection>
        );
      })}

      <CardActions sx={{ justifyContent: 'flex-end', gap: 1 }}>
        <Button variant="outlined" onClick={cancelEdit} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={mutation.isPending}>
          Save changes
        </Button>
      </CardActions>
    </Box>
  );
}

function ProfileInput({
  field,
  value,
  refused,
  hidden,
  disabled,
  onChange,
  inputRef,
}: {
  field: ProfileField;
  value: string;
  refused: boolean;
  hidden: boolean;
  disabled: boolean;
  onChange: (next: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}): React.ReactElement {
  return (
    <TextField
      inputRef={inputRef}
      name={field.key}
      label={field.label}
      type={field.type ?? 'text'}
      autoComplete={field.autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={refused}
      helperText={
        refused
          ? 'You are not permitted to change this. It was not saved.'
          : hidden
            ? 'Hidden from you. Leave it blank and it stays as it is.'
            : undefined
      }
      disabled={disabled}
      fullWidth
    />
  );
}

// emerge-core's 403 names the columns it refused; dropping that leaves a user re-submitting the same form.
function SaveError({ error, denied }: { error: ApiError; denied: readonly string[] }): React.ReactElement {
  const labels = denied.map((key) => PROFILE_FIELDS.find((field) => field.key === key)?.label ?? key);

  return (
    <Alert severity="warning" variant="outlined" role="alert">
      <AlertTitle>Nothing was saved</AlertTitle>
      {labels.length > 0
        ? `You are not permitted to change ${labels.join(', ')}. Clear those fields and the rest of your changes will save.`
        : error.isForbidden
          ? 'Your school does not permit this change.'
          : 'Your changes could not be saved. Try again.'}
    </Alert>
  );
}
