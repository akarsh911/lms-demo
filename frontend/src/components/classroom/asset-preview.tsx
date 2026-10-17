'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import { ExternalLink } from 'lucide-react';

import { useAssetContentReachable } from '@/hooks/query/use-library';
import type { PreviewKind } from '@/lib/library/preview';
import { ApiError } from '@/services/api';
import { libraryService } from '@/services/library';

const FRAME_HEIGHT = 520;

const FRAME_MAY_NOT_SHOW =
  'If the file does not appear above, this page cannot show it and nothing is ' +
  'wrong with the file itself. Open it instead — a large file opens quicker ' +
  'than it shows here.';

const IMAGE_FAILED =
  'This image could not be drawn in the page. It is still there and can be opened.';

const DENIED =
  'This account may no longer read the library, so this file cannot be shown. ' +
  'Reload the page to pick up what it is allowed to do now.';
const GONE = 'This file is no longer there, so there is nothing to show.';
const NOT_READY = 'The file has not finished uploading yet, so there is nothing to show.';
const OBJECT_MISSING =
  'Your school’s file store has nothing recorded against this file, so there is ' +
  'nothing to show. Waiting will not bring it back — whoever filed it will have ' +
  'to file it again.';
const SIZE_MISMATCH =
  'This file does not match what your school recorded for it, so it is not shown ' +
  'rather than shown wrongly. Waiting will not settle it.';
const STORE_UNUSABLE =
  'Your school’s file store could not be used just now, so this file cannot be shown.';
const UNAVAILABLE = 'This file could not be shown here just now.';

const CONFLICT_REFUSAL: Record<string, string> = {
  asset_object_missing: OBJECT_MISSING,
  asset_size_mismatch: SIZE_MISMATCH,
};

function refusalFor(error: unknown): string {
  if (!(error instanceof ApiError)) return UNAVAILABLE;
  if (error.status === 403) return DENIED;
  if (error.status === 404) return GONE;
  if (error.status === 409) return CONFLICT_REFUSAL[error.code] ?? NOT_READY;
  if (error.status === 503) return STORE_UNUSABLE;
  return UNAVAILABLE;
}

export type EmbeddablePreviewKind = Exclude<PreviewKind, 'none'>;

interface PreviewProps {
  assetId: string;
  named: string;
  opening: boolean;
  onOpen: () => void;
}

function OpenInstead({
  named,
  opening,
  onOpen,
}: Omit<PreviewProps, 'assetId'>): React.ReactElement {
  return (
    <Button
      size="small"
      startIcon={<ExternalLink size={15} />}
      onClick={onOpen}
      disabled={opening}
      aria-label={`Open ${named} in a new tab`}
    >
      {opening ? 'Opening' : 'Open file'}
    </Button>
  );
}

function Preparing({ named }: { named: string }): React.ReactElement {
  return (
    <Skeleton
      variant="rounded"
      height={FRAME_HEIGHT / 2}
      aria-label={`Preparing the preview of ${named}`}
    />
  );
}

function Refused({
  message,
  named,
  opening,
  onOpen,
}: { message: string } & Omit<PreviewProps, 'assetId'>): React.ReactElement {
  return (
    <Alert
      severity="info"
      variant="outlined"
      sx={{ width: '100%' }}
      action={<OpenInstead named={named} opening={opening} onOpen={onOpen} />}
    >
      {message}
    </Alert>
  );
}

function Framed({
  sx,
  children,
}: {
  sx?: object;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        backgroundColor: 'background.default',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function ImagePreview({
  assetId,
  named,
  opening,
  onOpen,
}: PreviewProps): React.ReactElement {
  const reachable = useAssetContentReachable(assetId);
  const [undrawable, setUndrawable] = React.useState(false);

  if (reachable.isPending) return <Preparing named={named} />;

  if (reachable.isError || undrawable) {
    return (
      <Refused
        message={undrawable ? IMAGE_FAILED : refusalFor(reachable.error)}
        named={named}
        opening={opening}
        onOpen={onOpen}
      />
    );
  }

  return (
    <Framed>
      <Box
        component="img"
        src={libraryService.assetContentUrl(assetId)}
        alt={named}
        onError={() => setUndrawable(true)}
        sx={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: FRAME_HEIGHT,
          height: 'auto',
          mx: 'auto',
        }}
      />
    </Framed>
  );
}

function FramePreview({
  assetId,
  named,
  opening,
  onOpen,
}: PreviewProps): React.ReactElement {
  const reachable = useAssetContentReachable(assetId);

  if (reachable.isPending) return <Preparing named={named} />;

  if (reachable.isError) {
    return (
      <Refused
        message={refusalFor(reachable.error)}
        named={named}
        opening={opening}
        onOpen={onOpen}
      />
    );
  }

  return (
    <Stack spacing={1} sx={{ width: '100%' }}>
      <Framed>
        <Box
          component="iframe"
          src={libraryService.assetContentUrl(assetId)}
          title={`${named}, shown in the page`}
          sx={{ display: 'block', width: '100%', height: FRAME_HEIGHT, border: 0 }}
        />
      </Framed>

      <Alert
        severity="info"
        variant="outlined"
        sx={{ width: '100%' }}
        action={<OpenInstead named={named} opening={opening} onOpen={onOpen} />}
      >
        {FRAME_MAY_NOT_SHOW}
      </Alert>
    </Stack>
  );
}

export function AssetPreview({
  kind,
  ...props
}: PreviewProps & { kind: EmbeddablePreviewKind }): React.ReactElement {
  if (kind === 'image') return <ImagePreview {...props} />;
  return <FramePreview {...props} />;
}
