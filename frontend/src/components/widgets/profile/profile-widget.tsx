'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';

import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useIdentity } from '@/hooks/query/use-identity';
import { capabilityFor } from '@/lib/core/fields';
import type { WidgetProps } from '@/types/widget';

import { WidgetEmpty, WidgetError, WidgetLoading } from '../widget-states';
import { ProfileDetails } from './profile-details';

const PERSONS_READ = 'core.persons.read';
const PERSONS_WRITE = 'core.persons.write';

/**
 * The caller's own record in emerge-core: view, and edit what they may.
 *
 * Three things drive what is on screen and each answers a different question:
 *
 *   `/auth/me`        what the person IS, already projected through the
 *                     caller's field policy. An absent field is withheld, not
 *                     empty — `readVisibility` is what tells the two apart.
 *   `/capabilities`   which columns the caller may WRITE. Not a list of names
 *                     but a three-valued answer; `mayWriteField` reads it, and
 *                     reads `enumerated: false` as "cannot say" rather than
 *                     "nothing", which is the mistake that hides usable inputs.
 *   `PATCH /persons`  the ANSWER. Capabilities describe; only this decides, and
 *                     a 403 from it names the columns it refused.
 */
export function ProfileWidget({ title }: WidgetProps): React.ReactElement {
  const identity = useIdentity();
  const capabilities = useCapabilities();

  const isPending = identity.isPending || capabilities.isPending;
  const isError = identity.isError || capabilities.isError;
  const error = identity.error ?? capabilities.error;

  const retry = (): void => {
    void identity.refetch();
    void capabilities.refetch();
  };

  const person = identity.data?.person;
  const school = identity.data?.school;

  const ready = !isPending && !isError && person;

  return (
    <Card sx={{ height: '100%' }}>
      {ready ? (
        <ProfileDetails
          title={title}
          school={school?.name}
          person={person}
          read={capabilityFor(capabilities.data?.capabilities, PERSONS_READ)}
          write={capabilityFor(capabilities.data?.capabilities, PERSONS_WRITE)}
        />
      ) : (
        <>
          {/* The school's own name, from the API: nothing about which school this is may be written into the bundle. */}
          <CardHeader title={title} subheader={school?.name} />
          <CardContent>
            {isPending ? <WidgetLoading rows={6} /> : null}
            {!isPending && isError ? <WidgetError error={error} onRetry={retry} /> : null}
            {!isPending && !isError ? (
              <WidgetEmpty message="This account is signed in, but the school holds no person record linked to it yet. Your school office can link one." />
            ) : null}
          </CardContent>
        </>
      )}
    </Card>
  );
}
