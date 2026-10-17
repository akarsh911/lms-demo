import { paths } from '@/paths';
import { ROUTE_INDEX } from '@/routes/registry';
import type { OverviewLink } from '@/types/foundation';

// A link handed over as a route key, turned into a URL. Null when that route is not in this app.
export function overviewHref(personaSlug: string, link: OverviewLink | null): string | null {
  const record = link ? ROUTE_INDEX.get(link.route) : undefined;
  if (!link || !record) return null;
  const path = [record.path, link.id, link.setup ? 'setup' : null].filter(Boolean).join('/');
  const base = path === '' ? paths.persona(personaSlug) : paths.personaSection(personaSlug, path);
  const query = new URLSearchParams();
  if (link.tab) query.set('tab', link.tab);
  if (link.view) query.set('view', link.view);
  if (link.act) query.set('act', link.act);
  return query.size > 0 ? `${base}?${query.toString()}` : base;
}

export function greetingAt(time: number): string {
  const hour = new Date(time).getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  return hour >= 12 && hour < 17 ? 'Good afternoon' : 'Good evening';
}

export const percentOf = (value: number, total: number): string => (total === 0 ? '0%' : `${((value / total) * 100).toFixed(1)}%`);
