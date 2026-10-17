'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Stack from '@mui/material/Stack';
import { ArrowRight } from 'lucide-react';

import { CardToolbar } from '@/components/ui/card-toolbar';
import { EmergeChip } from '@/components/ui/chip';
import { Segmented } from '@/components/ui/segmented';
import { ONLINE_SOURCE_PREFIX } from '@/fixtures/online-test';
import type { CheckerExamDetail } from '@/types/answer-checker';
import type { Paper } from '@/types/papersetter';

import { IntakeCopyCam } from './intake-copy-cam';
import { IntakeOnline } from './intake-online';
import { IntakeUpload } from './intake-upload';

type Intake = 'copycam' | 'upload' | 'online';

const INTAKES: readonly { value: Intake; label: string; subheader: string }[] = [
  { value: 'copycam', label: 'Emerge Copy Cam', subheader: 'Scan booklets with a phone, page by page' },
  { value: 'upload', label: 'Upload PDF / ZIP', subheader: 'One class PDF, or a ZIP of PDFs and photos' },
  { value: 'online', label: 'Online test', subheader: 'Typed answers from a test taken online' },
];

function intakeOf(exam: CheckerExamDetail): Intake | null {
  const source = exam.booklets[0]?.source ?? '';
  if (!source) return null;
  if (source.startsWith('scan ')) return 'copycam';
  if (source.startsWith(ONLINE_SOURCE_PREFIX)) return 'online';
  return 'upload';
}

export function CollectStep({
  exam,
  paper,
  classSize,
  sessionId,
  onSession,
  onUploaded,
  onNext,
}: {
  exam: CheckerExamDetail;
  paper: Paper;
  classSize: number;
  sessionId: string | null;
  onSession: (sessionId: string) => void;
  onUploaded: (jobId: string) => void;
  onNext: () => void;
}): React.ReactElement {
  const used = intakeOf(exam);
  const [intake, setIntake] = React.useState<Intake>(used ?? (sessionId ? 'copycam' : 'copycam'));
  const current = INTAKES.find((entry) => entry.value === intake) ?? INTAKES[0];

  return (
    <Card>
      <CardHeader title="Answer sheets" subheader={current?.subheader} />
      <CardContent>
        <Stack spacing={2.5}>
          <CardToolbar start={<Segmented ariaLabel="How the sheets come in" value={intake} onChange={setIntake} options={INTAKES.map(({ value, label }) => ({ value, label }))} />}>
            {exam.booklets.length > 0 ? (
              <>
                <EmergeChip label={`${exam.booklets.length} in`} tone="green" dot />
                <Button size="small" variant="outlined" endIcon={<ArrowRight size={14} />} onClick={onNext}>
                  Names
                </Button>
              </>
            ) : null}
          </CardToolbar>
          {intake === 'copycam' ? <IntakeCopyCam examId={exam.id} sessionId={sessionId} onSession={onSession} onFinished={onUploaded} /> : null}
          {intake === 'upload' ? <IntakeUpload examId={exam.id} classSize={classSize} onUploaded={onUploaded} /> : null}
          {intake === 'online' ? <IntakeOnline examId={exam.id} paper={paper} sectionCode={exam.klass} onImported={onUploaded} onUpload={() => setIntake('upload')} /> : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
