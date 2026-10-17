import type { AssignmentRow, AssignmentSubmissionRow, AssignmentTargetRow, AssignmentType } from '@/types/classroom';
import type { HomeworkAttachment } from '@/types/homework';

import { seedId } from '../ids';
import { ASSIGNMENTS, SUBMISSIONS, TODAY } from './classroom';
import { ENROLLMENTS } from './enrollment';
import { CURRENT_SECTIONS, CURRENT_SESSION, OFFERINGS } from './structure';
import { TEACHER_ASSIGNMENTS } from './timetable';

// What an assignment row does not carry: who it is for when not the whole section, and what came with it.
export interface HomeworkMeta {
  attachments: HomeworkAttachment[];
  reminders: number;
}

export const ASSIGNMENT_TARGETS: AssignmentTargetRow[] = [];
export const HOMEWORK_META = new Map<string, HomeworkMeta>();
// A teacher's comment on a piece of work, and the files the student handed in, by submission id.
export const WORK_FEEDBACK = new Map<string, string>();
export const WORK_FILES = new Map<string, string[]>();

const roll = (...parts: (string | number)[]): number => Number.parseInt(seedId(...parts).slice(0, 6), 16) / 0xffffff;
// School hours are Indian time, five and a half hours ahead of UTC.
const at = (days: number, hour: number): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000 + (hour - 5.5) * 3_600_000).toISOString();

const TOPICS: Readonly<Record<string, readonly string[]>> = {
  Mathematics: ['Linear equations', 'Fractions and decimals', 'Mensuration', 'Probability', 'Data handling'],
  Science: ['Light and reflection', 'Acids, bases and salts', 'Electricity', 'Cell structure', 'Motion'],
  English: ['Letter writing', 'Comprehension: The Last Leaf', 'Tenses', 'Story writing', 'Poem: The Road Not Taken'],
  Hindi: ['निबंध लेखन', 'पत्र लेखन', 'व्याकरण: संधि', 'कहानी: ईदगाह'],
  'Social Science': ['Map work: rivers of India', 'The French Revolution', 'Resources and development', 'Federalism'],
  'Computer Science': ['Spreadsheet formulas', 'Python loops', 'HTML forms', 'Number systems'],
  'Physical Education': ['Fitness log', 'Rules of kho-kho'],
  Physics: ['Kinematics', 'Laws of motion', 'Work and energy'],
  Chemistry: ['Mole concept', 'Chemical bonding', 'Thermodynamics'],
  Biology: ['Plant kingdom', 'Cell cycle', 'Human physiology'],
  Accountancy: ['Journal entries', 'Bank reconciliation'],
  Economics: ['Demand and supply', 'National income'],
};
const TYPES: readonly AssignmentType[] = ['worksheet', 'practice', 'reading', 'project', 'test'];
const NOUN: Readonly<Record<AssignmentType, string>> = { worksheet: 'Worksheet', practice: 'Practice set', reading: 'Reading', project: 'Project', test: 'Class test' };
const FEEDBACK = ['Well reasoned; show the working on question 3.', 'Good effort. Revise the formula before the test.', 'Neat and complete.', 'Careful with units in the last two answers.', 'Excellent: clear and correct throughout.', 'Incomplete; see me after class.'];
const FILES: readonly HomeworkAttachment[][] = [[{ name: 'worksheet.pdf', kind: 'pdf' }], [{ name: 'chapter-notes.pdf', kind: 'pdf' }, { name: 'Khan Academy video', kind: 'link' }], [], [{ name: 'rubric.docx', kind: 'doc' }]];

// Each plan is days from today: when it opened, when it is due, and whether it was closed or never sent.
interface Plan {
  open: number;
  due: number;
  status: AssignmentRow['status'];
  onlySome?: boolean;
}
const PLANS: readonly Plan[] = [
  { open: -24, due: -17, status: 'closed' },
  { open: -9, due: -2, status: 'published' },
  { open: -4, due: 3, status: 'published' },
  { open: -2, due: 8, status: 'published', onlySome: true },
  { open: 2, due: 9, status: 'published' },
  { open: 0, due: 12, status: 'draft' },
];

const sections = CURRENT_SECTIONS.filter((s) => s.academic_session_id === CURRENT_SESSION.id && s.status !== 'archived');
const teacherOf = (offeringId: string): string | undefined => TEACHER_ASSIGNMENTS.find((a) => a.subject_offering_id === offeringId)?.teacher_id;

// The earlier classroom seed was for whole sections.
for (const a of ASSIGNMENTS) {
  const section = OFFERINGS.find((o) => o.id === a.subject_offering_id)?.section_id ?? '';
  ASSIGNMENT_TARGETS.push({ id: seedId('assignment-target', a.id), assignment_id: a.id, target_type: 'section', target_id: section });
  HOMEWORK_META.set(a.id, { attachments: [], reminders: 0 });
}

