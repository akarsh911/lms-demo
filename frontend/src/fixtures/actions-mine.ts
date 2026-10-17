import type { Reach } from '@/lib/reach/reach';

import { daysTo, link, make, plural, row, short, student, type ActionDraft } from './actions-sources';
import { classRoles, myClassRole } from './class-roles';
import { ATTENDANCE_DAYS, TODAY } from './data/classroom';
import { COMPLAINTS, INCIDENTS, STAFF_DOCUMENTS, SYLLABUS_BEHIND, FEES_DUE, dayFrom, sectionId, teacherId } from './data/actions';
import { EXAM_MARKS, EXAM_SUBJECTS, EXAMS } from './data/exams';
import { CURRENT_SECTIONS, OFFERINGS } from './data/structure';
import { extrasOn } from './extra-classes';
import { listHomework, myWork } from './homework';
import { myLeave } from './leave';
import { myWeek } from './my-week';
import { listNotices } from './notices';
import { INCIDENT_NOTES } from './incidents';
import { pendingPupilLeave } from './pupil-leave';

// Which pupil leave note an Actions item stands for, so approving the item approves the note.
export const PUPIL_LEAVE_OF_ACTION = new Map<string, string>();

type Teaching = Extract<Reach, { kind: 'teaching' }>;
type Self = Extract<Reach, { kind: 'self' }>;

const DAY_MS = 86_400_000;
const recentDays = (sectionIds: ReadonlySet<string>, days = 28): typeof ATTENDANCE_DAYS => ATTENDANCE_DAYS.filter((d) => sectionIds.has(d.section_id ?? '') && (d.attendance_date ?? '') >= dayFrom(-days));
const sectionPath = (id: string): string => {
  const s = CURRENT_SECTIONS.find((x) => x.id === id);
  return `sections/${s?.grade_level_id ?? ''}/${id}`;
};
const fmt = (iso: string): string => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

