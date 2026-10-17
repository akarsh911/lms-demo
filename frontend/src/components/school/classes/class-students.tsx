'use client';

import * as React from 'react';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useRouter } from 'next/navigation';

import { EnrollmentGrid } from '@/components/school/years/enrollment-grid';
import { CardToolbar } from '@/components/ui/card-toolbar';
import { SearchField } from '@/components/ui/search-field';
import { paths } from '@/paths';
import type { YearEnrollment } from '@/types/foundation';
import type { StructureClass } from '@/types/structure';

import { arrangeHref, type StructureBase, type StructureMode } from './structure-mode';
import { useStructureRights } from './use-structure-rights';

const UNASSIGNED = 'unassigned';

// The whole class in one list, narrowed to a section or to the unplaced; placing happens on the arrangement board.
export function ClassStudents({
  yearId,
  row,
  pupils,
  mode,
  base,
  personaSlug,
  initial,
}: {
  yearId: string;
  row: StructureClass;
  pupils: readonly YearEnrollment[];
  mode: StructureMode;
  base: StructureBase;
  personaSlug: string;
  initial?: string | null;
}): React.ReactElement {
  const router = useRouter();
  const may = useStructureRights(mode);
  const [section, setSection] = React.useState<string>(initial ?? 'all');
  const [search, setSearch] = React.useState('');
  const q = search.trim().toLowerCase();
  const shown = pupils.filter(
    (p) =>
      (section === 'all' || (section === UNASSIGNED ? !p.section_id : p.section_id === section)) &&
      (!q || p.name.toLowerCase().includes(q) || p.admission_number.toLowerCase().includes(q)),
  );

  return (
    <Card>
      <CardHeader
        title={`${row.name} students`}
        subheader={`${row.students} enrolled${row.unassigned > 0 ? ` · ${row.unassigned} without a section` : ''}`}
      />
      <CardToolbar start={<SearchField label="Search by name or admission number" value={search} onChange={setSearch} width={300} />} summary={`${shown.length} of ${pupils.length}`}>
        <ToggleButtonGroup exclusive size="small" value={section} onChange={(_, value: string | null) => value && setSection(value)} aria-label="Section">
          <ToggleButton value="all">All</ToggleButton>
          {row.sections.map((s) => (
            <ToggleButton key={s.id} value={s.id}>
              {s.name}
            </ToggleButton>
          ))}
          {row.unassigned > 0 ? <ToggleButton value={UNASSIGNED}>Unassigned</ToggleButton> : null}
        </ToggleButtonGroup>
      </CardToolbar>
      <EnrollmentGrid
        rows={shown}
        hide={['class_name']}
        onOpen={(p) => router.push(paths.personaSection(personaSlug, `school/years/${yearId}/students/${p.student_id}`))}
        onPlace={!may.structure ? undefined : () => router.push(paths.personaSection(personaSlug, arrangeHref(base, row.grade_level_id)))}
      />
    </Card>
  );
}
