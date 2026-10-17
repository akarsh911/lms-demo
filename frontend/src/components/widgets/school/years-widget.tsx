'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { CalendarRange, Plus } from 'lucide-react';

import { YearCard } from '@/components/school/years/year-card';
import { YearDialog } from '@/components/school/years/year-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { PageActions } from '@/components/ui/page-actions';
import { useYearRegisters } from '@/hooks/query/use-foundation';
import { useMdmSessions } from '@/hooks/query/use-mdm';
import { yearLifecycle } from '@/lib/school/years';
import { paths } from '@/paths';
import type { YearLifecycle } from '@/types/foundation';
import type { WidgetProps } from '@/types/widget';

import { WidgetError, WidgetLoading } from '../widget-states';

const SECTIONS: readonly { life: YearLifecycle; title: string }[] = [
  { life: 'active', title: 'Active' },
  { life: 'draft', title: 'Being set up' },
  { life: 'closed', title: 'Closed' },
];

export function SchoolYearsWidget({ personaSlug }: WidgetProps): React.ReactElement {
  const router = useRouter();
  const years = useMdmSessions();
  // What each card says about the school in that year. A card still draws without it.
  const registers = useYearRegisters();
  const [adding, setAdding] = React.useState(false);

  const rows = [...(years.data?.rows ?? [])].sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));
  const hrefOf = (id: string, setup = false): string => paths.personaSection(personaSlug, `school/years/${id}${setup ? '/setup' : ''}`);
  const add = (
    <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setAdding(true)}>
      Add Academic Year
    </Button>
  );

  return (
    <Stack spacing={3}>
      <PageActions>{add}</PageActions>

      {years.isPending ? <WidgetLoading rows={4} /> : null}
      {years.isError ? <WidgetError error={years.error} onRetry={() => void years.refetch()} /> : null}

      {years.data && rows.length === 0 ? (
        <Card>
          <EmptyState
            art={<CalendarRange size={40} aria-hidden />}
            title="No academic year yet"
            body="Create the academic year, then set it up: its calendar, its classes and who is in them."
            action={add}
          />
        </Card>
      ) : null}

      {SECTIONS.map(({ life, title }) => {
        const inStage = rows.filter((year) => yearLifecycle(year) === life);
        if (inStage.length === 0) return null;
        return (
          <Stack key={life} component="section" spacing={1.5}>
            <Typography variant="eyebrow" component="h2" color="text.secondary">
              {title}
            </Typography>
            {inStage.map((year) => (
              <YearCard
                key={year.id}
                year={year}
                register={registers.data?.find((r) => r.academic_session_id === year.id)}
                // A draft opens where its work is: the setup workspace.
                href={hrefOf(year.id, life === 'draft')}
              />
            ))}
          </Stack>
        );
      })}

      {/* Creating the record is the small part. The year is then set up in its own workspace, over as many days as it takes. */}
      {adding ? <YearDialog onClose={() => setAdding(false)} onSaved={(saved) => router.push(hrefOf(saved.id, true))} /> : null}
    </Stack>
  );
}
