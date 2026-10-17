'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import NextLink from 'next/link';
import { LayoutGrid, Lock } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { StructureHeader } from '@/components/ui/class-structure';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { LIFECYCLE_LABEL, LIFECYCLE_TONE, yearLifecycle } from '@/lib/school/years';
import { paths } from '@/paths';

import { SectionBody } from './section-body';
import { arrangeHref, classHref, shortSection, type StructureBase } from './structure-mode';
import { useStructureContext } from './use-structure-context';
import { useStructureRights } from './use-structure-rights';

// One section of a class, under its own header.
export function SectionWorkspace({ yearId, gradeId, sectionId, base, personaSlug }: { yearId?: string; gradeId: string; sectionId: string; base: StructureBase; personaSlug: string }): React.ReactElement {
  const ctx = useStructureContext(yearId, gradeId);
  const may = useStructureRights(ctx.mode);

  if (ctx.isPending) return <WidgetLoading rows={6} />;
  if (ctx.error) return <WidgetError error={ctx.error} onRetry={ctx.refetch} />;
  const section = ctx.row?.sections.find((s) => s.id === sectionId) ?? (ctx.row?.whole?.id === sectionId ? ctx.row.whole : undefined);
  if (!ctx.year || !ctx.row || !section) {
    return (
      <Alert
        severity="info"
        variant="outlined"
        action={
          ctx.row ? (
            <Button component={NextLink} href={paths.personaSection(personaSlug, classHref(base, gradeId))} size="small">
              Open {ctx.row.name}
            </Button>
          ) : null
        }
      >
        This section is not open in that year. It may have been merged into another.
      </Alert>
    );
  }
  const { year, row, mode, pupils } = ctx;
  const life = yearLifecycle(year);
  const label = row.undivided ? row.name : shortSection(row.name, section.name);

  return (
    <Stack spacing={3}>
      <StructureHeader
        title={row.undivided ? row.name : `${row.name} · Section ${section.name}`}
        chip={<EmergeChip label={`${year.name ?? year.code} · ${LIFECYCLE_LABEL[life]}`} tone={LIFECYCLE_TONE[life]} dot={life === 'active'} />}
        summary={
          <>
            {section.students} students · {section.class_teacher ? `Class teacher ${section.class_teacher.name}` : 'No class teacher'} · {section.room?.name ?? 'No room'}
          </>
        }
        action={
          may.structure ? (
            <Button component={NextLink} href={paths.personaSection(personaSlug, `${arrangeHref(base, gradeId)}?focus=${section.id}`)} variant="contained" startIcon={<LayoutGrid size={16} />}>
              Arrange {row.name}
            </Button>
          ) : null
        }
      />

      {mode === 'readOnly' ? (
        <Alert severity="info" variant="outlined" icon={<Lock size={18} />}>
          {year.name} is closed. This is how {label} stood; nothing can be changed.
        </Alert>
      ) : null}

      <SectionBody year={year} row={row} section={section} label={label} mode={mode} pupils={pupils} base={base} personaSlug={personaSlug} />
    </Stack>
  );
}
