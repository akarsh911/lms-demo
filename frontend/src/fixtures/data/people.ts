import type { CorePerson } from '@/types/core';
import type { GuardianRow, StaffRow, StudentRow, TeacherRow } from '@/types/roster';

import { seedId } from '../ids';
import { STUDENT_COUNT, placementOf } from './cohort';

const FIRST = [
  'Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Zara', 'Ishaan', 'Anaya', 'Vivaan', 'Saanvi',
  'Arjun', 'Myra', 'Reyansh', 'Aadhya', 'Kiaan', 'Ira', 'Advik', 'Navya', 'Dhruv', 'Anika',
  'Aryan', 'Riya', 'Yuvan', 'Tara', 'Neel', 'Aisha', 'Veer', 'Kyra', 'Ayaan', 'Siya',
] as const;

const LAST = [
  'Sharma', 'Nair', 'Patel', 'Iyer', 'Gupta', 'Khan', 'Rao', 'Das', 'Menon', 'Joshi',
  'Bose', 'Pillai', 'Dutta', 'Kulkarni', 'Ghosh', 'Chauhan', 'Reddy', 'Mehta', 'Saxena', 'Bhatt',
  'Malhotra', 'Varma', 'Shetty', 'Bajaj', 'Kapoor', 'Qureshi', 'Sinha', 'Mishra', 'Trivedi', 'Chopra',
] as const;

export { STUDENT_COUNT };
export const TEACHER_COUNT = 96;
export const ADMIN_COUNT = 6;
export const GUARDIAN_COUNT = 960;

const FEMALE = new Set(['Diya', 'Meera', 'Zara', 'Anaya', 'Saanvi', 'Myra', 'Aadhya', 'Ira', 'Navya', 'Anika', 'Riya', 'Tara', 'Aisha', 'Kyra', 'Siya']);

// Birth year by kind; students are aged from the grade the seed puts them in.
function birthYear(kind: string, index: number): number {
  if (kind === 'student') return 2026 - (11 + placementOf(index).grade);
  return kind === 'staff' ? 1975 + ((index * 7) % 24) : 1970 + ((index * 5) % 16);
}

// Coprime strides so first/last names pair up without repeating for 900 combinations.
function person(kind: string, index: number, strideFirst: number, strideLast: number): CorePerson {
  // Offset by kind, so the first student, teacher and guardian are not all the same name.
  const first = FIRST[(index * strideFirst + kind.length) % FIRST.length] ?? 'Asha';
  const last = LAST[(index * strideLast + Math.floor(index / FIRST.length) + kind.length * 3) % LAST.length] ?? 'Rao';
  const id = seedId('person', kind, index);
  return {
    id,
    first_name: first,
    last_name: last,
    display_name: `${first} ${last}`,
    email: `${first}.${last}${index}`.toLowerCase() + '@dps-ngp.example',
    date_of_birth: `${birthYear(kind, index)}-${String((index % 12) + 1).padStart(2, '0')}-${String((index * 3) % 27 + 1).padStart(2, '0')}T00:00:00Z`,
    gender: FEMALE.has(first) ? 'female' : 'male',
    phone: `+91 9${String(100000000 + ((index * 7919 + kind.length * 104729) % 899999999))}`,
    status: 'active',
  };
}

// A leaver keeps their record: the person is permanent, only the enrolment ends.
const STUDENT_STATUS = { placed: 'active', unassigned: 'active', withdrawn: 'inactive', graduated: 'alumni', withdrew_last_year: 'inactive' } as const;

export const STUDENT_PEOPLE = Array.from({ length: STUDENT_COUNT }, (_, i) => person('student', i, 7, 11));
export const STAFF_PEOPLE = Array.from({ length: TEACHER_COUNT + ADMIN_COUNT }, (_, i) => person('staff', i, 11, 7));
export const GUARDIAN_PEOPLE = Array.from({ length: GUARDIAN_COUNT }, (_, i) => person('guardian', i, 13, 17));

export const STUDENTS: StudentRow[] = STUDENT_PEOPLE.map((p, i) => ({
  id: seedId('student', i),
  person_id: p.id,
  admission_number: `ADM${2600 + i}`,
  student_code: `S${100 + i}`,
  admission_date: '2026-04-01',
  status: STUDENT_STATUS[placementOf(i).standing],
  edges: { person: p },
}));

export const STAFF: StaffRow[] = STAFF_PEOPLE.map((p, i) => ({
  id: seedId('staff', i),
  person_id: p.id,
  employee_code: `EMP${500 + i}`,
  designation: i < TEACHER_COUNT ? 'Teacher' : ['Administrator', 'Registrar', 'Accountant', 'Librarian'][i % 4],
  employment_type: 'full_time',
  joining_date: '2019-06-01',
  status: 'active',
  edges: { person: p },
}));

// Ninety-six teachers for forty-eight classes, in the proportion the subject plans ask for.
export const SPECIALIZATIONS = [
  ...Array<string>(15).fill('Mathematics'),
  ...Array<string>(9).fill('Physics'),
  ...Array<string>(9).fill('Chemistry'),
  ...Array<string>(9).fill('Biology'),
  ...Array<string>(15).fill('English'),
  ...Array<string>(12).fill('Hindi'),
  ...Array<string>(12).fill('Social Science'),
  ...Array<string>(9).fill('Computer Science'),
  ...Array<string>(6).fill('Physical Education'),
] as const;

export const TEACHERS: TeacherRow[] = STAFF.slice(0, TEACHER_COUNT).map((staff, i) => ({
  id: seedId('teacher', i),
  staff_id: staff.id,
  teacher_code: `T${200 + i}`,
  specialization: SPECIALIZATIONS[i],
  status: 'active',
  edges: { staff },
}));

export const GUARDIANS: GuardianRow[] = GUARDIAN_PEOPLE.map((p, i) => ({
  id: seedId('guardian', i),
  person_id: p.id,
  occupation: ['Engineer', 'Physician', 'Business owner', 'Teacher', 'Civil servant'][i % 5],
  employer: i % 3 === 0 ? 'Self employed' : undefined,
  status: 'active',
  edges: { person: p },
}));

export const PERSONS: CorePerson[] = [...STUDENT_PEOPLE, ...STAFF_PEOPLE, ...GUARDIAN_PEOPLE];

// A CAS login the fixtures have provisioned, keyed by username and again by email.
export interface ProvisionedAccount {
  id: string;
  person_id: string;
  cas_user_id: string;
}

export const ACCOUNTS: ProvisionedAccount[] = [];