sections.forEach((section, si) => {
  const offerings = OFFERINGS.filter((o) => o.section_id === section.id).sort((a, b) => (a.edges?.subject?.name ?? '').localeCompare(b.edges?.subject?.name ?? ''));
  const pupils = ENROLLMENTS.filter((e) => e.section_id === section.id && e.status === 'active');
  // Four plans per section, rotating through its subjects; the last two plans appear in every third section only.
  const plans = PLANS.filter((_, pi) => pi < 4 || si % 3 === pi - 4);
  plans.forEach((plan, pi) => {
    const offering = offerings[(si + pi * 2) % Math.max(1, offerings.length)];
    if (!offering) return;
    const subject = offering.edges?.subject?.name ?? 'Subject';
    const topics = TOPICS[subject] ?? ['Chapter review', 'Practice questions'];
    const type = TYPES[(si + pi) % TYPES.length] ?? 'worksheet';
    const id = seedId('homework', section.id, pi);
    const max = type === 'project' ? 50 : type === 'test' ? 25 : type === 'reading' ? 10 : 20;
    ASSIGNMENTS.push({
      id,
      academic_session_id: CURRENT_SESSION.id,
      teacher_id: teacherOf(offering.id),
      subject_offering_id: offering.id,
      title: `${NOUN[type]}: ${topics[(si + pi) % topics.length] ?? 'Chapter review'}`,
      description: type === 'project' ? 'Work in pairs. Present your findings on a chart and submit a photo of it.' : type === 'reading' ? 'Read the chapter and answer the reflection questions at the end.' : 'Answer every question. Show your working where marks are given for method.',
      instructions: 'Submit as one PDF or clear photos. Late work loses a tenth of the marks per day unless agreed.',
      assignment_type: type,
      available_from: at(plan.open, 8),
      due_at: at(plan.due, 17),
      late_submission_allowed: pi % 2 === 0,
      max_attempts: type === 'practice' ? 2 : 1,
      maximum_marks: max,
      status: plan.status,
      created_at: at(plan.open - 1, 15),
    });
    const remedial = plan.onlySome && si % 2 === 0 ? pupils.filter((_, i) => roll('remedial', section.id, i) < 0.15).slice(0, 6) : [];
    if (remedial.length > 0) {
      remedial.forEach((e, i) => ASSIGNMENT_TARGETS.push({ id: seedId('homework-target', id, i), assignment_id: id, target_type: 'student', target_id: e.student_id ?? '' }));
    } else {
      ASSIGNMENT_TARGETS.push({ id: seedId('homework-target', id), assignment_id: id, target_type: 'section', target_id: section.id });
    }
    HOMEWORK_META.set(id, { attachments: FILES[(si + pi) % FILES.length] ?? [], reminders: plan.due < 0 && pi === 1 ? 1 : 0 });
    if (plan.status === 'draft' || plan.open > 0) return;

    const assigned = remedial.length > 0 ? remedial : pupils;
    const elapsed = Math.min(1, (0 - plan.open) / Math.max(1, plan.due - plan.open));
    for (const e of assigned) {
      const r = roll('work', id, e.id);
      const handedIn = plan.due < 0 ? r < 0.9 : r < 0.25 + elapsed * 0.5;
      if (!handedIn) continue;
      const late = plan.due < 0 && r > 0.78;
      const graded = plan.status === 'closed' || (plan.due < 0 && r < 0.55) || (plan.due >= 0 && r < 0.12);
      const sid = seedId('homework-work', id, e.id);
      const share = 0.45 + roll('marks', id, e.student_id ?? '') * 0.55;
      SUBMISSIONS.push({
        id: sid,
        assignment_id: id,
        student_id: e.student_id,
        attempt_number: 1,
        submitted_at: at(late ? plan.due + 1 : plan.due - 1 - Math.floor(r * 3), 19),
        status: graded ? (plan.status === 'closed' || r < 0.3 ? 'returned' : 'graded') : 'submitted',
        late,
        total_marks: max,
        marks_obtained: graded ? Math.round(max * share) : undefined,
        graded_at: graded ? at(Math.min(plan.due + 2, 0), 10) : undefined,
      } satisfies AssignmentSubmissionRow);
      if (graded) WORK_FEEDBACK.set(sid, FEEDBACK[Math.floor(r * FEEDBACK.length)] ?? 'Good work.');
      WORK_FILES.set(sid, type === 'project' ? ['chart-photo.jpg', 'notes.pdf'] : [`${type}-answers.pdf`]);
    }
  });
});
