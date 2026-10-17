'use client';

import { useCapabilities } from '@/hooks/query/use-capabilities';
import { capabilityFor, showsSubsetOfSchool } from '@/lib/core/fields';
import { readReach, type ReadReach } from '@/lib/school/reach';

export interface RosteringGrants {
  settled: boolean;
  enrolmentReach: ReadReach;
  studentReach: ReadReach;
  teachingReach: ReadReach;
  subjectEnrolmentReach: ReadReach;
  mayWriteEnrolment: boolean;
  mayDeleteEnrolment: boolean;
  mayWriteTeaching: boolean;
  mayDeleteTeaching: boolean;
  teachingWriteNarrowed: boolean;
  mayWriteSubjectEnrolment: boolean;
  mayDeleteSubjectEnrolment: boolean;
}

export function useRosteringGrants(): RosteringGrants {
  const capabilities = useCapabilities();
  const held = capabilities.data?.capabilities;

  const offers = (key: string): boolean =>
    !held || capabilityFor(held, key) !== undefined;

  return {
    settled: Boolean(held),
    enrolmentReach: readReach(held, 'core.enrollments.read'),
    studentReach: readReach(held, 'core.students.read'),
    teachingReach: readReach(held, 'core.teacher_assignments.read'),
    subjectEnrolmentReach: readReach(held, 'core.subject_enrollments.read'),
    mayWriteEnrolment: offers('core.enrollments.write'),
    mayDeleteEnrolment: offers('core.enrollments.delete'),
    mayWriteTeaching: offers('core.teacher_assignments.write'),
    mayDeleteTeaching: offers('core.teacher_assignments.delete'),
    teachingWriteNarrowed: showsSubsetOfSchool(
      held ? capabilityFor(held, 'core.teacher_assignments.write') : undefined,
    ),
    mayWriteSubjectEnrolment: offers('core.subject_enrollments.write'),
    mayDeleteSubjectEnrolment: offers('core.subject_enrollments.delete'),
  };
}
