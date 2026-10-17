'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { Plus, X } from 'lucide-react';

import type { Objective } from './composer-store';

export function ObjectivesField({
  objectives,
  onChange,
}: {
  objectives: readonly Objective[];
  onChange: (next: Objective[]) => void;
}): React.ReactElement {
  const [draft, setDraft] = React.useState('');

  const add = (): void => {
    const text = draft.trim();
    if (!text || objectives.some((objective) => objective.text === text)) return;
    onChange([...objectives, { text, chosen: true, custom: true }]);
    setDraft('');
  };

  return (
    <Stack spacing={1}>
      <Stack component="ul" spacing={0.25} sx={{ m: 0, p: 0, listStyle: 'none' }} aria-label="Learning objectives">
        {objectives.map((objective, index) => (
          <Stack key={objective.text} component="li" direction="row" sx={{ alignItems: 'flex-start' }}>
            <FormControlLabel
              sx={{ flex: 1, alignItems: 'flex-start', mr: 0, '& .MuiCheckbox-root': { pt: 0.5 } }}
              control={
                <Checkbox
                  checked={objective.chosen}
                  onChange={(event) =>
                    onChange(objectives.map((item, i) => (i === index ? { ...item, chosen: event.target.checked } : item)))
                  }
                />
              }
              label={objective.text}
            />
            {objective.custom ? (
              <Tooltip title="Remove this objective">
                <IconButton size="small" aria-label={`Remove objective: ${objective.text}`} onClick={() => onChange(objectives.filter((_, i) => i !== index))}>
                  <X size={16} />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <TextField
          size="small"
          label="Add objective"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
          sx={{ flex: 1, maxWidth: 480 }}
        />
        <Button variant="outlined" startIcon={<Plus size={16} />} onClick={add} disabled={draft.trim() === ''}>
          Add
        </Button>
      </Stack>
    </Stack>
  );
}
