'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { formatLongDate } from '@/lib/dates';
import { percent } from '@/lib/gap-analyzer/model';
import type { ChapterAnalysis, LearnerAnalysis, SubjectAnalysis, TopicAnalysis } from '@/types/gap-analyzer';

import { ChapterList } from './chapter-list';
import { StatusComposition } from './status-composition';
import { TopicDetail } from './topic-detail';
import type { GapLinks } from './use-gap-links';

const URGENCY: Readonly<Record<TopicAnalysis['status'], number>> = { gap: 0, at_risk: 1, strong: 2, no_data: 3, not_taught: 4 };

const byUrgency = (a: TopicAnalysis, b: TopicAnalysis): number =>
  URGENCY[a.status] - URGENCY[b.status] || (a.score ?? 1) - (b.score ?? 1) || b.confidence - a.confidence;

const topicsOf = (subject: SubjectAnalysis): TopicAnalysis[] => subject.chapters.flatMap((chapter) => chapter.topics);

const hasEvidence = (subject: SubjectAnalysis): boolean => subject.score !== null;

export interface LearnerSelection {
  subject: string | null;
  topic: string | null;
}

function SubjectTabLabel({ subject }: { subject: SubjectAnalysis }): React.ReactElement {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      {subject.subject_name}
      {subject.counts.gap > 0 ? <EmergeChip label={subject.counts.gap} tone="red" /> : null}
    </Box>
  );
}

export function LearnerView({
  analysis,
  links,
  selection,
  onSelect,
  trailing,
}: {
  analysis: LearnerAnalysis;
  links: GapLinks;
  selection: LearnerSelection;
  onSelect: (next: Partial<LearnerSelection>) => void;
  trailing?: React.ReactNode;
}): React.ReactElement {
  const [showUntaught, setShowUntaught] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);
  const withData = analysis.subjects.filter(hasEvidence);
  const subject = analysis.subjects.find((row) => row.subject_code === selection.subject) ?? withData[0] ?? analysis.subjects[0];

  React.useEffect(() => {
    const box = listRef.current;
    const row = box?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!box || !row || box.scrollHeight <= box.clientHeight) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - row.offsetHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 3);
  }, [selection.topic, selection.subject, subject?.subject_code]);

  if (!subject) return <Alert severity="info" variant="outlined">No curriculum yet.</Alert>;

  const ranked = topicsOf(subject).sort(byUrgency);
  const topic = ranked.find((row) => row.topic_id === selection.topic) ?? ranked[0] ?? null;
  const worst = ranked.find((row) => row.status === 'gap');
  const chapterOf = (topicId: string): ChapterAnalysis | undefined => subject.chapters.find((chapter) => chapter.topics.some((row) => row.topic_id === topicId));
  const chapters = showUntaught ? subject.chapters : subject.chapters.filter((chapter) => chapter.coverage !== 'not_taught' || chapter.chapter_id === topic?.chapter_id);
  const records = topicsOf(subject).reduce((sum, row) => sum + row.evidence.length, 0);

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <div>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="h2" component="h2">
              {analysis.learner.name}
            </Typography>
            <EmergeChip label={analysis.learner.section_label} tone="blue" dot />
          </Stack>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
            {analysis.learner.roll_number ? `Roll ${analysis.learner.roll_number} · ` : ''}As of {formatLongDate(analysis.as_of)}
          </Typography>
        </div>
        {trailing}
      </Stack>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={subject.subject_code} onChange={(_, next: string) => onSelect({ subject: next, topic: null })} variant="scrollable" allowScrollButtonsMobile aria-label="Subjects">
          {analysis.subjects.map((row) => (
            <Tab key={row.subject_code} value={row.subject_code} label={<SubjectTabLabel subject={row} />} />
          ))}
        </Tabs>
      </Box>

      {hasEvidence(subject) ? (
        <>
          <FactStrip
            facts={[
              { label: 'Score', value: percent(subject.score), note: subject.subject_name },
              { label: 'Biggest gap', value: worst ? percent(worst.score) : 'None', note: worst ? worst.title : 'Nothing weak and tested' },
              { label: 'At risk', value: subject.counts.at_risk, note: 'Weak or borderline' },
              { label: 'Records', value: records, note: 'Marks, sheets, drills, reports' },
            ]}
          />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 5fr) minmax(0, 7fr)' }, alignItems: 'start' }}>
            <Card sx={{ order: { xs: 2, lg: 1 } }}>
              <CardHeader
                title="Topics"
                subheader={`${subject.subject_name} by chapter`}
                action={<FormControlLabel control={<Switch size="small" checked={showUntaught} onChange={(event) => setShowUntaught(event.target.checked)} />} label="Untaught" sx={{ mr: 0 }} />}
              />
              <CardContent>
                <StatusComposition counts={subject.counts} />
              </CardContent>
              <Box ref={listRef} sx={(theme) => ({ maxHeight: { lg: '44vh' }, overflowY: { lg: 'auto' }, px: 2, pb: 1, borderTop: `1px solid ${theme.brand.line}` })}>
                <ChapterList chapters={chapters} selectedTopic={topic?.topic_id ?? null} onSelect={(topicId) => onSelect({ subject: subject.subject_code, topic: topicId })} />
              </Box>
            </Card>
            {topic ? (
              <Card sx={{ order: { xs: 1, lg: 2 } }}>
                <TopicDetail topic={topic} chapterTitle={chapterOf(topic.topic_id)?.title ?? ''} links={links} headingId={`gap-topic-${topic.topic_id}`} />
              </Card>
            ) : null}
          </Box>
        </>
      ) : (
        <Alert severity="info" variant="outlined">
          No records in {subject.subject_name} yet.
        </Alert>
      )}
    </Stack>
  );
}
