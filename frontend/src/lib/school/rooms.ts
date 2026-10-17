import type { RoomAvailability } from '@/types/foundation';
import type { Room } from '@/types/school';

const TYPE_LABEL: Readonly<Record<string, string>> = {
  classroom: 'Classroom',
  laboratory: 'Lab',
  library: 'Library',
  hall: 'Hall',
  sports: 'Sports',
  activity: 'Activity room',
};

// `room_type` is a free string on the server, so an unknown one is shown as the school typed it.
export const roomTypeLabel = (type: string | undefined): string => TYPE_LABEL[type ?? ''] ?? type ?? 'Room';

export type RoomGroup = 'classroom' | 'lab' | 'shared';

// The three kinds a principal counts rooms by.
export function roomGroup(type: string | undefined): RoomGroup {
  if (type === 'classroom') return 'classroom';
  return type === 'laboratory' ? 'lab' : 'shared';
}

export const roomPlace = (room: Pick<Room, 'building' | 'floor'>): string => {
  const floor = room.floor ? (/^\d+$/.test(room.floor) ? `Floor ${room.floor}` : `${room.floor} floor`) : '';
  return [room.building, floor].filter(Boolean).join(' · ') || 'Not set';
};

export const AVAILABILITY: Readonly<Record<RoomAvailability, { label: string; tone: 'green' | 'blue' | 'amber' | 'grey' }>> = {
  available: { label: 'Available', tone: 'green' },
  in_use: { label: 'In use', tone: 'blue' },
  maintenance: { label: 'Maintenance', tone: 'amber' },
  unavailable: { label: 'Unavailable', tone: 'grey' },
};

// Offered, not enforced: a school can type a facility of its own.
export const FACILITIES: readonly string[] = ['Projector', 'Smart Board', 'Computers', 'Lab Equipment', 'Audio System', 'Air Conditioning'];

export const CAPACITY_BANDS = [
  { key: 'small', label: 'Up to 30', test: (n: number) => n <= 30 },
  { key: 'medium', label: '31 to 50', test: (n: number) => n > 30 && n <= 50 },
  { key: 'large', label: 'Over 50', test: (n: number) => n > 50 },
] as const;

// A short code the backend needs to tell rooms apart; nobody is asked to invent one.
export function roomCode(name: string, taken: readonly (string | undefined)[]): string {
  const stem = name.replace(/[^a-z0-9]+/gi, '').slice(0, 8).toUpperCase() || 'ROOM';
  for (let n = 0; n < 100; n += 1) {
    const code = n === 0 ? stem : `${stem.slice(0, 6)}${n + 1}`;
    if (!taken.includes(code)) return code;
  }
  return `${stem.slice(0, 5)}${Date.now() % 1000}`;
}

// Ground first, then floors by number, then anything the school named differently; rooms with no floor last.
export function floorOrder(floor: string | undefined): number {
  if (!floor) return 1000;
  if (/^(ground|g)$/i.test(floor)) return 0;
  if (/^(basement|b)$/i.test(floor)) return -1;
  return /^\d+$/.test(floor) ? Number(floor) : 500;
}

export const floorLabel = (floor: string | undefined): string =>
  !floor ? 'Floor not set' : /^\d+$/.test(floor) ? `Floor ${floor}` : /floor$/i.test(floor) ? floor : `${floor} floor`;

export const NO_BUILDING = 'Not in a building';
