import type { StreamPostRow, StreamTargetRow } from '@/types/classroom';
import type { AudienceRule, Notice, NoticeDetail, NoticeState, NoticeSummary, NoticeWrite } from '@/types/notices';
import { isStaffTarget } from '@/types/notices';

import { callerStaff, checkScope, householdOf, labelOf, pupilsOf, reachOf, shortSection, staffOf, taughtSections } from './audience';
import { SCHOOL_TARGET, STREAM_COMMENTS, STREAM_POSTS } from './data/classroom';
import { NOTICE_META, type NoticeMeta } from './data/notices';
import { PERSONS } from './data/people';
import { CURRENT_SESSION } from './data/structure';
import { caller } from './identity';
import { newId, seedId } from './ids';
import { reachNow } from './reach';
import { fail, must } from './rows';

const personName = (id: string | undefined): string => PERSONS.find((p) => p.id === id)?.display_name ?? 'Staff';
const roll = (...parts: (string | number)[]): number => Number.parseInt(seedId(...parts).slice(0, 6), 16) / 0xffffff;
const NO_META: NoticeMeta = { category: 'general', delivery: 'students', acknowledge: false, staff: [] };
const metaOf = (post: StreamPostRow): NoticeMeta => NOTICE_META.get(post.id) ?? NO_META;

function stateOf(post: StreamPostRow, now: string): NoticeState {
  if (post.status === 'archived') return 'archived';
  if (post.status === 'draft' || !post.published_at) return 'draft';
  if (post.published_at > now) return 'scheduled';
  if (post.expires_at && post.expires_at <= now) return 'expired';
  return 'published';
}

// The whole pool: the student-side targets the post carries, and the staff rules kept beside it.
const rulesOf = (post: StreamPostRow): AudienceRule[] => [...(post.edges?.targets ?? []).map((t) => ({ type: t.target_type, id: t.target_id })), ...metaOf(post).staff];

// Reading starts at nothing and climbs over the first few days; fixed per notice and group.
const seenShare = (post: StreamPostRow, group: string, now: string): number => {
  if (!post.published_at || post.published_at > now) return 0;
  const days = (Date.parse(now) - Date.parse(post.published_at)) / 86_400_000;
  return Math.min(0.97, (1 - Math.exp(-days * 0.9)) * (0.85 + roll('seen', post.id, group) * 0.12));
};

// Recipients by section (students, their parents, or both) and the staff as one more line.
function byGroup(post: StreamPostRow, now: string): NoticeDetail['by_section'] {
  const { delivery } = metaOf(post);
  const rules = rulesOf(post);
  // A family is counted once, in the section of its first child reached.
  const counted = new Set<number>();
  const bySection = new Map<string, { pupils: number; families: number }>();
  for (const e of pupilsOf(rules)) {
    const line = bySection.get(e.section_id ?? '') ?? { pupils: 0, families: 0 };
    line.pupils += 1;
    if (!counted.has(householdOf(e))) (counted.add(householdOf(e)), (line.families += 1));
    bySection.set(e.section_id ?? '', line);
  }
  const lines = [...bySection].map(([id, line]) => {
    const people = (delivery === 'parents' ? 0 : line.pupils) + (delivery === 'students' ? 0 : line.families);
    return { section_id: id, label: shortSection(id), people, seen: Math.round(people * seenShare(post, id, now)) };
  });
  const staff = staffOf(rules).size;
  if (staff > 0) lines.push({ section_id: 'staff', label: 'Staff', people: staff, seen: Math.round(staff * seenShare(post, 'staff', now)) });
  return lines.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));
}

// When only parents receive it, the student-side groups are named as their parents.
const parentsLabel = (rule: AudienceRule, delivery: NoticeMeta['delivery']): string => {
  const label = labelOf(rule);
  if (delivery !== 'parents' || isStaffTarget(rule.type)) return label;
  if (rule.type === 'school' || rule.type === 'branch') return 'All parents';
  return rule.type === 'student' ? `${label}’s parents` : `${label} parents`;
};

