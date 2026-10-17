import type { ActionDetail, ActionItem, ActionNote, ActionOwner, ActionStatus, ActionSummary } from '@/types/actions';
import { ACTION_CATEGORIES } from '@/types/actions';

import { LEAVE_OF_ACTION, raiseAll, type ActionDraft } from './actions-sources';
import { decideLeave } from './leave';
import { PUPIL_LEAVE_OF_ACTION } from './actions-mine';
import { decidePupilLeave } from './pupil-leave';
import { PERSONS, STAFF, TEACHERS } from './data/people';
import { TODAY } from './data/classroom';
import { caller } from './identity';
import { reachNow } from './reach';
import { fail } from './rows';

// What has happened to an item since it was raised. Items themselves are recomputed from their sources on every read.
interface ActionState {
  status: ActionStatus;
  snoozed_until: string | null;
  owner: string | null;
  notes: ActionNote[];
  done_at: string | null;
}
const STATE = new Map<string, ActionState>();
const fresh = (): ActionState => ({ status: 'open', snoozed_until: null, owner: null, notes: [], done_at: null });
const stateOf = (id: string): ActionState => STATE.get(id) ?? fresh();
const me = (): string => PERSONS.find((p) => p.id === caller().personId)?.display_name ?? 'You';

const RANK = { urgent: 0, high: 1, normal: 2 } as const;

function withState(draft: ActionDraft, now: string): ActionDetail {
  const st = stateOf(draft.id);
  // A snooze ends on its own: the item comes back open.
  const status: ActionStatus = st.status === 'snoozed' && st.snoozed_until && st.snoozed_until <= now ? 'open' : st.status;
  return { ...draft, status, snoozed_until: status === 'snoozed' ? st.snoozed_until : null, owner: st.owner, notes: st.notes };
}

const strip = ({ explanation: _e, columns: _c, rows: _r, notes: _n, ...item }: ActionDetail): ActionItem => item;

// Urgent first, then what is due soonest, then the oldest.
const order = (a: ActionItem, b: ActionItem): number =>
  RANK[a.priority] - RANK[b.priority] || (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || a.raised_at.localeCompare(b.raised_at);

const everything = (): ActionDetail[] => {
  const now = new Date().toISOString();
  return raiseAll().map((d) => withState(d, now));
};

export function listActions(): ActionItem[] {
  return everything().map(strip).sort(order);
}

export function actionSummary(): ActionSummary {
  const all = everything();
  const open = all.filter((a) => a.status === 'open');
  const today = TODAY;
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const by = Object.fromEntries(ACTION_CATEGORIES.map((c) => [c, open.filter((a) => a.category === c).length]));
  return {
    urgent: open.filter((a) => a.priority === 'urgent').length,
    due_today: open.filter((a) => a.due_at !== null && a.due_at.slice(0, 10) <= today).length,
    open: open.length,
    done_week: [...STATE.values()].filter((s) => s.status === 'done' && (s.done_at ?? '') >= week).length,
    by_category: {
      students: by.students ?? 0,
      fees: by.fees ?? 0,
      discipline: by.discipline ?? 0,
      staff: by.staff ?? 0,
      academics: by.academics ?? 0,
      feedback: by.feedback ?? 0,
      admissions: by.admissions ?? 0,
      facilities: by.facilities ?? 0,
      compliance: by.compliance ?? 0,
      communication: by.communication ?? 0,
    },
  };
}

export function actionDetail(id: string): ActionDetail {
  return everything().find((a) => a.id === id) ?? fail(404, 'not_found', 'That item has been resolved at its source and is no longer raised.');
}

// The people an item can be handed to: the office and every teacher. Handing over is the office's to do.
export function actionOwners(): ActionOwner[] {
  if (reachNow().kind !== 'school') return [];
  const teachers = new Set(TEACHERS.map((t) => t.staff_id));
  return STAFF.map((s) => ({ id: s.id, name: PERSONS.find((p) => p.id === s.person_id)?.display_name ?? 'Staff', duty: teachers.has(s.id) ? (TEACHERS.find((t) => t.staff_id === s.id)?.specialization ?? 'Teacher') : (s.designation ?? 'Office') }))
    .sort((a, b) => Number(a.duty === 'Teacher') - Number(b.duty === 'Teacher') || a.name.localeCompare(b.name));
}

// --- writes ---------------------------------------------------------------------

const update = (id: string, change: (st: ActionState) => void, note?: string): ActionDetail => {
  actionDetail(id);
  const st = { ...stateOf(id), notes: [...stateOf(id).notes] };
  change(st);
  if (note) st.notes.push({ at: new Date().toISOString(), author: me(), text: note });
  STATE.set(id, st);
  return actionDetail(id);
};

export const assignAction = (id: string, ownerId: string | null): ActionDetail => {
  if (reachNow().kind !== 'school') fail(403, 'forbidden', 'Only the office hands items to someone else.');
  const owner = ownerId ? (actionOwners().find((o) => o.id === ownerId) ?? fail(404, 'not_found', 'No such member of staff.')) : null;
  return update(id, (st) => (st.owner = owner?.name ?? null), owner ? `Handed to ${owner.name}` : 'Taken back');
};

export const snoozeAction = (id: string, until: string): ActionDetail => {
  if (until <= new Date().toISOString()) fail(422, 'validation_failed', 'Snooze until a time in the future.');
  return update(id, (st) => ((st.status = 'snoozed'), (st.snoozed_until = until)), `Snoozed until ${until.slice(0, 10)}`);
};

export const resolveAction = (id: string, note: string): ActionDetail => update(id, (st) => ((st.status = 'done'), (st.done_at = new Date().toISOString())), note.trim() || 'Marked done');

export const reopenAction = (id: string): ActionDetail => update(id, (st) => ((st.status = 'open'), (st.snoozed_until = null), (st.done_at = null)), 'Reopened');

export const noteOnAction = (id: string, text: string): ActionDetail => {
  if (!text.trim()) fail(422, 'validation_failed', 'Write the note first.');
  return update(id, () => undefined, text.trim());
};

// The item's own one-click step, recorded as what was done; the item stays open until someone resolves it.
export const quickAction = (id: string): ActionDetail => {
  const item = actionDetail(id);
  if (!item.quick) fail(409, 'no_step', 'This item has no one-click step.');
  const done = update(id, () => undefined, item.quick);
  // A leave request is decided at its source, so the item leaves the inbox on its own.
  const leave = LEAVE_OF_ACTION.get(id);
  if (leave) decideLeave(leave, true);
  const note = PUPIL_LEAVE_OF_ACTION.get(id);
  if (note) decidePupilLeave(note, true);
  return done;
};
