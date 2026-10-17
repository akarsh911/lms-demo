'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { FileUp } from 'lucide-react';

import { useUploadScans } from '@/hooks/mutation/use-answer-checker';
import { failureText } from '@/lib/exams/exam';
import { answerCheckerService } from '@/services/answer-checker';

import { unzipScans } from './unzip';

const ACCEPTED = 'application/pdf,image/jpeg,image/png,application/zip,.zip';

async function expand(files: readonly File[]): Promise<File[]> {
  const out: File[] = [];
  for (const file of files) {
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip') out.push(...(await unzipScans(file)));
    else out.push(file);
  }
  return out;
}

export function IntakeUpload({ examId, classSize, onUploaded }: { examId: string; classSize: number; onUploaded: (jobId: string) => void }): React.ReactElement {
  const upload = useUploadScans(examId);
  const [expected, setExpected] = React.useState(classSize > 0 ? String(classSize) : '');
  const [over, setOver] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const inputId = React.useId();
  const fixture = answerCheckerService.fromFixtures();

  const send = async (chosen: readonly File[]): Promise<void> => {
    setProblem(null);
    const files = await expand(chosen).catch((cause: unknown) => {
      setProblem(cause instanceof Error ? cause.message : 'That zip could not be read.');
      return [] as File[];
    });
    if (files.length === 0) return;
    const count = Number.parseInt(expected, 10);
    await upload.mutateAsync({ files, expected: Number.isFinite(count) && count > 0 ? count : null }).then((job) => onUploaded(job.id), () => undefined);
  };

  return (
    <Stack spacing={2}>
      <Box
        component="label"
        htmlFor={inputId}
        onDragOver={(event: React.DragEvent) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event: React.DragEvent) => {
          event.preventDefault();
          setOver(false);
          void send(Array.from(event.dataTransfer.files));
        }}
        sx={(theme) => ({
          display: 'grid',
          placeItems: 'center',
          gap: 1,
          py: 5,
          px: 2,
          textAlign: 'center',
          cursor: 'pointer',
          borderRadius: `${theme.band.radius.md}px`,
          border: `1.5px dashed ${over ? theme.palette.primary.main : theme.brand.line}`,
          backgroundColor: over ? theme.brand.subtle : 'transparent',
        })}
      >
        <FileUp size={22} aria-hidden />
        <Typography variant="subtitle2">{upload.isPending ? 'Uploading…' : 'Drop the class PDF or a ZIP here'}</Typography>
        <Typography variant="body2" color="text.secondary">
          or click to choose · PDF, photos or ZIP
        </Typography>
        <input id={inputId} type="file" accept={ACCEPTED} multiple hidden onChange={(event) => void send(Array.from(event.target.files ?? []))} />
      </Box>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1.5 }}>
        <Tooltip title="Booklets expected: helps split where a cover is faint">
          <TextField
            size="small"
            label="Booklets expected"
            value={expected}
            onChange={(event) => setExpected(event.target.value.replace(/\D/g, ''))}
            slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Booklets expected' } }}
            sx={{ width: 168 }}
          />
        </Tooltip>
        {fixture ? (
          <Button variant="outlined" size="small" disabled={upload.isPending} onClick={() => void send([new File(['%PDF-1.4 sample class scan'], 'class-scan.pdf', { type: 'application/pdf' })])}>
            Use sample scan
          </Button>
        ) : null}
      </Stack>
      {problem || upload.isError ? (
        <Alert severity="error" variant="outlined">
          {problem ?? failureText(upload.error)}
        </Alert>
      ) : null}
    </Stack>
  );
}