function toNotice(post: StreamPostRow, now: string): Notice {
  const meta = metaOf(post);
  const rules = rulesOf(post);
  const groups = byGroup(post, now);
  const seen = groups.reduce((t, g) => t + g.seen, 0);
  return {
    id: post.id,
    title: post.title ?? 'Untitled',
    body: post.body ?? '',
    category: meta.category,
    state: stateOf(post, now),
    pinned: post.pinned ?? false,
    author: personName(post.author_person_id),
    mine: post.author_person_id === caller().personId,
    published_at: post.published_at ?? null,
    expires_at: post.expires_at ?? null,
    created_at: post.created_at ?? '',
    audience: rules.map((r) => ({ ...r, label: parentsLabel(r, meta.delivery) })),
    delivery: meta.delivery,
    acknowledge: meta.acknowledge,
    reach: reachOf(rules, meta.delivery),
    recipients: groups.reduce((t, g) => t + g.people, 0),
    seen,
    acknowledged: meta.acknowledge ? Math.round(seen * 0.82) : 0,
    comments: STREAM_COMMENTS.filter((c) => c.post_id === post.id).length,
  };
}

const notices = (): StreamPostRow[] => STREAM_POSTS.filter((p) => p.post_type === 'announcement' && p.academic_session_id === CURRENT_SESSION.id);

// A teacher sees what reaches their sections or themselves, and what they wrote; an administrator sees everything.
const visible = (post: StreamPostRow): boolean => {
  const reach = reachNow();
  // A pupil reads what has gone out to them: never a draft, a scheduled notice or one sent only to parents.
  if (reach.kind === 'self') return stateOf(post, new Date().toISOString()) === 'published' && metaOf(post).delivery !== 'parents' && pupilsOf(rulesOf(post)).some((e) => e.student_id === reach.studentId);
  const mine = taughtSections();
  if (!mine || post.author_person_id === caller().personId) return true;
  // A colleague's notice reaches a teacher when it goes out, not while it is a draft or waiting for its time.
  if (!['published', 'expired'].includes(stateOf(post, new Date().toISOString()))) return false;
  const rules = rulesOf(post);
  const me = callerStaff();
  return pupilsOf(rules).some((e) => mine.has(e.section_id ?? '')) || (me !== undefined && staffOf(rules).has(me));
};

const order = (a: Notice, b: Notice): number =>
  Number(b.pinned && b.state === 'published') - Number(a.pinned && a.state === 'published') || (b.published_at ?? b.created_at).localeCompare(a.published_at ?? a.created_at);

export function listNotices(): Notice[] {
  const now = new Date().toISOString();
  return notices().filter(visible).map((p) => toNotice(p, now)).sort(order);
}

// The office's figures cover the school; a teacher's cover what they have sent.
export function noticeSummary(): NoticeSummary {
  const all = listNotices().filter((n) => !taughtSections() || n.mine);
  const live = all.filter((n) => n.state === 'published');
  const recipients = live.reduce((t, n) => t + n.recipients, 0);
  return {
    live: live.length,
    pinned: live.filter((n) => n.pinned).length,
    sent_week: live.filter((n) => Date.now() - Date.parse(n.published_at ?? '') < 7 * 86_400_000).length,
    scheduled: all.filter((n) => n.state === 'scheduled').length,
    drafts: all.filter((n) => n.state === 'draft').length,
    seen_rate: recipients === 0 ? 0 : live.reduce((t, n) => t + n.seen, 0) / recipients,
    awaiting_ack: live.filter((n) => n.acknowledge).reduce((t, n) => t + (n.recipients - n.acknowledged), 0),
  };
}

export function noticeDetail(id: string): NoticeDetail {
  const post = must(notices(), id, 'announcement');
  const now = new Date().toISOString();
  return {
    ...toNotice(post, now),
    by_section: byGroup(post, now),
    thread: STREAM_COMMENTS.filter((c) => c.post_id === id && c.status !== 'hidden').map((c) => ({ id: c.id, author: personName(c.author_person_id), body: c.body ?? '', at: c.created_at ?? '' })),
  };
}

