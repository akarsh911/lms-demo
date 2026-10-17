import type { AudienceRule, Delivery, NoticeCategory } from '@/types/notices';
import { isStaffTarget } from '@/types/notices';

import { seedId } from '../ids';
import { SCHOOL_TARGET, STREAM_POSTS, TODAY } from './classroom';
import { ENROLLMENTS } from './enrollment';
import { STAFF, STAFF_PEOPLE, TEACHERS } from './people';
import { CURRENT_SECTIONS, CURRENT_SESSION, GRADE_LEVELS, OFFERINGS } from './structure';
import { TEACHER_ASSIGNMENTS } from './timetable';

// What a stream post does not carry yet: its category, who in a household gets it, acknowledgement, and the staff it was sent to.
export interface NoticeMeta {
  category: NoticeCategory;
  delivery: Delivery;
  acknowledge: boolean;
  staff: AudienceRule[];
}

export const NOTICE_META = new Map<string, NoticeMeta>();

const day = (offset: number, hour = 9): string => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86_400_000 + hour * 3_600_000).toISOString();
const grade = (n: number): string => GRADE_LEVELS.find((g) => g.sequence === n)?.id ?? '';
const section = (code: string): string => CURRENT_SECTIONS.find((s) => s.code === code)?.id ?? '';
const subject = (name: string): string => OFFERINGS.find((o) => o.edges?.subject?.name === name)?.subject_id ?? '';
const pupils = (code: string, n: number): string[] =>
  ENROLLMENTS.filter((e) => e.section_id === section(code) && e.status === 'active')
    .slice(0, n)
    .map((e) => e.student_id ?? '');

interface Seed {
  title: string;
  body: string;
  category: NoticeCategory;
  targets: AudienceRule[];
  // Days from today: negative is the past, positive is scheduled.
  at: number;
  expires?: number;
  draft?: boolean;
  pinned?: boolean;
  delivery?: Delivery;
  acknowledge?: boolean;
  author?: number;
}

const SEEDS: readonly Seed[] = [
  { title: 'School closed tomorrow: heavy rain warning', body: 'The district has issued a heavy rain warning. The school will stay closed tomorrow. Online classes follow the usual timetable from 9:00.', category: 'urgent', targets: [{ type: 'school', id: SCHOOL_TARGET }, { type: 'staff_all', id: 'all' }], at: 0, pinned: true, delivery: 'students_parents', acknowledge: true, author: 96 },
  { title: 'Class 10 pre-board date sheet', body: 'The pre-board examinations for Class 10 begin on 3 November. The date sheet is attached; practicals are in the week before.', category: 'exam', targets: [{ type: 'grade', id: grade(10) }, { type: 'teachers_grade', id: grade(10) }], at: -4, delivery: 'students_parents', acknowledge: true, author: 96 },
  { title: 'Remedial Mathematics for 8B and 8C', body: 'Extra Mathematics sessions run on Tuesdays and Thursdays after school in Room 8B for the next four weeks.', category: 'academic', targets: [{ type: 'section', id: section('G08B') }, { type: 'section', id: section('G08C') }], at: -3, author: 4 },
  { title: 'Annual Day auditions', body: 'Auditions for dance, drama and music are in the auditorium on Friday. Bring your house badge.', category: 'event', targets: [{ type: 'grade', id: grade(6) }, { type: 'grade', id: grade(7) }, { type: 'grade', id: grade(8) }], at: -8, author: 97 },
  { title: 'Diwali break: 20 to 24 October', body: 'The school is closed from 20 to 24 October for the Diwali break and reopens on Monday 27 October.', category: 'holiday', targets: [{ type: 'school', id: SCHOOL_TARGET }, { type: 'staff_all', id: 'all' }], at: 2, delivery: 'students_parents', author: 96 },
  { title: 'Return library books before the break', body: 'Every borrowed book is due back before the Diwali break so the annual stock check can run.', category: 'general', targets: [{ type: 'school', id: SCHOOL_TARGET }], at: 5, author: 98 },
  { title: 'Planetarium visit for Class 7', body: 'Class 7 visits the planetarium on 12 November. Consent forms go home next week; the cost is ₹350.', category: 'event', targets: [{ type: 'grade', id: grade(7) }, { type: 'teachers_grade', id: grade(7) }], at: 0, draft: true, delivery: 'parents', acknowledge: true, author: 96 },
  { title: 'Science Olympiad shortlist', body: 'Congratulations: you are shortlisted for the regional Science Olympiad. Preparation sessions start on Monday.', category: 'academic', targets: pupils('G09A', 3).map((id) => ({ type: 'student', id })), at: 0, draft: true, author: 12 },
  { title: 'Fee window for the second term closes 15 September', body: 'Second-term fees are due by 15 September. Pay through the parent portal or at the accounts office.', category: 'general', targets: [{ type: 'school', id: SCHOOL_TARGET }], at: -25, expires: -18, delivery: 'parents', author: 99 },
  { title: 'Scholarship interview on Thursday', body: 'You are invited for the merit scholarship interview on Thursday at 11:00 in the principal’s office. Please come with a parent.', category: 'academic', targets: pupils('G12B', 2).map((id) => ({ type: 'student', id })), at: -2, delivery: 'students_parents', acknowledge: true, author: 96 },
  { title: '11A: lab coats from Monday', body: 'Science stream students in 11A must wear lab coats for every practical from Monday.', category: 'academic', targets: [{ type: 'section', id: section('G11A') }], at: -1, author: 30 },
  { title: 'Staff meeting on Friday at 15:30', body: 'All staff meet in the conference room on Friday at 15:30 to plan the second term. The agenda is in the staff room.', category: 'general', targets: [{ type: 'staff_all', id: 'all' }], at: -1, acknowledge: true, author: 96 },
  { title: 'Class 6 teachers: moderation of the first assessment', body: 'Teachers of Class 6, please bring five marked scripts each to the moderation session on Wednesday after school.', category: 'exam', targets: [{ type: 'teachers_grade', id: grade(6) }], at: -2, author: 96 },
  { title: 'Mathematics teachers: board pattern workshop', body: 'The CBSE workshop on the new competency-based pattern is on Saturday, 10:00 to 13:00, in the auditorium.', category: 'academic', targets: [{ type: 'teachers_subject', id: subject('Mathematics') }], at: -3, author: 97 },
  { title: 'Class 9 parents: career counselling evening', body: 'Parents of Class 9 are invited to a counselling evening on stream choices on Thursday at 18:00 in the auditorium.', category: 'event', targets: [{ type: 'grade', id: grade(9) }], at: -1, delivery: 'parents', acknowledge: true, author: 96 },
  { title: 'Class teachers: report cards due Monday', body: 'Class teachers, please finish remarks on every report card by Monday so they can be printed for the PTM.', category: 'academic', targets: [{ type: 'class_teachers', id: 'all' }, { type: 'staff', id: STAFF[97]?.id ?? '' }], at: 0, author: 96 },
  { title: 'Class 12 project submission guidelines', body: 'Projects are due on 28 November, bound, with the certificate page signed by your subject teacher.', category: 'academic', targets: [{ type: 'grade', id: grade(12) }], at: -6, acknowledge: true, author: 40 },
];

