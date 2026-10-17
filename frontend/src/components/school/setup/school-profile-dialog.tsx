'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { useUpdateSchoolProfile } from '@/hooks/mutation/use-foundation';
import type { SchoolProfile, SchoolProfileWrite } from '@/types/foundation';

export function SchoolProfileDialog({ profile, onClose }: { profile: SchoolProfile; onClose: () => void }): React.ReactElement {
  const [form, setForm] = React.useState<SchoolProfileWrite>({
    name: profile.name,
    short_name: profile.short_name,
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
  });
  const mutation = useUpdateSchoolProfile();
  const notify = useToast();

  const field = (key: keyof SchoolProfileWrite) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: event.target.value })),
    disabled: mutation.isPending,
    fullWidth: true,
  });

  return (
    <FormDialog
      open
      title="Edit school profile"
      submitLabel="Save changes"
      pending={mutation.isPending}
      error={mutation.error}
      canSubmit={form.name.trim() !== ''}
      onClose={onClose}
      onSubmit={() =>
        mutation.mutate(form, {
          onSuccess: () => {
            notify('School profile updated');
            onClose();
          },
        })
      }
    >
      <TextField label="School name" required autoFocus {...field('name')} />
      <TextField label="Short name" helperText="Used where the full name does not fit" {...field('short_name')} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField label="Phone" type="tel" {...field('phone')} />
        <TextField label="Email" type="email" {...field('email')} />
      </Stack>
      <TextField label="Address" multiline minRows={2} {...field('address')} />
    </FormDialog>
  );
}
