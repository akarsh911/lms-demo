'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardHeader from '@mui/material/CardHeader';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Sparkles } from 'lucide-react';

import { SettingsSection } from '@/components/ui/settings-section';
import type { PlannerChapter, PlannerOffering } from '@/types/lesson-planner';

import { ChapterExtras, ChapterSelect, TopicFocus } from './chapter-picker';
import { patchComposer, type ComposerState } from './composer-store';
import { ObjectivesField } from './objectives-field';
import { OfferingSelect } from './offering-select';
import { INNER_GAP } from './spacing';
import type { ResourceResolver } from './use-resource-links';

const PERIOD_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function PlanSetup({
  offerings,
  state,
  chapter,
  resolve,
  onGenerate,
}: {
  offerings: readonly PlannerOffering[];
  state: ComposerState;
  chapter: PlannerChapter | null;
  resolve: ResourceResolver;
  onGenerate: () => void;
}): React.ReactElement {
  const offering = offerings.find((candidate) => candidate.offering_id === state.offeringId) ?? null;
  const chosen = state.objectives.filter((objective) => objective.chosen).length;
  const count = state.periodCount ?? chapter?.suggested_periods ?? 1;
  const ready = offering !== null && chapter !== null && chosen > 0;

  const pickChapter = (next: PlannerChapter): void =>
    patchComposer({
      chapterId: next.id,
      topicIds: [],
      focusTitles: [],
      periodCount: next.suggested_periods,
      objectives: next.objectives.map((text) => ({ text, chosen: true, custom: false })),
      objectivesFor: next.id,
    });

  const focusTopics = (topicIds: string[], focusTitles: string[]): void => {
    const count = topicIds.length + focusTitles.length;
    patchComposer({ topicIds, focusTitles, periodCount: count > 0 ? Math.min(count, PERIOD_CHOICES.length) : (chapter?.suggested_periods ?? null) });
  };

  return (
    <Card>
      <CardHeader title="New lesson" subheader={offering && chapter ? `${offering.subject_name}, ${offering.section_label}` : 'Plan periods for one chapter'} />
      <SettingsSection title="Class and chapter" hint="Periods follow the timetable">
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: INNER_GAP, alignItems: 'center' }}>
          <OfferingSelect
            offerings={offerings}
            selected={offering}
            onSelect={(offeringId) => patchComposer({ offeringId, chapterId: null, topicIds: [], focusTitles: [], objectives: [], objectivesFor: null, periodCount: null })}
          />
          {offering?.curriculum_id ? <ChapterSelect curriculumId={offering.curriculum_id} chapterId={state.chapterId} onChapter={pickChapter} /> : null}
          {offering && chapter ? (
            <TextField select size="small" label="Periods" value={count} onChange={(event) => patchComposer({ periodCount: Number(event.target.value) })} sx={{ width: 100 }}>
              {PERIOD_CHOICES.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          {offering && !offering.curriculum_id ? (
            <Typography variant="body2" color="text.secondary">
              No curriculum for this subject
            </Typography>
          ) : null}
        </Stack>
      </SettingsSection>

      {offering && chapter ? (
        <>
          {chapter.topics.length > 0 || state.focusTitles.length > 0 ? (
            <SettingsSection title="Topic focus" hint="Optional. Pick topics to plan only those, as for a re-teach">
              <TopicFocus chapter={chapter} topicIds={state.topicIds} focusTitles={state.focusTitles} onChange={focusTopics} />
            </SettingsSection>
          ) : null}
          <SettingsSection title="Material" hint="Pages and resources to link">
            <ChapterExtras
              chapter={chapter}
              resolve={(resource) =>
                resolve(resource, { grade: offering.grade, subject: offering.subject_name, chapterId: chapter.id, topic: state.focusTitles[0] ?? chapter.topics.find((topic) => state.topicIds.includes(topic.id))?.title ?? null, sectionLabel: offering.section_label })
              }
            />
          </SettingsSection>
          <SettingsSection title="Objectives" hint="Untick any you will skip">
            <ObjectivesField objectives={state.objectives} onChange={(objectives) => patchComposer({ objectives })} />
          </SettingsSection>
        </>
      ) : null}

      <CardActions sx={{ justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<Sparkles size={16} />} disabled={!ready} onClick={onGenerate}>
          Generate
        </Button>
      </CardActions>
    </Card>
  );
}
