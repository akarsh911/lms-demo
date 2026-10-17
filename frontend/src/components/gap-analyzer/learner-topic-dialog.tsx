'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';

import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useLearnerGaps } from '@/hooks/query/use-gap-analyzer';

import { PlanReteach } from './plan-reteach';
import { TopicDetail } from './topic-detail';
import type { GapLinks } from './use-gap-links';

export interface LearnerTopic {
  studentId: string;
  topicId: string;
  name: string;
}

const HEADING = 'gap-learner-topic-title';

export function LearnerTopicDialog({
  target,
  links,
  reteach,
  onClose,
}: {
  target: LearnerTopic | null;
  links: GapLinks;
  reteach: { href: string | null; topic: string } | null;
  onClose: () => void;
}): React.ReactElement {
  const learner = useLearnerGaps(target?.studentId ?? null);
  const chapter = learner.data?.subjects.flatMap((subject) => subject.chapters).find((row) => row.topics.some((topic) => topic.topic_id === target?.topicId));
  const topic = chapter?.topics.find((row) => row.topic_id === target?.topicId);

  const body = (): React.ReactNode => {
    if (learner.isPending) return <DialogContent><WidgetLoading rows={6} /></DialogContent>;
    if (learner.isError) return <DialogContent><WidgetError error={learner.error} onRetry={() => void learner.refetch()} /></DialogContent>;
    if (!topic || !chapter) return <DialogContent><WidgetEmpty message="Not in this learner's curriculum." /></DialogContent>;
    return <TopicDetail topic={topic} chapterTitle={`${target?.name ?? ''} · ${chapter.title}`} links={links} headingId={HEADING} />;
  };

  return (
    <Dialog open={target !== null} onClose={onClose} fullWidth maxWidth="md" aria-labelledby={HEADING}>
      {target ? body() : null}
      <DialogActions>
        {reteach ? <PlanReteach href={reteach.href} topics={[reteach.topic]} /> : null}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
