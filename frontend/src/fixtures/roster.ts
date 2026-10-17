import { ROSTER_KINDS, type RosterKind } from '@/constants/roster';
import type { CorePerson } from '@/types/core';
import type { ProvisionRequest, ProvisionResult, StaffWrite, StudentWrite, TeacherWrite } from '@/types/people-write';
import type { RosterPage, RosterRow, StaffRow, StudentRow, TeacherRow } from '@/types/roster';
import type { EnrollmentRow, EnrollmentWrite } from '@/types/rostering';
import { seesSection } from '@/lib/reach/reach';

import { ENROLLMENTS } from './data/enrollment';
import { ACCOUNTS, GUARDIANS, PERSONS, STAFF, STUDENTS, TEACHERS } from './data/people';
import { CURRENT_SESSION, SECTIONS } from './data/structure';
import { seedId } from './ids';
import { reachNow } from './reach';
import { SCHOOL_CODE, byId, fail, insert, must, page, type Query } from './rows';

const TAKEN = 'that value is already taken, or it references a row that does not exist';

const TABLES: Record<RosterKind, RosterRow[]> = { students: STUDENTS, staff: STAFF, teachers: TEACHERS, guardians: GUARDIANS };

type WithPerson = { person_id?: string; edges?: { person?: CorePerson } };

// Rows embed a copy of their person; resolve it live so an edit shows up in every list.
function withPerson<T extends WithPerson>(row: T): T {
  const person = byId(PERSONS, row.person_id);
  return person ? { ...row, edges: { ...row.edges, person } } : row;
}

function hydrate(kind: RosterKind, row: RosterRow): RosterRow {
  if (kind !== 'teachers') return withPerson(row as WithPerson & RosterRow);
  const teacher = row as TeacherRow;
  const staff = byId(STAFF, teacher.staff_id);
  return staff ? { ...teacher, edges: { staff: withPerson(staff) } } : teacher;
}

function personOf(kind: RosterKind, row: RosterRow): CorePerson | undefined {
  const hydrated = hydrate(kind, row);
  if (kind === 'teachers') return (hydrated as TeacherRow).edges?.staff?.edges?.person;
  return (hydrated as WithPerson).edges?.person;
}

// A field policy can delete a row's whole `edges` key; one staff row here arrives that way.
function withheldEdges(kind: RosterKind, row: RosterRow): RosterRow {
  if (kind !== 'staff' || row.id !== STAFF[2]?.id) return row;
  const { edges: _edges, person_id: _person, ...rest } = row as RosterRow & { person_id?: string };
  return rest;
}

const rollOf = (sectionId: string): Set<string> =>
  new Set(
    ENROLLMENTS.filter((e) => e.section_id === sectionId && e.academic_session_id === CURRENT_SESSION.id).map(
      (e) => e.student_id ?? '',
    ),
  );

export function rosterPage<T extends RosterRow>(kind: RosterKind, query: Query & { q?: string }): RosterPage<T> {
  const q = ROSTER_KINDS[kind].searchable ? (query.q ?? '').toLowerCase() : '';
  const sectionId = kind === 'students' && typeof query.section_id === 'string' ? query.section_id : '';
  const roll = sectionId ? rollOf(sectionId) : null;

  const matched = TABLES[kind]
    .filter((row) => !q || (personOf(kind, row)?.display_name ?? '').toLowerCase().includes(q))
    .filter((row) => !roll || roll.has(row.id));
  const answer = page(matched, { limit: query.limit, offset: query.offset });

  // The first student of every page is withheld, so `count` exceeds the array as it can for real.
  const shown = (kind === 'students' ? answer.rows.slice(1) : answer.rows).map((row) => withheldEdges(kind, hydrate(kind, row)));
  return { school: SCHOOL_CODE, rows: shown as T[], count: answer.count, page: answer.page };
}

export const rosterRow = <T extends RosterRow>(kind: RosterKind, id: string): T => {
  // A pupil outside the caller's sections answers 404, as emerge-core does, so an id cannot be probed.
  const reach = reachNow();
  if (kind === 'students' && reach.kind !== 'school' && !ENROLLMENTS.some((e) => e.student_id === id && e.status !== 'withdrawn' && seesSection(reach, e.section_id))) fail(404, 'not_found', 'student not found');
  return hydrate(kind, must(TABLES[kind], id)) as T;
};

