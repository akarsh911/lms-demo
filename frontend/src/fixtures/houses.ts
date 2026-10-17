import type { HouseAward, HouseMember, HousePointEntry, HouseStanding, MyHouse } from '@/types/house';

import { TODAY } from './data/classroom';
import { ENROLLMENTS } from './data/enrollment';
import { PERSONS, STAFF, STUDENTS, TEACHERS } from './data/people';
import { GRADE_LEVELS, HOUSES, SECTIONS } from './data/structure';
import { newId, seedId } from './ids';
import { reachNow } from './reach';
import { fail } from './rows';

const COLOUR = { Aravali: 'red', Nilgiri: 'blue', Himalaya: 'green', Vindhya: 'amber' } as const satisfies Record<string, HouseStanding['colour']>;
const DAY = 86_400_000;
const shift = (days: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const teacherName = (id: string | undefined): string | null => PERSONS.find((p) => p.id === STAFF.find((st) => st.id === TEACHERS.find((t) => t.id === id)?.staff_id)?.person_id)?.display_name ?? null;
const labelOf = (sectionId: string | undefined): string => {
  const s = SECTIONS.find((x) => x.id === sectionId);
  return `${(GRADE_LEVELS.find((g) => g.id === s?.grade_level_id)?.name ?? '').replace('Class ', '')}${s?.name ?? ''}`;
};

// Heads by house; the fixture teacher heads Aravali so their page has a house.
const HEADS = new Map(HOUSES.map((h, i) => [h.id, TEACHERS[i * 9]?.id ?? '']));
const houseOf = (studentId: string): string => HOUSES[Number.parseInt(seedId('house-of', studentId).slice(0, 6), 16) % HOUSES.length]?.id ?? '';

const members = (houseId: string): HouseMember[] =>
  ENROLLMENTS.filter((e) => e.status === 'active' && e.section_id && houseOf(e.student_id ?? '') === houseId)
    .map((e) => ({ student_id: e.student_id ?? '', name: PERSONS.find((p) => p.id === STUDENTS.find((s) => s.id === e.student_id)?.person_id)?.display_name ?? 'Student', label: labelOf(e.section_id) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }) || a.name.localeCompare(b.name));

const EVENTS = [
  { reason: 'Inter-house quiz, first place', points: [50, 30, 20, 10] },
  { reason: 'Cleanliness week', points: [20, 40, 30, 10] },
  { reason: 'Sports day heats', points: [35, 25, 45, 15] },
  { reason: 'Debate, Class 9 to 12', points: [15, 35, 25, 45] },
];
// Each event awarded across the four houses on a fixed day; a house's order rotates by event so standings stay close.
const LOG = new Map<string, HousePointEntry[]>(
  HOUSES.map((h, i) => [h.id, EVENTS.map((e, j) => ({ id: seedId('house-points', h.id, j), date: shift(-40 + j * 9), points: e.points[i] ?? 0, reason: e.reason, by: 'School office' })).reverse()]),
);
const CAPTAINS = new Map<string, { captain: string | null; vice: string | null }>();

const total = (houseId: string): number => (LOG.get(houseId) ?? []).reduce((t, e) => t + e.points, 0);

function standings(): HouseStanding[] {
  const rows = HOUSES.map((h) => ({ house_id: h.id, name: h.name ?? 'House', colour: COLOUR[(h.name ?? '') as keyof typeof COLOUR] ?? 'blue', head: teacherName(HEADS.get(h.id)), points: total(h.id), members: members(h.id).length, rank: 0 }));
  // Houses level on points share a place.
  return rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => o.points > r.points).length })).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

function headed(): string {
  const reach = reachNow();
  if (reach.kind !== 'teaching') fail(403, 'forbidden', 'A house is run by its head.');
  const house = [...HEADS].find(([, t]) => t === reach.teacherId)?.[0];
  if (!house) fail(404, 'not_head', 'You do not head a house this year.');
  return house;
}

// The head sees their house; a pupil sees their own, with only their classmates listed.
export function myHouse(): MyHouse {
  const reach = reachNow();
  const houseId = reach.kind === 'self' ? houseOf(reach.studentId) : headed();
  const everyone = members(houseId);
  const own = reach.kind === 'self' ? everyone.find((m) => m.student_id === reach.studentId)?.label : null;
  const list = own ? everyone.filter((m) => m.label === own) : everyone;
  const caps = CAPTAINS.get(houseId) ?? { captain: everyone.find((m) => m.label.startsWith('12'))?.student_id ?? null, vice: everyone.find((m) => m.label.startsWith('11'))?.student_id ?? null };
  CAPTAINS.set(houseId, caps);
  const all = standings();
  const counts = new Map<string, number>();
  for (const m of everyone) counts.set(m.label.replace(/[A-Z]$/, ''), (counts.get(m.label.replace(/[A-Z]$/, '')) ?? 0) + 1);
  const house = all.find((s) => s.house_id === houseId) ?? fail(404, 'not_found', 'house not found');
  return {
    house,
    standings: all,
    captain: everyone.find((m) => m.student_id === caps.captain) ?? null,
    vice_captain: everyone.find((m) => m.student_id === caps.vice) ?? null,
    members: list,
    by_class: [...counts].map(([label, count]) => ({ label: `Class ${label}`, count })).sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true })),
    log: LOG.get(houseId) ?? [],
  };
}

export function awardPoints(body: HouseAward): MyHouse {
  const houseId = headed();
  if (!Number.isInteger(body.points) || body.points === 0 || Math.abs(body.points) > 100) fail(422, 'validation_failed', 'Award or deduct between 1 and 100 points.');
  if (body.reason.trim().length < 4) fail(422, 'validation_failed', 'Say what the points are for.');
  const reach = reachNow();
  LOG.set(houseId, [{ id: newId(), date: TODAY, points: body.points, reason: body.reason.trim(), by: reach.kind === 'teaching' ? (teacherName(reach.teacherId) ?? 'Head of house') : 'Head of house' }, ...(LOG.get(houseId) ?? [])]);
  return myHouse();
}

export function setCaptain(office: 'captain' | 'vice', studentId: string): MyHouse {
  const houseId = headed();
  if (!members(houseId).some((m) => m.student_id === studentId)) fail(422, 'not_member', 'Choose a member of the house.');
  const caps = CAPTAINS.get(houseId) ?? { captain: null, vice: null };
  if ((office === 'captain' ? caps.vice : caps.captain) === studentId) fail(409, 'already_holds', 'The captain and the vice-captain are two different pupils.');
  CAPTAINS.set(houseId, { ...caps, [office]: studentId });
  return myHouse();
}

