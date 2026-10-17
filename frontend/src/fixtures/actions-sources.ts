import { fixPath, withQuery } from '@/lib/school/structure';
import type { ActionCategory, ActionDetail, ActionLink, ActionPriority, ActionRow } from '@/types/actions';

import {
  ADMISSIONS_PENDING,
  CLASS_REPORTS,
  COMPLAINTS,
  CONCESSIONS,
  DEADLINES,
  FEES_DUE,
  INCIDENTS,
  LATE_FEE_CAP,
  LATE_FEE_PER_DAY,
  MAINTENANCE,
  MARKS_PENDING,
  SERIOUS,
  STAFF_AWAY,
  STAFF_DOCUMENTS,
  SYLLABUS_BEHIND,
  TC_REQUESTS,
  TRANSPORT,
  dayFrom,
  sectionId,
  teacherId,
} from './data/actions';
import { ATTENDANCE_DAYS, TODAY } from './data/classroom';
import { PERSONS, STUDENTS, TEACHERS } from './data/people';
import { CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS } from './data/structure';
import { TEACHER_ASSIGNMENTS } from './data/timetable';
import { listHomework } from './homework';
import { pendingLeave } from './leave';
import { seedId } from './ids';
import { listNotices } from './notices';
import { pendingTasks } from './year-register';
import { INCIDENT_NOTES } from './incidents';
import { studentActions, teacherActions } from './actions-mine';
import { reachNow } from './reach';

// An item as a source raises it; who holds it and what has happened to it are layered on in `actions.ts`.
export type ActionDraft = Omit<ActionDetail, 'status' | 'snoozed_until' | 'owner' | 'notes'>;

export const person = (id: string | undefined): string => PERSONS.find((p) => p.id === id)?.display_name ?? 'Unknown';
export const student = (id: string | undefined): string => person(STUDENTS.find((s) => s.id === id)?.person_id);
const teacher = (id: string | undefined): string => TEACHERS.find((t) => t.id === id)?.edges?.staff?.edges?.person?.display_name ?? 'A teacher';
export const short = (sectionIdValue: string | undefined): string => {
  const s = CURRENT_SECTIONS.find((x) => x.id === sectionIdValue);
  return s ? `${(GRADE_LEVELS.find((g) => g.id === s.grade_level_id)?.name ?? '').replace('Class ', '')}${s.name ?? ''}` : '—';
};
const rupees = (n: number): string => `₹${n.toLocaleString('en-IN')}`;
const at = (offset: number, hour = 9): string => `${dayFrom(offset)}T${String(hour).padStart(2, '0')}:00:00.000Z`;
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
export const link = (label: string, path: string): ActionLink => ({ label, path });
export const row = (id: string, primary: string, secondary: string, value: string, tone: ActionRow['tone'] = 'grey'): ActionRow => ({ id, primary, secondary, value, tone });

export interface Raise {
  kind: string;
  key: string;
  category: ActionCategory;
  priority: ActionPriority;
  title: string;
  detail: string;
  about: string;
  explanation: string;
  raised: number;
  due?: number | null;
  count?: number | null;
  link?: ActionLink | null;
  quick?: string | null;
  columns?: [string, string, string];
  rows?: ActionRow[];
}

