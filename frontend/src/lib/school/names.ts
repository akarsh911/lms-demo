import { nameOf, personOf } from '@/lib/core/roster';
import type { StudentRow, TeacherRow } from '@/types/roster';
import type { Period, Room, SchoolOfferingRow, SectionRow } from '@/types/school';

/**
 * What to call the things a timetable is made of.
 *
 * Pure. No React, no fetch.
 *
 * Every one of these can fail to find a name, and each says so differently
 * because the reasons differ: a room the caller cannot read is not the same as
 * a room that has not been created. Nothing here invents a label from an id
 * without marking it — a bare UUID on screen is how a missing join goes
 * unnoticed for a month.
 */

export function sectionLabel(section: SectionRow | undefined): string {
  if (!section) return 'Unknown class';
  const grade = section.edges?.grade_level?.name;
  const name = section.name ?? section.code;
  if (grade && name) return `${grade} · ${name}`;
  return name ?? grade ?? 'Class';
}

export function roomLabel(room: Room | undefined): string {
  if (!room) return 'Unknown room';
  const where = [room.building, room.floor].filter(Boolean).join(' · ');
  const name = room.name ?? room.code ?? 'Room';
  return where ? `${name} (${where})` : name;
}

export function offeringLabel(offering: SchoolOfferingRow | undefined): string {
  if (!offering) return 'Unknown subject';
  return offering.edges?.subject?.name ?? offering.edges?.subject?.code ?? 'Subject';
}

export function periodLabel(period: Period | undefined): string {
  if (!period) return 'Unknown period';
  return period.name ?? period.code ?? `Period ${period.sequence ?? ''}`.trim();
}

/** Ids to rows, for the joins the slot rows do not carry: they have no edges. */
export function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * Teacher id to a name, when the directory could be read.
 *
 * A teacher reaches their person through staff, which is why this goes through
 * `personOf` rather than reading an edge directly. An entry is absent when the
 * caller lacks `core.teachers.read` — the whole directory is a 403 then — and
 * the caller shows the assignment instead of a name.
 */
export function teacherNames(rows: readonly TeacherRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const found = personOf('teachers', row);
    if (found.status !== 'present') continue;
    const name = nameOf(found.person);
    if (name) out.set(row.id, name);
  }
  return out;
}

export function studentNames(rows: readonly StudentRow[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const found = personOf('students', row);
    if (found.status !== 'present') continue;
    const name = nameOf(found.person);
    if (name) out.set(row.id, name);
  }
  return out;
}

/** A short, honest stand-in for an id nothing could name. */
export function shortId(id: string | undefined): string {
  return id ? id.slice(0, 8) : '';
}