// Deterministic, so the one-time password a screen shows is the same on every run of the same flow.
function devPassword(seed: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 20; i += 1) out += alphabet[(seed * 31 + i * 17) % alphabet.length];
  return `Eg#${out}`;
}

// CAS links an existing login rather than minting a second one: by username first, then by email.
function holderOf(username: string, email: string): { person: CorePerson; casUserId: string } | undefined {
  const account = byId(ACCOUNTS, username) ?? (email ? byId(ACCOUNTS, email) : undefined);
  const person = account
    ? byId(PERSONS, account.person_id)
    : email
      ? PERSONS.find((row) => row.email?.toLowerCase() === email)
      : undefined;
  return person ? { person, casUserId: account?.cas_user_id ?? seedId('cas-user', person.id) } : undefined;
}

export function provisionPerson(input: ProvisionRequest): ProvisionResult {
  const username = (input.username ?? '').trim().toLowerCase();
  const firstName = (input.first_name ?? '').trim();
  const email = (input.email ?? '').trim().toLowerCase();
  if (username === '') fail(400, 'invalid_input', 'provisioning: username is required');
  if (firstName === '') fail(400, 'invalid_input', 'provisioning: first_name is required');

  const generated = input.password ? '' : devPassword(ACCOUNTS.length + 1);
  const existing = holderOf(username, email);
  const lastName = (input.last_name ?? '').trim();
  const person =
    existing?.person ??
    insert(PERSONS, {
      first_name: firstName,
      display_name: input.display_name?.trim() || [firstName, lastName].filter(Boolean).join(' '),
      status: 'active',
      middle_name: input.middle_name?.trim() || undefined,
      last_name: lastName || undefined,
      email: input.email?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
    });
  const casUserId = existing?.casUserId ?? seedId('cas-user', person.id);
  if (!existing) {
    for (const key of [username, email].filter(Boolean)) insert(ACCOUNTS, { id: key, person_id: person.id, cas_user_id: casUserId });
  }

  return {
    person,
    cas_user_id: casUserId,
    created_in_cas: !existing,
    linked_existing: Boolean(existing),
    ...(input.group_keys?.length ? { groups: input.group_keys } : {}),
    ...(generated !== '' ? { password: generated } : {}),
  };
}

export function createStudent(body: StudentWrite): StudentRow {
  const admissionNumber = (body.admission_number ?? '').trim();
  if (!body.person_id) fail(400, 'invalid_input', 'person_id is required, or a person object to create one');
  if (admissionNumber === '') fail(400, 'invalid_input', 'admission_number is required');
  if (STUDENTS.some((row) => row.admission_number === admissionNumber)) fail(409, 'conflict', TAKEN);
  return insert(STUDENTS, { ...body, admission_number: admissionNumber, status: body.status ?? 'active' });
}

export function createStaff(body: StaffWrite): StaffRow {
  const employeeCode = (body.employee_code ?? '').trim();
  if (!body.person_id) fail(400, 'invalid_input', 'person_id is required, or a person object to create one');
  if (employeeCode === '') fail(400, 'invalid_input', 'employee_code is required');
  if (STAFF.some((row) => row.employee_code === employeeCode)) fail(409, 'conflict', TAKEN);
  return insert(STAFF, { ...body, employee_code: employeeCode, status: body.status ?? 'active' });
}

export function createEnrollment(body: EnrollmentWrite): EnrollmentRow {
  if (!body.student_id || !body.section_id || !body.academic_session_id) {
    fail(400, 'invalid_input', 'student_id, section_id and academic_session_id are required');
  }
  // Somebody enrolled through the admission form is, in this year's register, a new admission in that section's class.
  const grade = SECTIONS.find((section) => section.id === body.section_id)?.grade_level_id ?? '';
  return insert(ENROLLMENTS, { ...body, status: body.status ?? 'active', grade_level_id: grade, entry: 'new_admission', next_year: 'promote' });
}

export function createTeacher(body: TeacherWrite): TeacherRow {
  if (!body.staff_id) fail(400, 'invalid_input', 'staff_id is required: create the staff record first');
  return insert(TEACHERS, { ...body, status: body.status ?? 'active' });
}
