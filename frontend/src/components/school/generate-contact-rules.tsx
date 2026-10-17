'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Trash2 } from 'lucide-react';

import { contactRuleProblem, type ContactRuleDraft } from '@/lib/school/generation';
import type { NameBook } from './name-book';
import type { SchoolOfferingRow, SectionRow } from '@/types/school';

export interface ContactRulesPanelProps {
  rules: readonly ContactRuleDraft[];
  sections: readonly SectionRow[];
  offerings: readonly SchoolOfferingRow[];
  names: NameBook;
  disabled: boolean;
  onChange: (rules: readonly ContactRuleDraft[]) => void;
}

function newRule(sectionId: string): ContactRuleDraft {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sectionId,
    basis: 'class_teacher',
    offeringIds: [],
    minPerDay: 1,
  };
}

export function ContactRulesPanel({
  rules,
  sections,
  offerings,
  names,
  disabled,
  onChange,
}: ContactRulesPanelProps): React.ReactElement {
  const replace = (id: string, patch: Partial<ContactRuleDraft>): void =>
    onChange(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));

  return (
    <Stack spacing={2}>
      <Alert severity="info" variant="outlined">
        <AlertTitle>What a daily-contact rule is</AlertTitle>
        A floor, not a target: <em>this class must see this teacher, or these subjects,
        at least this many times every teaching day</em>. It is how a primary class stays
        with one adult instead of being spread evenly across the week. A rule that cannot
        be met stops the whole run before it starts, and the refusal shows the arithmetic.
      </Alert>

      {rules.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No rules. The week is then free to place a subject wherever it fits, which is
          usually right for a senior class and usually wrong for a junior one.
        </Typography>
      ) : null}

      {rules.map((rule, index) => {
        const problem = contactRuleProblem(rule);
        const mine = offerings.filter((row) => row.section_id === rule.sectionId);

        return (
          <Box
            key={rule.id}
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}
            >
              <Typography variant="subtitle2">{`Rule ${index + 1}`}</Typography>
              <IconButton
                size="small"
                aria-label={`Remove rule ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(rules.filter((row) => row.id !== rule.id))}
              >
                <Trash2 size={16} />
              </IconButton>
            </Stack>

            <Stack spacing={2}>
              <TextField
                select
                size="small"
                label="Class"
                value={rule.sectionId}
                disabled={disabled}
                onChange={(event) =>
                  replace(rule.id, { sectionId: event.target.value, offeringIds: [] })
                }
              >
                {sections.map((section) => (
                  <MenuItem key={section.id} value={section.id}>
                    {names.section(section.id)}
                  </MenuItem>
                ))}
              </TextField>

              <FormControl>
                <FormLabel id={`basis-${rule.id}`} sx={{ fontSize: 14 }}>
                  Which lessons count towards it
                </FormLabel>
                <RadioGroup
                  aria-labelledby={`basis-${rule.id}`}
                  value={rule.basis}
                  onChange={(event) =>
                    replace(rule.id, {
                      basis: event.target.value as ContactRuleDraft['basis'],
                      offeringIds: [],
                    })
                  }
                >
                  <FormControlLabel
                    value="class_teacher"
                    control={<Radio size="small" disabled={disabled} />}
                    label={
                      <Typography variant="body2">
                        Whatever this class&rsquo;s own class teacher teaches it, resolved
                        by the server when the run starts
                      </Typography>
                    }
                  />
                  <FormControlLabel
                    value="offerings"
                    control={<Radio size="small" disabled={disabled} />}
                    label={<Typography variant="body2">Subjects I name here</Typography>}
                  />
                </RadioGroup>
              </FormControl>

              {rule.basis === 'offerings' ? (
                <FormControl size="small" fullWidth>
                  <InputLabel id={`subjects-${rule.id}`}>Subjects</InputLabel>
                  <Select
                    multiple
                    labelId={`subjects-${rule.id}`}
                    input={<OutlinedInput label="Subjects" />}
                    value={[...rule.offeringIds]}
                    disabled={disabled || mine.length === 0}
                    onChange={(event) =>
                      replace(rule.id, {
                        offeringIds:
                          typeof event.target.value === 'string'
                            ? [event.target.value]
                            : event.target.value,
                      })
                    }
                    renderValue={(chosen) => (
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                        {chosen.map((id) => (
                          <Chip key={id} size="small" label={names.offering(id)} />
                        ))}
                      </Stack>
                    )}
                  >
                    {mine.map((offering) => (
                      <MenuItem key={offering.id} value={offering.id}>
                        {names.offering(offering.id)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : null}

              {rule.basis === 'offerings' && mine.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Nothing is taught to this class yet, so there is no subject to name.
                </Typography>
              ) : null}

              <TextField
                size="small"
                type="number"
                label="At least this many lessons a day"
                value={String(rule.minPerDay)}
                disabled={disabled}
                onChange={(event) =>
                  replace(rule.id, { minPerDay: Number(event.target.value) })
                }
                slotProps={{ htmlInput: { min: 1, max: 12, step: 1 } }}
                sx={{ maxWidth: 280 }}
                helperText="Every teaching day, not on average across the week"
              />

              {problem ? (
                <Alert severity="warning" variant="outlined">
                  {problem}
                </Alert>
              ) : null}
            </Stack>
          </Box>
        );
      })}

      <Button
        size="small"
        variant="outlined"
        disabled={disabled || sections.length === 0}
        sx={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...rules, newRule(sections[0]?.id ?? '')])}
      >
        Add a rule
      </Button>
    </Stack>
  );
}
