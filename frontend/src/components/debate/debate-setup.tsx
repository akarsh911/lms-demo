'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardHeader from '@mui/material/CardHeader';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { SlidersHorizontal } from 'lucide-react';

import { Segmented } from '@/components/ui/segmented';
import { SettingsSection } from '@/components/ui/settings-section';
import { DEBATE_PARAMS } from '@/constants/debate';
import { debateErrorMessage } from '@/lib/debate/failure';
import { motionProblem, normalizeMotion } from '@/lib/debate/motion';
import type {
  CreateDebateRequest,
  DebateCatalog,
  DebateDifficulty,
  DebatePositionChoice,
  DebateSpeaker,
} from '@/types/debate';

import { CustomMotionField } from './custom-motion-field';
import { DebateModeContext } from './debate-heading';

const CUSTOM = 'custom';
const SIDE_LABEL: Record<DebatePositionChoice, string> = { FOR: 'For', AGAINST: 'Against', AUTO: 'Surprise me' };

function presetMotion(catalog: DebateCatalog, topicId: string | null): { category: string; topicId: string } {
  const linked = topicId ? catalog.categories.find((c) => c.topics.some((t) => t.id === topicId)) : undefined;
  if (linked && topicId) return { category: linked.id, topicId };
  const first = catalog.categories[0];
  return { category: first?.id ?? CUSTOM, topicId: first?.topics[0]?.id ?? '' };
}

function Label({ text, hint }: { text: string; hint: string }): React.ReactElement {
  return (
    <Tooltip title={hint}>
      <span>{text}</span>
    </Tooltip>
  );
}