// Which leave request an Actions item stands for, so approving the item approves the leave.
export const LEAVE_OF_ACTION = new Map<string, string>();
export const daysTo = (date: string): number => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${TODAY}T00:00:00Z`)) / 86_400_000);

export const make = (r: Raise): ActionDraft => ({
  id: seedId('action', r.kind, r.key),
  kind: r.kind,
  category: r.category,
  priority: r.priority,
  title: r.title,
  detail: r.detail,
  about: r.about,
  count: r.count ?? null,
  raised_at: at(r.raised),
  due_at: r.due === undefined || r.due === null ? null : at(r.due, 17),
  link: r.link ?? null,
  quick: r.quick ?? null,
  explanation: r.explanation,
  columns: r.columns ?? ['', '', ''],
  rows: r.rows ?? [],
});

function students(): ActionDraft[] {
  const out: ActionDraft[] = [];
  const recent = ATTENDANCE_DAYS.filter((d) => (d.attendance_date ?? '') >= `${dayFrom(-28)}`);
  const absences = new Map<string, typeof recent>();
  for (const d of recent) if (d.forenoon_status === 'absent') absences.set(d.student_id ?? '', [...(absences.get(d.student_id ?? '') ?? []), d]);
  const chronic = [...absences].filter(([, days]) => days.length >= 8).sort((a, b) => b[1].length - a[1].length);
  if (chronic.length > 0) {
    out.push(make({ kind: 'chronic-absence', key: 'all', category: 'students', priority: 'high', title: `${plural(chronic.length, 'student')} absent eight or more of the last 20 days`, detail: 'Under 60% attendance; the board requires 75%', about: 'Attendance', raised: -1, count: chronic.length, explanation: 'Each of these students has missed at least eight of the last twenty school days. A call home now costs less than a shortage of attendance in March.', quick: 'Message their parents', link: link('Open attendance', 'attendance'), columns: ['Student', 'Section', 'Days absent'], rows: chronic.map(([id, days]) => row(id, student(id), short(days[0]?.section_id), `${days.length} of 20`, days.length >= 10 ? 'red' : 'amber')) }));
  }
  // Six school days in a row with no reason given is a welfare question, not an attendance one.
  const latest = recent.reduce((m, d) => ((d.attendance_date ?? '') > m ? (d.attendance_date ?? '') : m), '');
  const byStudent = new Map<string, typeof recent>();
  for (const d of recent) byStudent.set(d.student_id ?? '', [...(byStudent.get(d.student_id ?? '') ?? []), d]);
  const runOf = (days: typeof recent): typeof recent => {
    let run: typeof recent = [];
    let best: typeof recent = [];
    for (const d of [...days].sort((x, y) => (x.attendance_date ?? '').localeCompare(y.attendance_date ?? ''))) {
      run = d.forenoon_status === 'absent' && !d.reason_code ? [...run, d] : [];
      if (run.length > best.length) best = run;
    }
    return best;
  };
  const silent = [...byStudent].map(([id, days]) => [id, runOf(days)] as const).filter(([, run]) => run.length >= 6 && run[run.length - 1]?.attendance_date === latest);
  if (silent.length > 0) {
    out.push(make({ kind: 'silent-absence', key: 'all', category: 'students', priority: 'urgent', title: `${plural(silent.length, 'student')} still away after a school week with no word from home`, detail: 'Absent every day since, and no reason has reached the school', about: 'Welfare', raised: 0, due: 0, count: silent.length, explanation: 'Absences with no explanation are the first sign the school is expected to act on. Call the family today and record what you hear.', quick: 'Call logged with families', columns: ['Student', 'Section', 'Days in a row'], rows: silent.map(([id, run]) => row(id, student(id), short(run[0]?.section_id), `${run.length} days`, 'red')) }));
  }
  for (const task of pendingTasks(CURRENT_SESSION.id).filter((t) => t.kind === 'placement' || t.kind === 'documents')) {
    out.push(make({ kind: task.kind, key: 'year', category: task.kind === 'placement' ? 'students' : 'admissions', priority: task.kind === 'placement' ? 'high' : 'normal', title: task.title, detail: task.detail, about: task.kind === 'placement' ? 'Unassigned' : 'Leavers', raised: -2, count: task.count, explanation: task.kind === 'placement' ? 'Enrolled students without a section are missing from every register and timetable until they are placed.' : 'A leaver cannot join their next school until their certificates are issued.', link: link(task.kind === 'placement' ? 'Open Classes & Sections' : 'Open leavers', task.kind === 'placement' ? 'sections' : `school/years/${CURRENT_SESSION.id}?tab=students&view=withdrawn`) }));
  }
  return out;
}

function fees(): ActionDraft[] {
  const out: ActionDraft[] = [];
  const lateFee = (days: number): number => Math.min(LATE_FEE_CAP, Math.max(0, days - 15) * LATE_FEE_PER_DAY);
  const severe = FEES_DUE.filter((f) => f.days_overdue > 60).sort((a, b) => b.days_overdue - a.days_overdue);
  const overdue = FEES_DUE.filter((f) => f.days_overdue > 30 && f.days_overdue <= 60);
  const recent = FEES_DUE.filter((f) => f.days_overdue <= 30);
  const rows = (list: typeof FEES_DUE): ActionRow[] => list.map((f) => row(f.student_id, student(f.student_id), `${short(f.section_id)} · ${f.term} · ${f.days_overdue} days`, rupees(f.amount + lateFee(f.days_overdue)), f.days_overdue > 60 ? 'red' : 'amber'));
  const total = (list: typeof FEES_DUE): number => list.reduce((t, f) => t + f.amount + lateFee(f.days_overdue), 0);
  if (severe.length > 0) out.push(make({ kind: 'fees-severe', key: 'all', category: 'fees', priority: 'urgent', title: `${plural(severe.length, 'family', 'families')} more than 60 days behind on fees`, detail: `${rupees(total(severe))} outstanding with late fees`, about: 'Defaulters', raised: -3, due: 2, count: severe.length, explanation: 'Beyond sixty days the school’s policy is a meeting with the principal before results are released. Most of these are two terms behind.', quick: 'Final reminder sent', columns: ['Student', 'Owed for', 'With late fee'], rows: rows(severe) }));
  if (overdue.length > 0) out.push(make({ kind: 'fees-overdue', key: 'all', category: 'fees', priority: 'high', title: `${plural(overdue.length, 'family', 'families')} 30 to 60 days overdue`, detail: `${rupees(total(overdue))} outstanding`, about: 'Fees', raised: -2, due: 5, count: overdue.length, explanation: 'A second reminder now, with the late fee shown, settles most of these before they reach sixty days.', quick: 'Reminder sent', columns: ['Student', 'Owed for', 'With late fee'], rows: rows(overdue) }));
  if (recent.length > 0) out.push(make({ kind: 'fees-recent', key: 'all', category: 'fees', priority: 'normal', title: `${plural(recent.length, 'family', 'families')} past the due date`, detail: `${rupees(total(recent))}; late fees start after 15 days`, about: 'Fees', raised: -1, count: recent.length, explanation: `A late fee of ${rupees(LATE_FEE_PER_DAY)} a day applies from the sixteenth day, up to ${rupees(LATE_FEE_CAP)}.`, quick: 'Gentle reminder sent', columns: ['Student', 'Owed for', 'Amount'], rows: rows(recent) }));
  const accrued = FEES_DUE.reduce((t, f) => t + lateFee(f.days_overdue), 0);
  if (accrued > 0) out.push(make({ kind: 'late-fees', key: 'all', category: 'fees', priority: 'normal', title: `${rupees(accrued)} in late fees accrued`, detail: 'Decide which to waive before the accounts close', about: 'Late fees', raised: -1, count: FEES_DUE.filter((f) => lateFee(f.days_overdue) > 0).length, explanation: 'Waivers are usually granted for documented hardship or a first delay; the rest are added to the next invoice.', columns: ['Student', 'Days overdue', 'Late fee'], rows: FEES_DUE.filter((f) => lateFee(f.days_overdue) > 0).map((f) => row(f.student_id, student(f.student_id), `${f.days_overdue} days`, rupees(lateFee(f.days_overdue)))) }));
  for (const c of CONCESSIONS) out.push(make({ kind: 'concession', key: c.pupil?.id ?? c.kind, category: 'fees', priority: 'normal', title: `Concession request: ${c.kind}`, detail: `${student(c.pupil?.student_id)}, ${short(c.pupil?.section_id)}`, about: student(c.pupil?.student_id), raised: c.asked, due: c.asked + 10, explanation: 'Concessions need the principal’s approval before the accounts office applies them to the next invoice.', quick: 'Approved' }));
  return out;
}

function discipline(): ActionDraft[] {
  const out: ActionDraft[] = [];
  for (const i of INCIDENTS.filter((x) => x.open && SERIOUS.includes(x.kind))) {
    out.push(make({ kind: 'incident', key: i.id, category: 'discipline', priority: i.kind === 'Bullying' || i.kind === 'Fight' ? 'urgent' : 'high', title: `${i.kind}: ${student(i.student_id)}, ${short(i.section_id)}`, detail: `Reported by ${teacher(i.reported_by)} on ${i.date}`, about: student(i.student_id), raised: Math.round((Date.parse(i.date) - Date.parse(TODAY)) / 86_400_000), due: 1, explanation: `${INCIDENT_NOTES.has(i.id) ? `Reported: “${INCIDENT_NOTES.get(i.id)}” ` : ''}Serious incidents need the student and the family heard, a decision recorded, and the other students involved supported, within two working days.`, quick: 'Parents called in', link: link('Open student record', `people/students/${i.student_id}`) }));
  }
  const minor = INCIDENTS.filter((x) => x.open && !SERIOUS.includes(x.kind));
  if (minor.length > 0) out.push(make({ kind: 'minor-violations', key: 'week', category: 'discipline', priority: 'normal', title: `${plural(minor.length, 'minor violation')} logged this fortnight`, detail: 'Phones, uniform, late arrival, damage', about: 'Conduct', raised: -1, count: minor.length, explanation: 'Usually settled by the class teacher; listed here so patterns are visible.', columns: ['Student', 'What', 'Date'], rows: minor.map((x) => row(x.id, student(x.student_id), `${x.kind} · ${short(x.section_id)}`, x.date)) }));
  const counts = new Map<string, number>();
  for (const x of INCIDENTS) counts.set(x.student_id, (counts.get(x.student_id) ?? 0) + 1);
  const repeat = [...counts].filter(([, n]) => n >= 3);
  if (repeat.length > 0) out.push(make({ kind: 'repeat-offenders', key: 'all', category: 'discipline', priority: 'high', title: `${plural(repeat.length, 'student')} with three or more incidents`, detail: 'A pattern rather than a lapse', about: 'Repeat', raised: -1, count: repeat.length, explanation: 'Three incidents in a term calls for a meeting with the parents and the counsellor, and a written plan.', quick: 'Counsellor informed', columns: ['Student', 'Section', 'Incidents'], rows: repeat.map(([id, n]) => row(id, student(id), short(INCIDENTS.find((x) => x.student_id === id)?.section_id), String(n), 'red')) }));
  return out;
}

function staff(): ActionDraft[] {
  const out: ActionDraft[] = [];
  const uncovered = STAFF_AWAY.filter((s) => s.covered < s.periods);
  if (STAFF_AWAY.length > 0) out.push(make({ kind: 'staff-away', key: TODAY, category: 'staff', priority: uncovered.length > 0 ? 'urgent' : 'normal', title: uncovered.length > 0 ? `${uncovered.reduce((t, s) => t + s.periods - s.covered, 0)} lessons today have no teacher` : `${plural(STAFF_AWAY.length, 'teacher')} away today, all covered`, detail: `${plural(STAFF_AWAY.length, 'teacher')} away today`, about: 'Today', raised: 0, due: 0, count: STAFF_AWAY.length, explanation: 'Arrange substitutes before the first uncovered period. A class without a teacher is a safety matter as well as a lost lesson.', quick: 'Substitutes arranged', columns: ['Teacher', 'Why', 'Covered'], rows: STAFF_AWAY.map((s) => row(teacherId(s.teacher), teacher(teacherId(s.teacher)), s.reason, `${s.covered} of ${s.periods}`, s.covered < s.periods ? 'red' : 'green')) }));
  for (const l of pendingLeave()) {
    const id = seedId('action', 'leave', l.id);
    LEAVE_OF_ACTION.set(id, l.id);
    const starts = daysTo(l.from);
    out.push(make({ kind: 'leave', key: l.id, category: 'staff', priority: starts <= 3 ? 'high' : 'normal', title: `Leave request: ${l.teacher}`, detail: `${l.from}${l.to !== l.from ? ` to ${l.to}` : ''}${l.half_day ? ' (half day)' : ''} · ${l.kind} · ${l.reason} · ${l.lessons} lessons to cover`, about: l.teacher, raised: daysTo(l.applied_at.slice(0, 10)), due: starts - 1, explanation: 'Approving leave also means planning cover for every period of those days.', quick: 'Approve leave' }));
  }
  const assigned = new Set(TEACHER_ASSIGNMENTS.map((a) => a.teacher_id));
  const idle = TEACHERS.filter((t) => !assigned.has(t.id) && !CURRENT_SECTIONS.some((s) => s.class_teacher_id === t.id));
  if (idle.length > 0) out.push(make({ kind: 'teacher-unassigned', key: 'all', category: 'staff', priority: 'high', title: `${plural(idle.length, 'teacher')} with no classes this year`, detail: 'New or freed staff not yet given teaching', about: 'Unassigned', raised: -4, count: idle.length, explanation: 'Each is paid and timetabled for nothing. Give them the subjects still without a teacher.', link: link('Open Teachers', 'people/teachers'), columns: ['Teacher', 'Subject', 'Classes'], rows: idle.map((t) => row(t.id, teacher(t.id), t.specialization ?? '—', 'None', 'amber')) }));
  for (const task of pendingTasks(CURRENT_SESSION.id).filter((t) => t.target && (t.kind === 'teacher' || t.kind === 'teaching'))) {
    const path = task.target ? fixPath(task.target) : null;
    out.push(make({ kind: task.kind, key: task.id, category: 'staff', priority: 'high', title: task.title, detail: task.detail, about: task.kind === 'teacher' ? 'Class teacher' : 'Teaching', raised: -3, explanation: task.kind === 'teacher' ? 'A section without a class teacher has nobody taking its register or speaking to its parents.' : 'Lessons in this subject are not happening for this section.', link: path ? link('Fix it', withQuery(`sections/${path.tail}`, path.query)) : null }));
  }
  for (const d of STAFF_DOCUMENTS) out.push(make({ kind: 'staff-document', key: `${d.teacher}`, category: 'staff', priority: d.expires < 0 ? 'high' : 'normal', title: `${d.document} ${d.expires < 0 ? 'has expired' : 'expires soon'}: ${teacher(teacherId(d.teacher))}`, detail: d.expires < 0 ? `Expired ${-d.expires} days ago` : `Expires in ${d.expires} days`, about: teacher(teacherId(d.teacher)), raised: -1, due: d.expires, explanation: 'Statutory staff records must be current; inspections check them first.', quick: 'Renewal requested' }));
  return out;
}

function academics(): ActionDraft[] {
  const out: ActionDraft[] = [];
  const homework = listHomework();
  const backlog = new Map<string, { name: string; pieces: number; oldest: string }>();
  for (const h of homework.filter((x) => x.state === 'due' && x.submitted - x.graded > 0)) {
    const entry = backlog.get(h.teacher_id) ?? { name: h.teacher, pieces: 0, oldest: h.due_at };
    entry.pieces += h.submitted - h.graded;
    if (h.due_at < entry.oldest) entry.oldest = h.due_at;
    backlog.set(h.teacher_id, entry);
  }
  const behind = [...backlog].filter(([, b]) => b.pieces >= 20).sort((a, b) => b[1].pieces - a[1].pieces);
  if (behind.length > 0) out.push(make({ kind: 'grading-backlog', key: 'all', category: 'academics', priority: 'high', title: `${plural(behind.length, 'teacher')} with 20 or more pieces of work to grade`, detail: 'From assignments already past their due date', about: 'Grading', raised: -1, count: behind.length, explanation: 'Feedback that arrives after the next topic has started is rarely read. A word with each teacher, or a grading period, clears it.', link: link('Open assignments', 'assignments?grading=1'), columns: ['Teacher', 'Oldest due', 'Ungraded'], rows: behind.map(([id, b]) => row(id, b.name, b.oldest.slice(0, 10), String(b.pieces), b.pieces >= 30 ? 'red' : 'amber')) }));
  const missing = homework.filter((h) => h.state === 'due').reduce((t, h) => t + h.missing, 0);
  if (missing > 0) out.push(make({ kind: 'missing-work', key: 'all', category: 'academics', priority: 'normal', title: `${missing} pieces of work not handed in`, detail: 'Past the due date, across every class', about: 'Homework', raised: -1, count: missing, explanation: 'Teachers can remind from each assignment; repeated misses by the same students are worth a call home.', link: link('Open assignments', 'assignments') }));
  for (const m of MARKS_PENDING) out.push(make({ kind: 'marks-pending', key: `${m.section}${m.subject}`, category: 'academics', priority: m.due < 0 ? 'urgent' : 'high', title: `Marks not entered: ${m.subject}, ${short(sectionId(m.section))}`, detail: `${m.exam} · ${teacher(teacherId(m.teacher))}`, about: short(sectionId(m.section)), raised: m.due - 3, due: m.due, explanation: 'Report cards for the whole section wait on these marks.', quick: 'Teacher reminded', link: link('Open Grades', 'grades') }));
  for (const s of SYLLABUS_BEHIND) out.push(make({ kind: 'syllabus', key: `${s.section}${s.subject}`, category: 'academics', priority: 'normal', title: `${s.subject} behind plan in ${short(sectionId(s.section))}`, detail: `${s.done} of ${s.planned} chapters planned by now`, about: short(sectionId(s.section)), raised: -2, explanation: 'Two chapters behind before the pre-boards leaves no room for revision.', quick: 'Extra periods agreed' }));
  return out;
}

function feedback(): ActionDraft[] {
  return [
    ...COMPLAINTS.map((c) => make({ kind: 'complaint', key: c.id, category: 'feedback', priority: c.urgent ? 'urgent' : 'normal', title: c.about, detail: `${c.from} ${student(c.pupil?.student_id)}, ${short(c.pupil?.section_id)}`, about: 'Parent', raised: c.at, due: c.at + (c.urgent ? 1 : 5), explanation: c.text, quick: 'Replied to the parent' })),
    ...CLASS_REPORTS.map((r) => make({ kind: 'class-report', key: r.id, category: 'feedback', priority: r.urgent ? 'high' : 'normal', title: `Report from ${short(sectionId(r.section))}`, detail: `${teacher(teacherId(r.teacher))}, class teacher`, about: short(sectionId(r.section)), raised: r.at, explanation: r.text, quick: 'Acknowledged' })),
  ];
}

function admissions(): ActionDraft[] {
  return [
    ...ADMISSIONS_PENDING.map((a) => make({ kind: 'admission', key: a.name, category: 'admissions', priority: a.missing ? 'normal' : 'high', title: `Admission application: ${a.name}, ${GRADE_LEVELS.find((g) => g.id === a.grade_level_id)?.name ?? ''}`, detail: a.missing ? `Waiting for: ${a.missing}` : 'Complete; ready for a decision', about: a.name, raised: a.applied, explanation: a.missing ? 'Ask the family for the missing papers before the seat is held for them.' : 'Every document is in. Approve and place the student in a section.', quick: a.missing ? 'Family asked for documents' : 'Approved' })),
    ...TC_REQUESTS.map((t) => make({ kind: 'tc-request', key: t.pupil?.id ?? String(t.who), category: 'admissions', priority: 'high', title: `Transfer certificate requested: ${student(t.pupil?.student_id)}`, detail: `${short(t.pupil?.section_id)} · ${t.reason}`, about: student(t.pupil?.student_id), raised: t.asked, due: t.needed_by, explanation: 'Check fees and library dues are clear, then issue. The family needs it for the new school.', quick: 'Certificate issued' })),
  ];
}

function facilities(): ActionDraft[] {
  return [
    ...MAINTENANCE.map((m) => make({ kind: 'maintenance', key: m.room, category: 'facilities', priority: m.severity, title: `${m.room}: ${m.issue}`, detail: m.reported === 0 ? 'Reported today' : `Reported ${-m.reported} days ago`, about: m.room, raised: m.reported, explanation: 'Raise a work order with the estate team, or move the class until it is fixed.', quick: 'Work order raised', link: m.room_id ? link('Open room', `school/rooms/${m.room_id}`) : null })),
    ...TRANSPORT.map((t) => make({ kind: 'transport', key: t.route, category: 'facilities', priority: 'urgent', title: `${t.route}: breakdown`, detail: t.issue, about: t.route, raised: t.at, due: 0, explanation: 'Parents of the route need to hear how pickup will work this afternoon.', quick: 'Parents informed' })),
  ];
}

// The section gaps Classes & Sections raises that belong to rooms and registers rather than to staff.
function sectionGaps(): ActionDraft[] {
  return pendingTasks(CURRENT_SESSION.id)
    .filter((t) => t.target && (t.kind === 'room' || t.kind === 'capacity' || t.kind === 'rolls'))
    .map((task) => {
      const path = task.target ? fixPath(task.target) : null;
      const rolls = task.kind === 'rolls';
      return make({ kind: task.kind, key: task.id, category: rolls ? 'students' : 'facilities', priority: task.kind === 'capacity' ? 'high' : 'normal', title: task.title, detail: task.detail, about: rolls ? 'Registers' : 'Rooms', raised: -3, count: rolls ? task.count : null, explanation: rolls ? 'Registers and report cards print in roll order; these students are missing from both.' : 'A section needs a room that seats all of it.', link: path ? link('Fix it', withQuery(`sections/${path.tail}`, path.query)) : null });
    });
}

function compliance(): ActionDraft[] {
  return DEADLINES.map((d) => make({ kind: 'deadline', key: d.title, category: 'compliance', priority: d.due <= 3 ? 'urgent' : d.due <= 10 ? 'high' : 'normal', title: d.title, detail: `Due in ${plural(d.due, 'day')}`, about: 'Deadline', raised: d.due - 30, due: d.due, explanation: d.detail, quick: 'Submitted' }));
}

function communication(): ActionDraft[] {
  return listNotices()
    .filter((n) => n.state === 'published' && n.acknowledge && n.recipients > 0 && n.acknowledged / n.recipients < 0.8)
    .map((n) => make({ kind: 'acknowledgements', key: n.id, category: 'communication', priority: n.category === 'urgent' ? 'urgent' : 'normal', title: `${(n.recipients - n.acknowledged).toLocaleString('en-IN')} have not acknowledged “${n.title}”`, detail: `${Math.round((n.acknowledged / n.recipients) * 100)}% have so far`, about: 'Announcement', raised: -1, count: n.recipients - n.acknowledged, explanation: 'A reminder goes only to those who have not confirmed.', quick: 'Reminder sent', link: link('Open announcement', `announcements?open=${n.id}`) }));
}

// The office sees the whole school; a teacher and a pupil each see their own list (`actions-mine.ts`).
export function raiseAll(): ActionDraft[] {
  const reach = reachNow();
  if (reach.kind === 'teaching') return teacherActions(reach);
  if (reach.kind === 'self') return studentActions(reach);
  if (reach.kind === 'none') return [];
  return [...students(), ...fees(), ...discipline(), ...staff(), ...academics(), ...feedback(), ...admissions(), ...facilities(), ...sectionGaps(), ...compliance(), ...communication()];
}
