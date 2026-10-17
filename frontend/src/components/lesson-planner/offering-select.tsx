'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

import type { PlannerOffering } from '@/types/lesson-planner';

const MINE = 'Your classes';

const labelOf = (offering: PlannerOffering): string => `${offering.subject_name}, ${offering.section_label}`;

const subjectOf = (offering: PlannerOffering): string => offering.subject_name;

const groupOf = (offering: PlannerOffering): string => (offering.mine ? MINE : `Class ${offering.grade}`);

function ordered(offerings: readonly PlannerOffering[]): PlannerOffering[] {
  return [...offerings].sort(
    (a, b) =>
      Number(b.mine) - Number(a.mine) ||
      a.grade - b.grade ||
      a.section_label.localeCompare(b.section_label) ||
      a.subject_name.localeCompare(b.subject_name),
  );
}

export function OfferingSelect({
  offerings,
  selected,
  onSelect,
}: {
  offerings: readonly PlannerOffering[];
  selected: PlannerOffering | null;
  onSelect: (offeringId: string) => void;
}): React.ReactElement {
  const options = React.useMemo(() => ordered(offerings), [offerings]);
  const oneSection = new Set(offerings.map((offering) => offering.section_id)).size === 1;
  return (
    <Autocomplete
      size="small"
      options={options}
      value={selected}
      groupBy={oneSection ? undefined : groupOf}
      getOptionLabel={oneSection ? subjectOf : labelOf}
      isOptionEqualToValue={(a, b) => a.offering_id === b.offering_id}
      onChange={(_, option) => {
        if (option) onSelect(option.offering_id);
      }}
      renderInput={(params) => <TextField {...params} label={oneSection ? 'Subject' : 'Class'} placeholder={oneSection ? 'Search a subject' : 'Search a class or subject'} />}
      sx={{ width: { xs: '100%', sm: 300 } }}
    />
  );
}