export function DebateSetup({
  grade,
  catalog,
  creating,
  error,
  onCreate,
}: {
  grade: number | null;
  catalog: DebateCatalog;
  creating: boolean;
  error: unknown;
  onCreate: (request: CreateDebateRequest) => void;
}): React.ReactElement {
  const theme = useTheme();
  const mode = React.useContext(DebateModeContext);
  const params = useSearchParams();
  const [initial] = React.useState(() => presetMotion(catalog, params.get(DEBATE_PARAMS.motion)));
  const [category, setCategory] = React.useState(initial.category);
  const [topicId, setTopicId] = React.useState(initial.topicId);
  const [customTopic, setCustomTopic] = React.useState('');
  const [position, setPosition] = React.useState<DebatePositionChoice>('FOR');
  const [firstSpeaker, setFirstSpeaker] = React.useState<DebateSpeaker>('student');
  const [difficulty, setDifficulty] = React.useState<DebateDifficulty>('intermediate');
  const [language, setLanguage] = React.useState(catalog.languages[0]?.code ?? 'en-IN');
  const [duration, setDuration] = React.useState(catalog.durations[0]?.seconds ?? 180);
  const [context, setContext] = React.useState(grade === null ? '' : `I am in Class ${grade}.`);
  const [options, setOptions] = React.useState(false);
  const [attempted, setAttempted] = React.useState(false);
  const motionInput = React.useRef<HTMLTextAreaElement>(null);

  const isCustom = category === CUSTOM;
  const topics = catalog.categories.find((c) => c.id === category)?.topics ?? [];
  const { topic_min_chars: minChars, topic_max_chars: maxChars, context_max_chars: contextMax } = catalog.limits;
  const customInvalid = isCustom && motionProblem(customTopic, minChars, maxChars) !== null;

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    if (customInvalid) {
      setAttempted(true);
      motionInput.current?.focus();
      return;
    }
    if (!isCustom && !topicId) return;
    onCreate({
      ...(isCustom ? { topic: normalizeMotion(customTopic) } : { topic_id: topicId }),
      position,
      first_speaker: firstSpeaker,
      difficulty,
      language,
      duration_s: duration,
      student_context: context.trim(),
    });
  };

  const chip = (id: string, label: string, onClick: () => void): React.ReactElement => (
    <Chip
      key={id}
      label={label}
      clickable
      size="small"
      color={category === id ? 'primary' : 'default'}
      variant={category === id ? 'filled' : 'outlined'}
      aria-pressed={category === id}
      onClick={onClick}
    />
  );

  return (
    <Card component="form" onSubmit={submit} noValidate sx={{ overflow: 'visible' }}>
      <CardHeader title="New debate" subheader="Pick a motion and a side" action={mode} />

      <SettingsSection title="Motion" hint="Preset motions, or your own">
        <Stack spacing={1.5} sx={{ minWidth: 0 }}>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }} role="group" aria-label="Category">
            {catalog.categories.map((c) =>
              chip(c.id, c.label, () => {
                setCategory(c.id);
                setTopicId(c.topics[0]?.id ?? '');
              }),
            )}
            {chip(CUSTOM, 'Write your own motion', () => setCategory(CUSTOM))}
          </Stack>
          {isCustom ? (
            <CustomMotionField
              value={customTopic}
              onChange={setCustomTopic}
              minChars={minChars}
              maxChars={maxChars}
              showProblem={attempted}
              inputRef={motionInput}
            />
          ) : (
            <List
              aria-label="Motion"
              disablePadding
              sx={{ border: `1px solid ${theme.brand.line}`, borderRadius: `${theme.band.radius.md}px`, overflow: 'hidden' }}
            >
              {topics.map((t, index) => (
                <ListItemButton
                  key={t.id}
                  divider={index < topics.length - 1}
                  selected={t.id === topicId}
                  aria-pressed={t.id === topicId}
                  onClick={() => setTopicId(t.id)}
                >
                  <ListItemText primary={t.text} slotProps={{ primary: { variant: 'subtitle2' } }} sx={{ my: 0 }} />
                </ListItemButton>
              ))}
            </List>
          )}
        </Stack>
      </SettingsSection>

      <SettingsSection title="Your side" hint="Argue for, against, or let the room draw">
        <Segmented
          ariaLabel="Your side"
          value={position}
          onChange={setPosition}
          options={catalog.positions.map((p) => ({ value: p.id, label: <Label text={SIDE_LABEL[p.id]} hint={p.description} /> }))}
        />
      </SettingsSection>

      <SettingsSection title="Length" hint="Kept by the server clock">
        <Segmented
          ariaLabel="Length"
          value={String(duration)}
          onChange={(v) => setDuration(Number(v))}
          options={catalog.durations.map((d) => ({ value: String(d.seconds), label: `${Math.round(d.seconds / 60)} min` }))}
        />
      </SettingsSection>

      <SettingsSection title="Options" hint="Who opens, strength, language">
        <Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SlidersHorizontal size={14} />}
            onClick={() => setOptions((o) => !o)}
            aria-expanded={options}
          >
            {options ? 'Hide options' : 'Show options'}
          </Button>
          <Collapse in={options}>
            <Stack spacing={2} sx={{ pt: 2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Segmented
                  ariaLabel="Who opens"
                  value={firstSpeaker}
                  onChange={setFirstSpeaker}
                  options={catalog.first_speakers.map((s) => ({
                    value: s.id,
                    label: <Label text={s.id === 'student' ? 'I open' : 'AI opens'} hint={s.description} />,
                  }))}
                />
                <Segmented
                  ariaLabel="Opponent strength"
                  value={difficulty}
                  onChange={setDifficulty}
                  options={catalog.difficulties.map((d) => ({ value: d.id, label: <Label text={d.label} hint={d.summary} /> }))}
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField select size="small" label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} sx={{ minWidth: 200 }}>
                  {catalog.languages.map((l) => (
                    <MenuItem key={l.code} value={l.code}>
                      {l.name === l.native ? l.name : `${l.name} · ${l.native}`}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  size="small"
                  fullWidth
                  label="Note for your opponent"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  slotProps={{ htmlInput: { maxLength: contextMax } }}
                />
              </Stack>
            </Stack>
          </Collapse>
        </Box>
      </SettingsSection>

      {error ? (
        <Box sx={{ px: 3, pb: 3 }}>
          <Alert severity="warning" variant="outlined">
            {debateErrorMessage(error)}
          </Alert>
        </Box>
      ) : null}

      <CardActions
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 1,
          justifyContent: 'flex-end',
          gap: 1.5,
          px: 3,
          py: 1.5,
          borderTop: `1px solid ${theme.brand.line}`,
          borderRadius: `0 0 ${theme.band.radius.lg}px ${theme.band.radius.lg}px`,
          backgroundColor: theme.brand.surface,
        }}
      >
        <Typography variant="body2" color="text.secondary" noWrap sx={{ flex: 1, minWidth: 0 }}>
          {isCustom ? normalizeMotion(customTopic) || 'Your own motion' : (catalog.categories.flatMap((c) => c.topics).find((t) => t.id === topicId)?.text ?? '')}
        </Typography>
        <Button type="submit" variant="contained" loading={creating} disabled={!isCustom && !topicId}>
          Start
        </Button>
      </CardActions>
    </Card>
  );
}