// What a teacher has to do: their own class as its class teacher, their own subjects, and their own day.
export function teacherActions(reach: Teaching): ActionDraft[] {
  const out: ActionDraft[] = [];
  const led = reach.led;
  const today = myWeek(TODAY).days.find((d) => d.date === TODAY);

  for (const id of led) {
    const label = short(id);
    if (today?.open && !today.away && !ATTENDANCE_DAYS.some((d) => d.section_id === id && d.attendance_date === TODAY)) {
      out.push(make({ kind: 'my-register', key: `${id}-${TODAY}`, category: 'students', priority: 'urgent', title: `Today's register for ${label} is not taken`, detail: 'Take it in your first period', about: label, raised: 0, due: 0, explanation: 'You are the class teacher: the register for the whole day is yours, and parents of absent pupils hear from the school once it is in.', link: link('Take register', `attendance?section=${id}&day=${TODAY}`) }));
    }
    const days = recentDays(new Set([id]));
    const absent = new Map<string, string[]>();
    for (const d of days) if (d.forenoon_status === 'absent' && !d.reason_code) absent.set(d.student_id ?? '', [...(absent.get(d.student_id ?? '') ?? []), d.attendance_date ?? '']);
    const unexplained = [...absent].filter(([, dates]) => dates.length >= 2).sort((a, b) => b[1].length - a[1].length);
    if (unexplained.length > 0) {
      out.push(make({ kind: 'my-unexplained', key: id, category: 'students', priority: unexplained.some(([, d]) => d.length >= 5) ? 'high' : 'normal', title: `${plural(unexplained.length, 'pupil')} in ${label} absent with no reason from home`, detail: 'Two or more days in the last four weeks', about: label, raised: -1, count: unexplained.length, explanation: 'Ask each family for a reason. A pattern of unexplained days is the first thing the office and the parents will ask you about.', quick: 'Families asked for a reason', link: link('Open attendance', `attendance?section=${id}`), columns: ['Pupil', 'Days', 'Latest'], rows: unexplained.map(([sid, dates]) => row(sid, student(sid), `${dates.length} days`, [...dates].sort().at(-1) ?? '', dates.length >= 5 ? 'red' : 'amber')) }));
    }
    if (!classRoles(id).monitor) {
      out.push(make({ kind: 'my-monitor', key: id, category: 'students', priority: 'normal', title: `${label} has no class monitor`, detail: 'Choose a monitor and give out the class duties', about: label, raised: -2, explanation: 'A monitor and a few duties take small jobs off your hands and give pupils responsibility.', link: link('Open your class', sectionPath(id)) }));
    }
    for (const i of INCIDENTS.filter((x) => x.open && x.section_id === id)) {
      out.push(make({ kind: 'my-incident', key: i.id, category: 'discipline', priority: 'high', title: `${i.kind}: ${student(i.student_id)}`, detail: `In ${label}, ${i.date}`, about: student(i.student_id), raised: daysTo(i.date), due: 1, explanation: `${INCIDENT_NOTES.has(i.id) ? `Reported: “${INCIDENT_NOTES.get(i.id)}” ` : ''}As class teacher, speak to the pupil and the family and write down what was agreed.`, quick: 'Spoke to the pupil and family' }));
    }
    for (const c of COMPLAINTS.filter((x) => x.pupil?.section_id === id)) {
      out.push(make({ kind: 'my-complaint', key: c.id, category: 'feedback', priority: c.urgent ? 'urgent' : 'normal', title: c.about, detail: `Parent of ${student(c.pupil?.student_id)}, ${label}`, about: 'Parent', raised: c.at, due: c.at + (c.urgent ? 1 : 5), explanation: c.text, quick: 'Replied to the parent' }));
    }
  }

  for (const n of pendingPupilLeave(led)) {
    const id = make({ kind: 'pupil-leave', key: n.id, category: 'students', priority: n.from <= TODAY ? 'high' : 'normal', title: `Leave note: ${n.student}, ${n.section}`, detail: `${fmt(`${n.from}T00:00:00Z`)}${n.to !== n.from ? ` to ${fmt(`${n.to}T00:00:00Z`)}` : ''} · ${n.reason}`, about: n.section, raised: daysTo(n.applied_at.slice(0, 10)), due: Math.max(0, daysTo(n.from)), explanation: 'Approving the note marks those days as excused leave on the register.', quick: 'Approve leave note' });
    PUPIL_LEAVE_OF_ACTION.set(id.id, n.id);
    out.push(id);
  }

  const covers = today?.slots.filter((s) => s.cover) ?? [];
  if (covers.length > 0) {
    out.push(make({ kind: 'my-covers', key: TODAY, category: 'staff', priority: 'high', title: `You cover ${plural(covers.length, 'lesson')} today`, detail: covers.map((s) => s.label).filter(Boolean).join(', '), about: 'Today', raised: 0, due: 0, count: covers.length, explanation: 'A colleague is away; these lessons are yours today on top of your own.', link: link('Open my timetable', 'timetable'), columns: ['Time', 'Class', 'Subject'], rows: covers.map((s) => row(s.id, `${String(Math.floor(s.start / 60)).padStart(2, '0')}:${String(s.start % 60).padStart(2, '0')}`, s.label ?? '', s.subject ?? '')) }));
  }

  const mine = listHomework().filter((h) => h.teacher_id === reach.teacherId);
  const toGrade = mine.filter((h) => h.submitted - h.graded > 0);
  if (toGrade.length > 0) {
    const pieces = toGrade.reduce((t, h) => t + h.submitted - h.graded, 0);
    const oldest = toGrade.reduce((m, h) => (h.due_at < m ? h.due_at : m), toGrade[0]?.due_at ?? '');
    out.push(make({ kind: 'my-grading', key: 'all', category: 'academics', priority: daysTo(oldest.slice(0, 10)) < -3 ? 'high' : 'normal', title: `${plural(pieces, 'piece')} of work to grade`, detail: `Across ${plural(toGrade.length, 'assignment')}`, about: 'Grading', raised: -1, count: pieces, explanation: 'Feedback is read when it arrives before the next topic starts.', link: link('Open grading queue', 'assignments?grading=1'), columns: ['Assignment', 'Class', 'To grade'], rows: toGrade.map((h) => row(h.id, h.title, h.section, String(h.submitted - h.graded), 'amber')) }));
  }
  const missing = mine.filter((h) => h.state === 'due' && h.missing > 0);
  if (missing.length > 0) {
    out.push(make({ kind: 'my-missing', key: 'all', category: 'academics', priority: 'normal', title: `${plural(missing.reduce((t, h) => t + h.missing, 0), 'pupil')} have not handed in your work`, detail: `On ${plural(missing.length, 'assignment')} past the due date`, about: 'Homework', raised: -1, explanation: 'A reminder goes only to those who have not handed in. Repeated misses are worth a word with the class teacher.', quick: 'Reminder sent', link: link('Open assignments', 'assignments'), columns: ['Assignment', 'Class', 'Missing'], rows: missing.map((h) => row(h.id, h.title, h.section, String(h.missing), 'amber')) }));
  }

  const ended = EXAMS.filter((e) => e.end_at && Date.parse(e.end_at) < Date.now() && e.status !== 'published');
  for (const e of ended) {
    for (const p of EXAM_SUBJECTS.filter((x) => x.exam_id === e.id && reach.offerings.has(x.subject_offering_id ?? ''))) {
      if (EXAM_MARKS.some((m) => m.exam_subject_id === p.id)) continue;
      const offering = OFFERINGS.find((o) => o.id === p.subject_offering_id);
      const label = short(offering?.section_id);
      const overdue = Math.floor((Date.now() - Date.parse(e.end_at ?? '')) / DAY_MS);
      out.push(make({ kind: 'my-marks', key: p.id, category: 'academics', priority: overdue > 3 ? 'urgent' : 'high', title: `Marks not entered: ${offering?.edges?.subject?.name ?? 'Subject'}, ${label}`, detail: `${e.name ?? 'Examination'} ended ${fmt(e.end_at ?? '')}`, about: label, raised: -overdue, due: Math.max(0, 3 - overdue), explanation: 'The section’s results and report cards wait on these marks.', link: link('Open marks entry', 'grades') }));
    }
  }
  for (const s of SYLLABUS_BEHIND) {
    const offering = OFFERINGS.find((o) => o.section_id === sectionId(s.section) && o.edges?.subject?.name === s.subject);
    if (!offering || !reach.offerings.has(offering.id)) continue;
    out.push(make({ kind: 'my-syllabus', key: offering.id, category: 'academics', priority: 'normal', title: `${s.subject} in ${short(offering.section_id)} is behind plan`, detail: `${s.done} of ${s.planned} chapters planned by now`, about: short(offering.section_id), raised: -2, explanation: 'Plan the catch-up now, while there is still room for revision before the examinations.', link: link('Book an extra class', 'timetable') }));
  }

  for (const n of listNotices().filter((x) => x.mine && x.state === 'published' && x.acknowledge && x.recipients > 0 && x.acknowledged / x.recipients < 0.8)) {
    out.push(make({ kind: 'my-acknowledgements', key: n.id, category: 'communication', priority: 'normal', title: `${n.recipients - n.acknowledged} in ${n.audience.map((a) => a.label).join(', ') || 'the audience'} have not acknowledged “${n.title}”`, detail: `${Math.round((n.acknowledged / n.recipients) * 100)}% have so far`, about: 'Announcement', raised: -1, count: n.recipients - n.acknowledged, explanation: 'A reminder goes only to those who have not confirmed.', quick: 'Reminder sent', link: link('Open announcement', `announcements?open=${n.id}`) }));
  }

  for (const l of myLeave().requests) {
    if (l.status === 'pending') out.push(make({ kind: 'my-leave', key: l.id, category: 'staff', priority: 'normal', title: `Your leave on ${fmt(l.from)}${l.to !== l.from ? ` to ${fmt(l.to)}` : ''} awaits the office`, detail: `${l.kind} · ${l.reason}`, about: 'Leave', raised: daysTo(l.applied_at.slice(0, 10)), explanation: 'The office decides leave and plans the cover. You will see the answer here and on My leave.', link: link('Open my leave', 'home/leave') }));
    if (l.status === 'declined' && l.decided_at && daysTo(l.decided_at.slice(0, 10)) >= -7) out.push(make({ kind: 'my-leave-declined', key: l.id, category: 'staff', priority: 'high', title: `Leave on ${fmt(l.from)} was declined`, detail: l.note ?? 'Speak to the office', about: 'Leave', raised: daysTo(l.decided_at.slice(0, 10)), explanation: 'If the reason still stands, talk to the office about another date.', link: link('Open my leave', 'home/leave') }));
  }
  for (const d of STAFF_DOCUMENTS.filter((x) => teacherId(x.teacher) === reach.teacherId)) {
    out.push(make({ kind: 'my-document', key: d.document, category: 'staff', priority: d.expires < 0 ? 'high' : 'normal', title: `Your ${d.document.toLowerCase()} ${d.expires < 0 ? 'has expired' : `expires in ${d.expires} days`}`, detail: 'Send the renewal to the office', about: 'Records', raised: -1, due: d.expires, explanation: 'Statutory staff records must be current; inspections check them first.', quick: 'Renewal sent to the office' }));
  }
  return out;
}

