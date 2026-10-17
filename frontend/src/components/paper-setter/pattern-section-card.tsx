'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Plus, Trash2, X } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';

import {
  CHOICE_SPLITS_MARKS,
  newItem,
  problemFor,
  sectionOf,
  sectionTotals,
  type DraftProblem,
  type ItemDraft,
  type SectionDraft,
} from './pattern-draft';

export interface QuestionTypeOption {
  id: string;
  label: string;
}

export function PatternSectionCard({
  section,
  index,
  problems,
  typeOptions,
  removable,
  onChange,
  onRemove,
}: {
  section: SectionDraft;
  index: number;
  problems: readonly DraftProblem[];
  typeOptions: readonly QuestionTypeOption[];
  removable: boolean;
  onChange: (next: SectionDraft) => void;
  onRemove: () => void;
}): React.ReactElement {
  const theme = useTheme();
  const wire = sectionOf(section);
  const totals = sectionTotals(wire);
  const label = section.id.trim() === '' ? `${index + 1}` : section.id.trim();
  const newItemType = typeOptions[0]?.id ?? section.items[0]?.questionType ?? '';

  const patch = (changes: Partial<SectionDraft>): void => {
    onChange({ ...section, ...changes });
  };

  const patchItem = (itemKey: string, changes: Partial<ItemDraft>): void => {
    patch({
      items: section.items.map((item) =>
        item.key === itemKey ? { ...item, ...changes } : item,
      ),
    });
  };

  const labelProblem = problemFor(problems, {
    field: 'sectionId',
    sectionKey: section.key,
  });
  const attemptProblem = problemFor(problems, {
    field: 'attemptAny',
    sectionKey: section.key,
  });
  const choiceProblem = problemFor(problems, {
    field: 'internalChoice',
    sectionKey: section.key,
  });

  return (
    <Box
      component="li"
      sx={{
        minWidth: 0,
        pt: 2,
        '&:not(:first-of-type)': { borderTop: `1px solid ${theme.brand.line}` },
      }}
    >
      <FormControl component="fieldset" variant="standard" fullWidth sx={{ minWidth: 0 }}>
        <FormLabel component="legend" sx={{ fontSize: 14, fontWeight: 800 }}>
          Section {label}
        </FormLabel>

        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { sm: 'flex-start' } }}
          >
            <TextField
              label="Printed label"
              size="small"
              value={section.id}
              onChange={(event) => patch({ id: event.target.value })}
              error={labelProblem !== undefined}
              helperText={labelProblem}
              autoComplete="off"
              sx={{ width: { xs: '100%', sm: 150 } }}
            />
            <TextField
              label={`Title of section ${label}`}
              size="small"
              value={section.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="Printed above the questions"
              autoComplete="off"
              fullWidth
            />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flex: 'none' }}>
              <EmergeChip label={`${totals.marks} marks`} tone="indigo" />
              <EmergeChip label={`${totals.questionCount} questions`} tone="grey" />
              <IconButton
                size="small"
                disabled={!removable}
                onClick={onRemove}
                aria-label={`Remove section ${label}`}
              >
                <Trash2 size={14} />
              </IconButton>
            </Stack>
          </Stack>

          <TextField
            label={`Instruction for section ${label}`}
            size="small"
            value={section.instruction}
            onChange={(event) => patch({ instruction: event.target.value })}
            placeholder="Printed under the section heading"
            autoComplete="off"
            fullWidth
          />

          {section.items.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              This section holds no questions yet, so it contributes nothing to the total.
              Add a question type below.
            </Typography>
          ) : null}

          <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {section.items.map((item, itemIndex) => {
              const marksProblem = problemFor(problems, {
                field: 'marks',
                sectionKey: section.key,
                itemKey: item.key,
              });
              const countProblem = problemFor(problems, {
                field: 'count',
                sectionKey: section.key,
                itemKey: item.key,
              });
              const subtotal =
                (wire.items[itemIndex]?.marks ?? 0) * (wire.items[itemIndex]?.count ?? 0);
              const options = typeOptions.some((option) => option.id === item.questionType)
                ? typeOptions
                : [...typeOptions, { id: item.questionType, label: item.questionType }];

              return (
                <Stack
                  component="li"
                  key={item.key}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  sx={{ alignItems: { sm: 'flex-start' }, minWidth: 0 }}
                >
                  <TextField
                    select
                    label={`Question type, ${itemIndex + 1} of section ${label}`}
                    size="small"
                    value={item.questionType}
                    onChange={(event) =>
                      patchItem(item.key, { questionType: event.target.value })
                    }
                    fullWidth
                  >
                    {options.map((option) => (
                      <MenuItem key={option.id} value={option.id}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Marks each"
                    size="small"
                    value={item.marks}
                    onChange={(event) => patchItem(item.key, { marks: event.target.value })}
                    error={marksProblem !== undefined}
                    helperText={marksProblem}
                    autoComplete="off"
                    spellCheck={false}
                    slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                    sx={{
                      width: { xs: '100%', sm: 130 },
                      '& input': { fontVariantNumeric: 'tabular-nums' },
                    }}
                  />

                  <TextField
                    label="Questions"
                    size="small"
                    value={item.count}
                    onChange={(event) => patchItem(item.key, { count: event.target.value })}
                    error={countProblem !== undefined}
                    helperText={countProblem}
                    autoComplete="off"
                    spellCheck={false}
                    slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                    sx={{
                      width: { xs: '100%', sm: 120 },
                      '& input': { fontVariantNumeric: 'tabular-nums' },
                    }}
                  />

                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: 'center', flex: 'none', pt: { sm: 0.5 } }}
                  >
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: 64,
                      }}
                    >
                      <Box component="span" sx={{ color: theme.brand.tert, fontWeight: 500 }}>
                        {'= '}
                      </Box>
                      {subtotal}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() =>
                        patch({
                          items: section.items.filter((entry) => entry.key !== item.key),
                        })
                      }
                      aria-label={`Remove question ${itemIndex + 1} of section ${label}`}
                    >
                      <X size={14} />
                    </IconButton>
                  </Stack>
                </Stack>
              );
            })}
          </Stack>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { sm: 'flex-start' }, flexWrap: 'wrap' }}
          >
            <Button
              size="small"
              startIcon={<Plus size={14} />}
              disabled={newItemType === ''}
              onClick={() => patch({ items: [...section.items, newItem(newItemType)] })}
            >
              Add a question type
            </Button>

            <TextField
              label="Attempt any"
              size="small"
              value={section.attemptAny}
              onChange={(event) => patch({ attemptAny: event.target.value })}
              error={attemptProblem !== undefined}
              helperText={attemptProblem ?? `of ${totals.questionCount} printed`}
              autoComplete="off"
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              sx={{ width: { xs: '100%', sm: 170 } }}
            />

            <TextField
              label="Internal choice"
              size="small"
              value={section.internalChoice}
              onChange={(event) => patch({ internalChoice: event.target.value })}
              error={choiceProblem !== undefined}
              helperText={choiceProblem ?? 'Questions offered as an OR'}
              autoComplete="off"
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              sx={{ width: { xs: '100%', sm: 190 } }}
            />

            <FormControlLabel
              control={
                <Checkbox
                  size="small"
                  checked={section.twoColumn}
                  onChange={(event) => patch({ twoColumn: event.target.checked })}
                />
              }
              label="Print in two columns"
            />
          </Stack>

          {totals.splitsMarks ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              This section counts {totals.marks} marks and prints {totals.printedMarks}.{' '}
              {CHOICE_SPLITS_MARKS}
            </Typography>
          ) : null}
        </Stack>
      </FormControl>
    </Box>
  );
}
