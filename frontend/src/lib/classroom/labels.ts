import type { SectionRow, SubjectOfferingRow } from '@/types/academic';

export function sectionTitle(section: SectionRow | undefined): string {
  if (!section) return 'This class';
  const grade = section.edges?.grade_level?.name;
  const name = section.name ?? section.code;
  if (grade && name) return `${grade} · ${name}`;
  return name ?? grade ?? 'This class';
}

export function sectionSubtitle(section: SectionRow | undefined): string | undefined {
  if (!section) return undefined;
  const parts: string[] = [];
  if (section.code) parts.push(section.code);
  if (section.edges?.branch?.name) parts.push(section.edges.branch.name);
  if (section.edges?.academic_session?.name) {
    parts.push(`Session ${section.edges.academic_session.name}`);
  }
  if (typeof section.capacity === 'number') parts.push(`Capacity ${section.capacity}`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function subjectTitle(offering: SubjectOfferingRow | undefined): string {
  return offering?.edges?.subject?.name ?? 'This subject';
}

export function periodsLine(
  periods: number | undefined,
  code: string | undefined,
): string | undefined {
  const parts: string[] = [];
  if (code) parts.push(code);
  if (typeof periods === 'number') {
    parts.push(periods === 1 ? '1 period a week' : `${periods} periods a week`);
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function teachingRoleLabel(roleType: string | undefined): string | null {
  if (!roleType) return null;
  return roleType.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function dueLine(dueAt: string | undefined): string {
  if (!dueAt) return 'No due date';
  const at = new Date(dueAt);
  if (Number.isNaN(at.getTime())) return 'No due date';
  return `Due ${at.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function postedLine(post: {
  published_at?: string;
  created_at?: string;
}): string | null {
  const at = post.published_at ?? post.created_at;
  if (!at) return null;
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