// What a pupil has to do: work to hand in, absences to explain, and what is coming up this week.
export function studentActions(reach: Self): ActionDraft[] {
  const out: ActionDraft[] = [];
  const now = Date.now();
  for (const w of myWork()) {
    const due = Date.parse(w.due_at);
    if (w.status === 'pending' && due >= now && due - now <= 3 * DAY_MS) {
      out.push(make({ kind: 'work-due', key: w.id, category: 'academics', priority: due - now <= DAY_MS ? 'urgent' : 'high', title: `Hand in: ${w.title}`, detail: `${w.subject} · due ${fmt(w.due_at)}`, about: w.subject, raised: -1, due: daysTo(w.due_at.slice(0, 10)), explanation: w.description || 'Hand it in from My work before the due time.', link: link('Open my work', 'assignments') }));
    }
    if (w.status === 'missing' && w.late_allowed && w.state !== 'closed') {
      out.push(make({ kind: 'work-late', key: w.id, category: 'academics', priority: 'urgent', title: `Overdue: ${w.title}`, detail: `${w.subject} · was due ${fmt(w.due_at)}; late work is still accepted`, about: w.subject, raised: daysTo(w.due_at.slice(0, 10)), due: 0, explanation: 'Hand it in now: your teacher accepts it late, and it is marked as late.', link: link('Open my work', 'assignments') }));
    }
    if (w.status === 'returned' && w.feedback) {
      out.push(make({ kind: 'work-feedback', key: w.id, category: 'academics', priority: 'normal', title: `Feedback on ${w.title}`, detail: `${w.subject}${w.marks !== null ? ` · ${w.marks} of ${w.max_marks}` : ''}`, about: w.subject, raised: -1, explanation: w.feedback, link: link('Open my work', 'assignments') }));
    }
  }

  const absences = ATTENDANCE_DAYS.filter((d) => d.student_id === reach.studentId && d.forenoon_status === 'absent' && !d.reason_code && (d.attendance_date ?? '') >= dayFrom(-28));
  if (absences.length > 0) {
    out.push(make({ kind: 'absence-reason', key: reach.studentId, category: 'students', priority: absences.length >= 3 ? 'high' : 'normal', title: `${plural(absences.length, 'absence')} with no reason from home`, detail: 'Ask a parent to send a note to your class teacher', about: 'Attendance', raised: -1, count: absences.length, explanation: 'Every absence needs a reason from home. Send a leave note for those days and your class teacher will excuse them.', link: link('Send a leave note', 'home/leave'), columns: ['Date', 'Session', 'Reason'], rows: absences.map((d) => row(d.attendance_date ?? '', d.attendance_date ?? '', 'Whole day', 'None given', 'amber')) }));
  }

  const mine = new Set(OFFERINGS.filter((o) => o.section_id === reach.sectionId).map((o) => o.id));
  const soon = EXAMS.filter((e) => e.start_at && Date.parse(e.start_at) >= now && Date.parse(e.start_at) - now <= 7 * DAY_MS);
  for (const e of soon) {
    const papers = EXAM_SUBJECTS.filter((p) => p.exam_id === e.id && mine.has(p.subject_offering_id ?? ''));
    if (papers.length === 0) continue;
    const subjects = papers.map((p) => OFFERINGS.find((o) => o.id === p.subject_offering_id)?.edges?.subject?.name ?? 'Subject');
    out.push(make({ kind: 'test-soon', key: e.id, category: 'academics', priority: Date.parse(e.start_at ?? '') - now <= 2 * DAY_MS ? 'high' : 'normal', title: `${e.name ?? 'Test'} on ${fmt(e.start_at ?? '')}`, detail: subjects.join(', '), about: 'Test', raised: -1, due: daysTo((e.start_at ?? '').slice(0, 10)), explanation: 'Revise the chapters your teacher named, and bring what the test needs.', link: link('Open my results', 'grades') }));
  }
  for (let d = 0; d < 7; d += 1) {
    for (const x of extrasOn(dayFrom(d))) {
      out.push(make({ kind: 'extra-class', key: x.id, category: 'academics', priority: 'normal', title: `Extra ${x.subject} class on ${fmt(`${x.date}T00:00:00Z`)}`, detail: `${String(Math.floor(x.start / 60)).padStart(2, '0')}:${String(x.start % 60).padStart(2, '0')} · ${x.topic}`, about: x.subject, raised: -1, due: d, explanation: `${x.topic}. ${x.room ? `In ${x.room}.` : ''}`, link: link('Open my timetable', 'timetable') }));
    }
  }

  const role = myClassRole();
  if (role && (role.office || role.duties.length > 0)) {
    const office = role.office === 'monitor' ? 'the class monitor' : role.office === 'vice_monitor' ? 'the vice-monitor' : null;
    const duties = role.duties.length > 0 ? `on ${role.duties.join(' and ')} duty` : null;
    out.push(make({ kind: 'class-duty', key: reach.studentId, category: 'students', priority: 'normal', title: `You are ${[office, duties].filter(Boolean).join(' and ')} in ${role.label}`, detail: role.class_teacher ? `Given by ${role.class_teacher}` : 'Given by your class teacher', about: role.label, raised: -3, explanation: 'Your class teacher counts on you for this every school day.' }));
  }

  for (const n of listNotices().filter((x) => x.category === 'urgent' && x.state === 'published' && x.published_at && Date.parse(x.published_at) >= now - 7 * DAY_MS)) {
    out.push(make({ kind: 'notice-urgent', key: n.id, category: 'communication', priority: 'high', title: n.title, detail: `From ${n.author}`, about: 'Announcement', raised: daysTo((n.published_at ?? '').slice(0, 10)), explanation: n.body.slice(0, 280), link: link('Read it', `announcements?open=${n.id}`) }));
  }
  for (const f of FEES_DUE.filter((x) => x.student_id === reach.studentId)) {
    out.push(make({ kind: 'fee-due', key: f.term, category: 'fees', priority: f.days_overdue > 30 ? 'high' : 'normal', title: `Fees pending: ${f.term}`, detail: `₹${f.amount.toLocaleString('en-IN')}, ${f.days_overdue} days past due`, about: 'Fees', raised: -f.days_overdue, explanation: 'Please tell a parent; the accounts office has sent the details home.' }));
  }
  return out;
}
