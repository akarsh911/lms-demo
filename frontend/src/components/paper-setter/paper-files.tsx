'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { Download, ExternalLink, Eye, FileText, KeyRound, LayoutGrid, type LucideIcon } from 'lucide-react';

import { SectionHeader } from '@/components/ui/layout';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import type { ApiError } from '@/services/api';
import { paperFilesService } from '@/services/paper-files';
import type { TintName } from '@/styles/theme';
import type { PaperArtefact, PaperArtefacts } from '@/types/answer-checker';

import { paperSetterKeys } from './hooks';

const NO_FILES_YET = 'The paper service has not produced printable files for this paper.';
const FILES_TITLE = 'Files for this paper';
const FILES_SUBTITLE = 'Preview any of them here, or download it to print and share.';

const FILE_FACES: Record<string, { icon: LucideIcon; tone: TintName; what: string }> = {
  'paper.pdf': { icon: FileText, tone: 'blue', what: 'What candidates sit, as it will be printed.' },
  'blueprint.pdf': { icon: LayoutGrid, tone: 'violet', what: 'Marks by chapter and question type, with cognitive level and difficulty.' },
  'answer-key.pdf': { icon: KeyRound, tone: 'green', what: 'Model answers and the marking scheme, with where each question comes from.' },
};

const FALLBACK_FACE = { icon: FileText, tone: 'grey' as const, what: '' };

function usePaperFiles(paperId: string) {
  return useQuery<PaperArtefacts, ApiError>({
    queryKey: [...paperSetterKeys.all, 'files', paperId],
    queryFn: ({ signal }) => paperFilesService.list(paperId, signal),
  });
}

function DownloadButton({ href, file, variant }: { href: string; file: PaperArtefact; variant: 'outlined' | 'contained' }): React.ReactElement {
  return (
    <Button
      component="a"
      href={href}
      download={file.name}
      size="small"
      variant={variant}
      startIcon={<Download size={16} />}
      aria-label={`Download the ${file.label.toLowerCase()}`}
    >
      Download
    </Button>
  );
}

function PreviewDialog({ href, file, onClose }: { href: string; file: PaperArtefact; onClose: () => void }): React.ReactElement {
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth aria-labelledby="paper-file-preview-title">
      <DialogTitle id="paper-file-preview-title">{file.label}</DialogTitle>
      <DialogContent dividers sx={{ p: 0, height: '78vh', display: 'flex' }}>
        <Box component="iframe" src={href} title={`${file.label}, preview`} sx={{ border: 0, flex: 1, width: '100%' }} />
      </DialogContent>
      <DialogActions>
        <Button component="a" href={href} target="_blank" rel="noopener" size="small" startIcon={<ExternalLink size={16} />}>
          Open in a new tab
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
        <DownloadButton href={href} file={file} variant="contained" />
      </DialogActions>
    </Dialog>
  );
}

function FileCard({ paperId, file, onPreview }: { paperId: string; file: PaperArtefact; onPreview: () => void }): React.ReactElement {
  const face = FILE_FACES[file.name] ?? FALLBACK_FACE;
  const Icon = face.icon;
  return (
    <Card variant="outlined" sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box
          aria-hidden
          sx={(theme) => ({
            display: 'grid',
            placeItems: 'center',
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: `${theme.band.radius.md}px`,
            backgroundColor: theme.tints[face.tone],
            color: theme.brand.ink,
          })}
        >
          <Icon size={20} />
        </Box>
        <Typography variant="h4" component="h4">
          {file.label}
        </Typography>
      </Stack>
      {face.what ? (
        <Typography variant="body2" color="text.secondary">
          {face.what}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
        <Button size="small" variant="contained" startIcon={<Eye size={16} />} onClick={onPreview} aria-label={`Preview the ${file.label.toLowerCase()}`}>
          Preview
        </Button>
        <DownloadButton href={paperFilesService.url(paperId, file.name)} file={file} variant="outlined" />
      </Stack>
    </Card>
  );
}

export function PaperFiles({ paperId }: { paperId: string }): React.ReactElement | null {
  const { data, isPending, isError, error, refetch } = usePaperFiles(paperId);
  const [previewing, setPreviewing] = React.useState<PaperArtefact | null>(null);

  if (isPending) return <WidgetLoading rows={2} />;
  if (isError) return <WidgetError error={error} onRetry={() => void refetch()} />;
  if (data.artefacts.length === 0) return <WidgetEmpty message={NO_FILES_YET} />;

  return (
    <Box component="section" aria-label={FILES_TITLE}>
      <SectionHeader title={FILES_TITLE} subtitle={FILES_SUBTITLE} />
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' },
        }}
      >
        {data.artefacts.map((file) => (
          <Box component="li" key={file.name}>
            <FileCard paperId={paperId} file={file} onPreview={() => setPreviewing(file)} />
          </Box>
        ))}
      </Box>
      {previewing ? (
        <PreviewDialog href={paperFilesService.url(paperId, previewing.name)} file={previewing} onClose={() => setPreviewing(null)} />
      ) : null}
    </Box>
  );
}
