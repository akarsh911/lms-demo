'use client';

import { byId, offeringLabel, periodLabel, roomLabel, sectionLabel, shortId } from '@/lib/school/names';
import type { Period, Room, SchoolOfferingRow, SectionRow } from '@/types/school';

/**
 * Names for the ids a slot and a clash are made of.
 *
 * `timetable_slots` come back with an EMPTY `edges` object — the list handler
 * loads no edges at all — so every label on the grid is a join the browser does
 * against lists it already holds. This is that join, in one place, so a cell
 * and a clash report cannot end up calling the same room two different things.
 *
 * `teacher` is the one that can genuinely fail: `/teachers` needs
 * `core.teachers.read`, and a principal holding `core.teachers.read_all` does
 * not have it. `teacherDirectory` says which case a caller is in, so the UI can
 * explain the gap rather than print a UUID and hope. It separates a refusal
 * from a directory that merely would not load: only the first is about what
 * the account may do.
 */
export type TeacherDirectoryState = 'readable' | 'denied' | 'unavailable';

export interface NameBook {
  section: (id?: string) => string;
  period: (id?: string) => string;
  offering: (id?: string) => string;
  room: (id?: string) => string;
  teacher: (id?: string) => string;
  teacherDirectory: TeacherDirectoryState;
}

export function makeNameBook({
  sections,
  periods,
  rooms,
  offerings,
  teachers,
  teacherDirectory,
}: {
  sections: readonly SectionRow[];
  periods: readonly Period[];
  rooms: readonly Room[];
  offerings: readonly SchoolOfferingRow[];
  teachers: Map<string, string>;
  teacherDirectory: TeacherDirectoryState;
}): NameBook {
  const sectionMap = byId(sections);
  const periodMap = byId(periods);
  const roomMap = byId(rooms);
  const offeringMap = byId(offerings);

  return {
    section: (id) => (id ? sectionLabel(sectionMap.get(id)) : '—'),
    period: (id) => (id ? periodLabel(periodMap.get(id)) : '—'),
    offering: (id) => (id ? offeringLabel(offeringMap.get(id)) : '—'),
    room: (id) => (id ? roomLabel(roomMap.get(id)) : '—'),
    teacher: (id) => {
      if (!id) return '—';
      const name = teachers.get(id);
      if (name) return name;
      return teacherDirectory === 'denied'
        ? `Teacher (name withheld)`
        : `Teacher ${shortId(id)}`;
    },
    teacherDirectory,
  };
}
