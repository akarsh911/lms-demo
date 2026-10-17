'use client';

import * as React from 'react';

import { CalendarTab, type CalendarView } from '@/components/classroom/calendar-tab';
import { useUrlState } from '@/components/school/url-state';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useIdentity } from '@/hooks/query/use-identity';
import { useSection } from '@/hooks/query/use-section';
import { isIsoDate, todayInSchool } from '@/lib/classroom/week';

// The section's week as it is actually taught, with substitutions and cancellations, from the school's timetable.
export function SectionTimetable({ sectionId, label }: { sectionId: string; label: string }): React.ReactElement {
  const { get, put } = useUrlState();
  const section = useSection(sectionId);
  const identity = useIdentity();
  const today = todayInSchool(identity.data?.school?.timezone);
  const from = get('from');
  const asked = get('view');
  const view: CalendarView = asked === 'list' || asked === 'month' ? asked : 'week';

  if (section.isPending) return <WidgetLoading rows={6} />;
  if (section.isError) return <WidgetError error={section.error} onRetry={() => void section.refetch()} />;
  return (
    <CalendarTab
      sectionId={sectionId}
      sectionName={label}
      branchId={section.data.branch_id ?? section.data.edges?.branch?.id}
      anchor={isIsoDate(from) ? from : today}
      today={today}
      onAnchor={(date) => put({ from: date })}
      view={view}
      onView={(next) => put({ view: next === 'week' ? null : next })}
    />
  );
}