const EXISTING: readonly NoticeCategory[] = ['exam', 'event', 'general', 'general', 'event', 'event'];
STREAM_POSTS.forEach((post, i) => {
  if (post.post_type === 'announcement') NOTICE_META.set(post.id, { category: EXISTING[i] ?? 'general', delivery: i === 4 ? 'students_parents' : 'students', acknowledge: false, staff: [] });
});

SEEDS.forEach((seed, i) => {
  const id = seedId('notice', i);
  STREAM_POSTS.push({
    id,
    author_person_id: STAFF_PEOPLE[seed.author ?? 96]?.id,
    academic_session_id: CURRENT_SESSION.id,
    post_type: 'announcement',
    title: seed.title,
    body: seed.body,
    pinned: seed.pinned ?? false,
    published_at: seed.draft ? undefined : day(seed.at, seed.at > 0 ? 8 : 9),
    expires_at: seed.expires === undefined ? undefined : day(seed.expires, 23),
    status: seed.draft ? 'draft' : 'published',
    created_at: day(Math.min(seed.at, 0) - 1, 16),
    edges: {
      targets: seed.targets.flatMap((t, j) => (isStaffTarget(t.type) ? [] : [{ id: seedId('notice-target', i, j), post_id: id, target_type: t.type, target_id: t.id }])),
    },
  });
  NOTICE_META.set(id, { category: seed.category, delivery: seed.delivery ?? 'students', acknowledge: seed.acknowledge ?? false, staff: seed.targets.filter((t) => isStaffTarget(t.type)) });
});

// A subject's own notices come from the teacher who takes it.
const teacherPerson = (offeringId: string): string | undefined => {
  const teacherId = TEACHER_ASSIGNMENTS.find((t) => t.subject_offering_id === offeringId)?.teacher_id;
  const staffId = TEACHERS.find((t) => t.id === teacherId)?.staff_id;
  return STAFF.find((st) => st.id === staffId)?.person_id;
};

// Every subject of 6A, 7B and 10C (the fixture pupil's section) carries a couple of its own notices, so a subject's feed has something to read.
(() => {
  const LINES = [
    { title: 'Bring your notebook for the class test', body: 'There is a short test on the last chapter on Thursday. Revise the worked examples.', category: 'exam' as const, at: -2 },
    { title: 'Extra help on Friday', body: 'I will be in the staff room after school on Friday for anyone who wants help before the test.', category: 'academic' as const, at: -5 },
  ];
  const sections = ['G06A', 'G07B', 'G10C'].map((code) => CURRENT_SECTIONS.find((x) => x.code === code)?.id ?? '');
  OFFERINGS.filter((o) => sections.includes(o.section_id ?? '')).forEach((o, i) => {
    LINES.forEach((line, j) => {
      const id = seedId('subject-notice', o.id, j);
      STREAM_POSTS.push({
        id,
        author_person_id: teacherPerson(o.id) ?? STAFF_PEOPLE[(i * 7 + j) % 96]?.id,
        academic_session_id: CURRENT_SESSION.id,
        post_type: 'announcement',
        title: `${o.edges?.subject?.name ?? 'Subject'}: ${line.title}`,
        body: line.body,
        pinned: false,
        published_at: day(line.at - (i % 3), 10),
        status: 'published',
        created_at: day(line.at - (i % 3) - 1, 16),
        edges: { targets: [{ id: seedId('subject-notice-target', o.id, j), post_id: id, target_type: 'offering', target_id: o.id }] },
      });
      NOTICE_META.set(id, { category: line.category, delivery: j === 0 ? 'students_parents' : 'students', acknowledge: j === 0, staff: [] });
    });
  });
})();
