export type FeeStatus = 'paid' | 'overdue' | 'upcoming';

export interface FeeInstalment {
  term: string;
  amount: number;
  due: string;
  status: FeeStatus;
  late_fee: number;
  paid_on: string | null;
  receipt: string | null;
}

export interface MyFees {
  student: string;
  section: string;
  year: string;
  instalments: FeeInstalment[];
  paid: number;
  outstanding: number;
}

export interface FeeDefaulter {
  student_id: string;
  student: string;
  section: string;
  term: string;
  amount: number;
  days_overdue: number;
  late_fee: number;
}

export interface FeeOverview {
  billed: number;
  collected: number;
  outstanding: number;
  families_behind: number;
  over_60: number;
  defaulters: FeeDefaulter[];
}
