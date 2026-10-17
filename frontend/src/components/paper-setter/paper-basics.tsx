'use client';

import * as React from 'react';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { Segmented } from '@/components/ui/segmented';
import { useMdmBranches, useMdmSections, useMdmSessions } from '@/hooks/query/use-mdm';
import { WidgetDegraded } from '@/components/widgets/widget-states';

import { WizardPanel, PanelNote } from './panel';
import { PAPER_KINDS, type PaperKind } from './state';

export const KIND_LABEL: Record<PaperKind, string> = {
  assignment: 'Assignment',
  unit_test: 'Unit test',
  class_exam: 'Class examination',
};

export const SECTION_IS_OPTIONAL =
  'A section narrows the paper to one group within the class. Left as the whole class, every ' +
  'section sits the same paper, which is the usual case.';

export function PaperBasics({
  title,
  titleHint,
  paperKind,
  classId,
  sectionId,
  onTitle,
  onPaperKind,
  onSection,
}: {
  title: string;
  titleHint: string;
  paperKind: string;
  classId: string;
  sectionId: string;
  onTitle: (next: string) => void;
  onPaperKind: (next: PaperKind) => void;
  onSection: (sectionId: string) => void;
}): React.ReactElement {
  const branches = useMdmBranches();
  const sessions = useMdmSessions();

  const branchId = branches.data?.rows[0]?.id ?? null;
  const sessionRows = sessions.data?.rows ?? [];
  const sessionId = (sessionRows.find((row) => row.is_current) ?? sessionRows[0])?.id ?? null;

  const sections = useMdmSections(branchId, sessionId);
  const forThisClass = React.useMemo(
    () => (sections.data?.rows ?? []).filter((row) => (row.grade_level_id ?? '') === classId),
    [sections.data, classId],
  );

  const kind = PAPER_KINDS.find((option) => option === paperKind) ?? PAPER_KINDS[0];

  return (
    <WizardPanel title="The paper" subheader="What it is called, what kind of paper it is, and who sits it">
      <TextField
        label="Paper title"
        size="small"
        value={title}
        placeholder={titleHint}
        onChange={(event) => onTitle(event.target.value)}
        helperText={title.trim() === '' ? `Left blank, it is called “${titleHint}”.` : undefined}
        sx={{ maxWidth: 520 }}
        slotProps={{ htmlInput: { maxLength: 120 } }}
      />

      <Stack spacing={0.75}>
        <Typography variant="subtitle2" component="p" id="paper-setter-kind-label">
          Kind of paper
        </Typography>
        <Segmented
          ariaLabel="Kind of paper"
          value={kind}
          onChange={onPaperKind}
          options={PAPER_KINDS.map((option) => ({ value: option, label: KIND_LABEL[option] }))}
        />
      </Stack>

      {sections.isError ? (
        <WidgetDegraded
          error={sections.error}
          denied="You may not read this school's class lists, so the paper is for the class as a whole."
          unavailable="The class lists could not be reached, so the paper is for the class as a whole."
        />
      ) : null}

      {forThisClass.length > 0 ? (
        <TextField
          select
          label="Who sits it"
          size="small"
          value={forThisClass.some((row) => row.id === sectionId) ? sectionId : ''}
          onChange={(event) => onSection(event.target.value)}
          sx={{ maxWidth: 320 }}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
        >
          <MenuItem value="">The whole class</MenuItem>
          {forThisClass.map((row) => (
            <MenuItem key={row.id} value={row.id}>
              {row.name ?? row.code ?? row.id}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      <PanelNote>{SECTION_IS_OPTIONAL}</PanelNote>
    </WizardPanel>
  );
}
