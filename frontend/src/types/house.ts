export interface HouseStanding {
  house_id: string;
  name: string;
  colour: 'red' | 'blue' | 'green' | 'amber';
  head: string | null;
  points: number;
  members: number;
  rank: number;
}

export interface HouseMember {
  student_id: string;
  name: string;
  label: string;
}

export interface HousePointEntry {
  id: string;
  date: string;
  points: number;
  reason: string;
  by: string;
}

// The house a teacher heads: its standing among the four, its people and the points it has earned.
export interface MyHouse {
  house: HouseStanding;
  standings: HouseStanding[];
  captain: HouseMember | null;
  vice_captain: HouseMember | null;
  members: HouseMember[];
  by_class: { label: string; count: number }[];
  log: HousePointEntry[];
}

export interface HouseAward {
  points: number;
  reason: string;
}