export const previewReach = (body: Pick<NoticeWrite, 'targets' | 'delivery'>) => reachOf(body.targets, body.delivery);

// --- writes ---------------------------------------------------------------------

function checkWrite(body: NoticeWrite): void {
  if (!body.title.trim()) fail(422, 'validation_failed', 'Give the announcement a title.');
  if (!body.draft && !body.body.trim()) fail(422, 'validation_failed', 'Write the message before publishing.');
  if (!body.draft && reachOf(body.targets, body.delivery).people === 0) fail(422, 'validation_failed', 'Choose who receives it.');
  if (body.expires_at && body.publish_at && body.expires_at <= body.publish_at) fail(422, 'validation_failed', 'It cannot expire before it is published.');
  checkScope(body.targets);
}

const fields = (body: NoticeWrite): Partial<StreamPostRow> => ({
  title: body.title.trim(),
  body: body.body.trim(),
  pinned: body.pinned,
  status: body.draft ? 'draft' : 'published',
  published_at: body.draft ? undefined : (body.publish_at ?? new Date().toISOString()),
  expires_at: body.expires_at ?? undefined,
});

const targetRows = (postId: string, rules: readonly AudienceRule[]): StreamTargetRow[] =>
  rules.flatMap((r) => (isStaffTarget(r.type) ? [] : [{ id: newId(), post_id: postId, target_type: r.type, target_id: r.type === 'school' ? SCHOOL_TARGET : r.id }]));

const metaFrom = (body: NoticeWrite): NoticeMeta => ({ category: body.category, delivery: body.delivery, acknowledge: body.acknowledge, staff: body.targets.filter((r) => isStaffTarget(r.type)) });

export function createNotice(body: NoticeWrite): Notice {
  checkWrite(body);
  const id = newId();
  const now = new Date().toISOString();
  const post: StreamPostRow = { id, author_person_id: caller().personId, academic_session_id: CURRENT_SESSION.id, post_type: 'announcement', created_at: now, updated_at: now, ...fields(body), edges: { targets: targetRows(id, body.targets) } };
  STREAM_POSTS.push(post);
  NOTICE_META.set(id, metaFrom(body));
  return toNotice(post, now);
}

const ownOrOffice = (post: StreamPostRow): void => {
  if (taughtSections() && post.author_person_id !== caller().personId) fail(403, 'not_author', 'Only its author or the school office can change this announcement.');
};

export function updateNotice(id: string, body: NoticeWrite): Notice {
  const post = must(notices(), id, 'announcement');
  ownOrOffice(post);
  checkWrite(body);
  // Once people have read it, a notice keeps its first publication time.
  const wasLive = post.status === 'published' && (post.published_at ?? '') <= new Date().toISOString();
  Object.assign(post, fields(body), wasLive && !body.draft ? { published_at: post.published_at } : {}, { updated_at: new Date().toISOString(), edges: { ...post.edges, targets: targetRows(id, body.targets) } });
  NOTICE_META.set(id, metaFrom(body));
  return toNotice(post, new Date().toISOString());
}

export function setNoticePinned(id: string, pinned: boolean): Notice {
  const post = must(notices(), id, 'announcement');
  ownOrOffice(post);
  post.pinned = pinned;
  return toNotice(post, new Date().toISOString());
}

// Archiving takes it off every feed and keeps it; a draft that was never sent is simply removed.
export function archiveNotice(id: string): void {
  const post = must(notices(), id, 'announcement');
  ownOrOffice(post);
  if (post.status === 'draft') STREAM_POSTS.splice(STREAM_POSTS.indexOf(post), 1);
  else post.status = 'archived';
}

export function commentOnNotice(id: string, body: string): NoticeDetail {
  must(notices(), id, 'announcement');
  if (!body.trim()) fail(422, 'validation_failed', 'Write something first.');
  STREAM_COMMENTS.push({ id: newId(), post_id: id, author_person_id: caller().personId, body: body.trim(), status: 'visible', created_at: new Date().toISOString() });
  return noticeDetail(id);
}
