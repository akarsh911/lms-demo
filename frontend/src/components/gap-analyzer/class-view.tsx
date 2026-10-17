'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui/chip';
import { FactStrip } from '@/components/ui/fact-strip';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useClassGaps } from '@/hooks/query/use-gap-analyzer';
import { CLASS_WIDE_SHARE, percent } from '@/lib/gap-analyzer/model';
import type { ClassAnalysis, ClassTopicSummary, GapAction, ScopeSection } from '@/types/gap-analyzer';

import { ClassHeatmap } from './class-heatmap';
import { ClassInsights } from './class-insights';
import { LearnerProfile } from './learner-profile';
import { RemedialGroups } from './remedial-groups';
import { LearnerTopicDialog, type LearnerTopic } from './learner-topic-dialog';
import { MoreActions } from './more-actions';
import { PlanReteach } from './plan-reteach';
import { PrimaryAction } from './primary-action';
import { StatusLegend } from './status-legend';
import type { GapLinks } from './use-gap-links';

function gapRate(analysis: ClassAnalysis): number | null {
  const data = analysis.cells.filter((cell) => cell.topic_specific && cell.score !== null && cell.status !== 'not_taught');
  return data.length > 0 ? data.filter((cell) => cell.status === 'gap').length / data.length : null;
}

type PlanHref = (topics: readonly ClassTopicSummary[]) => string | null;

const resources = (actions: readonly GapAction[]): GapAction[] => actions.filter((action) => action.kind !== 'reteach');

