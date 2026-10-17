'use client';

import * as React from 'react';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export type IngestChoice = 'prepared' | 'immediate';

interface Choice {
  value: IngestChoice;
  title: string;
  note: string;
}

const CHOICES: readonly Choice[] = [
  {
    value: 'prepared',
    title: 'Prepare it properly first',
    note:
      'It is split into chapters, the topics in each one are listed and its ' +
      'diagrams are cut out. Someone has to look over that split and publish it ' +
      'before anyone can search inside it, so it will not be searchable today.',
  },
  {
    value: 'immediate',
    title: 'Make it searchable straight away',
    note:
      'Ready to search within minutes, and much rougher. A scan or a ' +
      'picture-heavy PDF often ends up with no searchable text in it at all.',
  },
];

const EITHER_WAY =
  'Preparing it properly gives far better results and is the usual choice. Either ' +
  'way the class can open and read the file — this only decides when it can be ' +
  'searched, and it cannot be changed after it is filed.';

const PDF_ONLY =
  'Only a PDF can be prepared chapter by chapter. Anything else is made searchable ' +
  'as soon as it is published.';

export interface IngestModeChoiceProps {
  value: IngestChoice;
  onChange: (next: IngestChoice) => void;
  deferrable: boolean;
  disabled: boolean;
}

export function IngestModeChoice({
  value,
  onChange,
  deferrable,
  disabled,
}: IngestModeChoiceProps): React.ReactElement {
  const noteId = React.useId();

  return (
    <Stack spacing={0.75}>
      <FormControl
        component="fieldset"
        variant="standard"
        fullWidth
        disabled={disabled || !deferrable}
      >
        <FormLabel component="legend" sx={{ fontSize: 14 }}>
          Preparing it for search
        </FormLabel>

        <RadioGroup
          aria-describedby={noteId}
          value={deferrable ? value : 'immediate'}
          onChange={(_, next) => onChange(next as IngestChoice)}
          sx={{ mt: 0.5 }}
        >
          {CHOICES.map((choice) => (
            <FormControlLabel
              key={choice.value}
              value={choice.value}
              control={<Radio size="small" />}
              sx={{ alignItems: 'flex-start', m: 0, py: 0.5 }}
              label={
                <Stack spacing={0.25} sx={{ pt: 0.5 }}>
                  <Typography variant="body2">{choice.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {choice.note}
                  </Typography>
                </Stack>
              }
            />
          ))}
        </RadioGroup>
      </FormControl>

      <Typography id={noteId} variant="caption" color="text.secondary">
        {deferrable ? EITHER_WAY : PDF_ONLY}
      </Typography>
    </Stack>
  );
}
