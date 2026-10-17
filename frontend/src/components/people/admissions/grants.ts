'use client';

import { useCapabilities } from '@/hooks/query/use-capabilities';
import { capabilityFor } from '@/lib/core/fields';

export interface AdmissionGrants {
  settled: boolean;
  mayProvision: boolean;
  mayCreateStudent: boolean;
  mayWriteStaff: boolean;
  mayCreateTeacher: boolean;
  mayEnrol: boolean;
}

export function useAdmissionGrants(): AdmissionGrants {
  const capabilities = useCapabilities();
  const held = capabilities.data?.capabilities;

  const offers = (key: string): boolean =>
    !held || capabilityFor(held, key) !== undefined;

  return {
    settled: Boolean(held),
    mayProvision: offers('core.persons.write'),
    mayCreateStudent: offers('core.students.create'),
    mayWriteStaff: offers('core.staff.write'),
    mayCreateTeacher: offers('core.teachers.create'),
    mayEnrol: offers('core.enrollments.write'),
  };
}