function Reteach({ analysis, links, planHref }: { analysis: ClassAnalysis; links: GapLinks; planHref: PlanHref }): React.ReactElement {
  const [top] = analysis.reteach;
  const sameChapter = top ? analysis.reteach.filter((topic) => topic.chapter_id === top.chapter_id) : [];
  const headerPlan = planHref(sameChapter);
  return (
    <Card>
      <CardHeader
        title="Weak across the class"
        subheader={`Topics where ${percent(CLASS_WIDE_SHARE)} or more of the class is weak`}
        action={headerPlan ? <PlanReteach href={headerPlan} topics={sameChapter.map((topic) => topic.title)} contained /> : <PrimaryAction action={top ? resources(top.actions)[0] : undefined} links={links} />}
      />
      {analysis.reteach.length === 0 ? (
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            No taught topic has most of the class weak.
          </Typography>
        </CardContent>
      ) : (
        <List disablePadding sx={{ px: 3, py: 1 }}>
          {analysis.reteach.map((topic, index) => (
            <ListItem key={topic.topic_id} disableGutters divider={index < analysis.reteach.length - 1} sx={{ gap: 1.5, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
              <ListItemText
                primary={topic.title}
                secondary={`${topic.chapter_title} · ${topic.weak} of ${topic.learners_with_data} weak`}
                slotProps={{ primary: { variant: 'subtitle2', noWrap: true }, secondary: { variant: 'body2', noWrap: true } }}
                sx={{ my: 0, minWidth: 0 }}
              />
              <PlanReteach href={planHref([topic])} topics={[topic.title]} />
              <MoreActions actions={index === 0 && !headerPlan ? resources(topic.actions).slice(1) : resources(topic.actions)} links={links} />
              <EmergeChip label={percent(topic.weak_share)} tone="red" />
            </ListItem>
          ))}
        </List>
      )}
    </Card>
  );
}

export function ClassView({
  section,
  subjectCode,
  links,
  onSubject,
  planAny = false,
  heading = true,
}: {
  section: ScopeSection | undefined;
  subjectCode: string | null;
  links: GapLinks;
  onSubject: (code: string) => void;
  planAny?: boolean;
  heading?: boolean;
}): React.ReactElement {
  const [showAll, setShowAll] = React.useState(false);
  const [opened, setOpened] = React.useState<LearnerTopic | null>(null);
  const [profile, setProfile] = React.useState<string | null>(null);
  const subject = section?.subjects.find((row) => row.code === subjectCode) ?? section?.subjects[0];
  const query = useClassGaps(section?.section_id ?? null, subject?.code ?? null);

  if (!section || !subject) return <Alert severity="info" variant="outlined">No class with a curriculum.</Alert>;

  const body = (): React.ReactNode => {
    if (query.isPending) return <WidgetLoading rows={8} />;
    if (query.isError) return <WidgetError error={query.error} onRetry={() => void query.refetch()} />;
    const analysis = query.data;
    if (!analysis.topics.some((topic) => topic.learners_with_data > 0)) {
      return (
        <Alert severity="info" variant="outlined">
          No topic-level evidence for {analysis.subject.name} in {analysis.section.label} yet. Gaps appear here as answer sheets, quizzes, GRASP checks and practice are recorded.
        </Alert>
      );
    }
    const nameOf = (studentId: string): string => analysis.learners.find((row) => row.student_id === studentId)?.name ?? 'Learner';
    const top = analysis.reteach[0];
    const planHref: PlanHref = (topics) => {
      const [first] = topics;
      const offeringId = analysis.subject.offering_id || subject.offering_id;
      if (!first || !(subject.mine || planAny) || !offeringId) return null;
      return links.reteach({ offeringId, chapterId: first.chapter_id, topics: topics.map((row) => row.title) });
    };
    const openedTopic = opened ? analysis.topics.find((row) => row.topic_id === opened.topicId) : undefined;
    return (
      <>
        <FactStrip
          facts={[
            { label: 'Learners', value: analysis.learners.length, note: analysis.section.label },
            { label: 'Gap rate', value: percent(gapRate(analysis)), note: 'Of topic-level results' },
            { label: 'Weak across class', value: analysis.reteach.length, note: analysis.reteach.length === 1 ? 'Topic' : 'Topics' },
            { label: 'Weakest', value: top ? `${percent(top.weak_share)} weak` : 'None', note: top?.title },
          ]}
        />
        <ClassInsights analysis={analysis} />
        <RemedialGroups analysis={analysis} />
        <Reteach analysis={analysis} links={links} planHref={planHref} />
        <Card>
          <CardHeader
            title="By learner"
            subheader={`${analysis.subject.name} · scores out of 100 · click a name for the full profile`}
            action={
              <Tooltip title="Include untaught topics and topics with only an exam mark">
                <FormControlLabel control={<Switch size="small" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />} label="All topics" sx={{ mr: 0 }} />
              </Tooltip>
            }
          />
          <CardContent>
            <Stack spacing={2}>
              <StatusLegend withDiffuse={showAll} />
              <ClassHeatmap analysis={analysis} showAll={showAll} onCell={(studentId, topicId) => setOpened({ studentId, topicId, name: nameOf(studentId) })} onLearner={setProfile} />
            </Stack>
          </CardContent>
        </Card>
        <LearnerTopicDialog target={opened} links={links} reteach={openedTopic ? { href: planHref([openedTopic]), topic: openedTopic.title } : null} onClose={() => setOpened(null)} />
        <LearnerProfile analysis={analysis} studentId={profile} onClose={() => setProfile(null)} />
      </>
    );
  };

  return (
    <Stack spacing={2}>
      {heading || subject.mine ? (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          {heading ? (
            <Typography variant="h2" component="h2">
              {section.label}
            </Typography>
          ) : null}
          {subject.mine ? <EmergeChip label="Your subject" tone="green" dot /> : null}
        </Stack>
      ) : null}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={subject.code} onChange={(_, next: string) => onSubject(next)} variant="scrollable" allowScrollButtonsMobile aria-label={`Subjects, ${section.label}`}>
          {section.subjects.map((row) => (
            <Tab key={row.code} value={row.code} label={row.name} />
          ))}
        </Tabs>
      </Box>
      {body()}
    </Stack>
  );
}
