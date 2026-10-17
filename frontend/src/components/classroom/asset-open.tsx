'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ExternalLink, Eye, EyeOff } from 'lucide-react';

import { useAssetLink } from '@/hooks/mutation/use-library';
import { useCapabilities } from '@/hooks/query/use-capabilities';
import { useAsset } from '@/hooks/query/use-library';
import { capabilityFor } from '@/lib/core/fields';
import { previewKindFor } from '@/lib/library/preview';
import { ApiError } from '@/services/api';

import { AssetPreview } from './asset-preview';
import { LIBRARY_READ_KEY } from './placement-picker';

const NOT_UPLOADED_YET =
  'The file has not finished uploading yet, so there is nothing to open.';
const REMOVED = 'This file has been removed, so there is nothing to open.';
const UNREACHABLE = 'The request for this file did not reach your school.';
const NO_STORE =
  'Your school has no file store configured, so this file cannot be opened.';
const NO_LINK = 'Your school could not produce a link for this file just now.';

function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return UNREACHABLE;
  if (error.status === 503) return NO_STORE;
  if (error.status === 0 || error.status >= 500) return NO_LINK;
  return error.message;
}

function openBlankTab(): Window | null {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  return tab;
}

function Quiet({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}

export function useMayReadLibrary(): boolean {
  const capabilities = useCapabilities();
  const held = capabilities.data?.capabilities;
  return held !== undefined && capabilityFor(held, LIBRARY_READ_KEY) !== undefined;
}

export function AssetOpen({
  assetId,
  title,
}: {
  assetId: string;
  title: string;
}): React.ReactElement {
  const asset = useAsset(assetId);
  const link = useAssetLink();
  const [blocked, setBlocked] = React.useState<string | null>(null);
  const [showing, setShowing] = React.useState(false);

  const open = (): void => {
    setBlocked(null);
    const tab = openBlankTab();
    link.mutate(assetId, {
      onSuccess: (minted) => {
        if (tab) {
          tab.location.replace(minted.download_url);
          return;
        }
        setBlocked(minted.download_url);
      },
      onError: () => tab?.close(),
    });
  };

  if (asset.isPending) return <Quiet>Checking the file…</Quiet>;

  if (asset.isError) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Quiet>{messageFor(asset.error)}</Quiet>
        <Button size="small" onClick={() => void asset.refetch()}>
          Try again
        </Button>
      </Stack>
    );
  }

  if (asset.data.status === 'deleted') return <Quiet>{REMOVED}</Quiet>;
  if (asset.data.status !== 'ready') return <Quiet>{NOT_UPLOADED_YET}</Quiet>;

  const named = asset.data.file_name ?? title;
  const previewKind = previewKindFor(asset.data);
  const panelId = `asset-preview-${assetId}`;

  return (
    <Stack spacing={0.75} sx={{ alignItems: 'flex-start', width: '100%' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          size="small"
          startIcon={<ExternalLink size={15} />}
          onClick={open}
          disabled={link.isPending}
          aria-label={`Open ${named} in a new tab`}
        >
          {link.isPending ? 'Opening' : 'Open file'}
        </Button>

        {previewKind !== 'none' ? (
          <Button
            size="small"
            startIcon={showing ? <EyeOff size={15} /> : <Eye size={15} />}
            onClick={() => setShowing(!showing)}
            aria-expanded={showing}
            aria-controls={showing ? panelId : undefined}
          >
            {showing ? 'Hide preview' : 'Preview here'}
          </Button>
        ) : null}
      </Stack>

      {showing && previewKind !== 'none' ? (
        <Box id={panelId} sx={{ width: '100%' }}>
          <AssetPreview
            assetId={assetId}
            kind={previewKind}
            named={named}
            opening={link.isPending}
            onOpen={open}
          />
        </Box>
      ) : null}

      {link.isError ? (
        <Alert severity="error" variant="outlined" sx={{ width: '100%' }}>
          {messageFor(link.error)}
        </Alert>
      ) : null}

      {blocked ? (
        <Alert severity="info" variant="outlined" sx={{ width: '100%' }}>
          <Typography variant="body2">
            Your browser stopped the new tab from opening.{' '}
            <Link href={blocked} target="_blank" rel="noopener noreferrer">
              Open {named}
            </Link>{' '}
            instead. This link works for a few minutes; after that, ask for the
            file again.
          </Typography>
        </Alert>
      ) : null}
    </Stack>
  );
}

export function AssetOpenBlock({
  assetId,
  title,
}: {
  assetId: string | undefined;
  title: string;
}): React.ReactElement | null {
  const mayRead = useMayReadLibrary();
  if (!assetId || !mayRead) return null;
  return (
    <Box>
      <AssetOpen assetId={assetId} title={title} />
    </Box>
  );
}
