export const ACTION_CATEGORIES = ['students', 'fees', 'discipline', 'staff', 'academics', 'feedback', 'admissions', 'facilities', 'compliance', 'communication'] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export type ActionPriority = 'urgent' | 'high' | 'normal';

// Open until someone resolves it; snoozed hides it until a time, then it is open again.
export type ActionStatus = 'open' | 'snoozed' | 'done';

export interface ActionLink {
  label: string;
  // A path under the persona, as the sidebar routes are written.
  path: string;
}

// One affected person or thing, as a row of the item's detail.
export interface ActionRow {
  id: string;
  primary: string;
  secondary: string;
  value: string;
  tone: 'red' | 'amber' | 'grey' | 'green';
}

export interface ActionNote {
  at: string;
  author: string;
  text: string;
}

export interface ActionItem {
  id: string;
  kind: string;
  category: ActionCategory;
  priority: ActionPriority;
  title: string;
  detail: string;
  // Who or what it is about, in a few words: "8C", "Meera Pillai", "Class 10".
  about: string;
  count: number | null;
  raised_at: string;
  due_at: string | null;
  status: ActionStatus;
  snoozed_until: string | null;
  owner: string | null;
  link: ActionLink | null;
  // The one-click step the item offers, recorded as a note when taken.
  quick: string | null;
}

export interface ActionDetail extends ActionItem {
  explanation: string;
  columns: [string, string, string];
  rows: ActionRow[];
  notes: ActionNote[];
}

export interface ActionSummary {
  urgent: number;
  due_today: number;
  open: number;
  done_week: number;
  by_category: Record<ActionCategory, number>;
}

export interface ActionOwner {
  id: string;
  name: string;
  duty: string;
}
