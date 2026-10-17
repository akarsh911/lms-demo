'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/constants/query-keys';
import { sha256Hex } from '@/lib/library/checksum';
import { libraryService } from '@/services/library';
import type { ContentItem, ContentItemWrite } from '@/types/library';

export type UploadStage =
  | 'idle'
  | 'hashing'
  | 'registering'
  | 'sending'
  | 'confirming'
  | 'filing';

export const UPLOAD_STAGE_LABEL: Record<UploadStage, string> = {
  idle: '',
  hashing: 'Reading the file and computing its checksum…',
  registering: 'Telling your school about the file…',
  sending: 'Sending the file to your school’s store…',
  confirming: 'Checking the bytes that arrived…',
  filing: 'Filing it against this class…',
};

export interface UploadDraft {
  file: File | null;
  item: Omit<ContentItemWrite, 'asset_id'>;
  onStage: (stage: UploadStage) => void;
}

const FALLBACK_MIME = 'application/octet-stream';

export function useFileMaterial() {
  const queryClient = useQueryClient();

  return useMutation<ContentItem, Error, UploadDraft>({
    mutationFn: async ({ file, item, onStage }) => {
      let assetId: string | undefined;

      if (file) {
        onStage('hashing');
        const sha256 = await sha256Hex(file);

        onStage('registering');
        const grant = await libraryService.createAsset({
          file_name: file.name,
          mime_type: file.type === '' ? FALLBACK_MIME : file.type,
          size_bytes: file.size,
          sha256,
        });
        assetId = grant.id;

        onStage('sending');
        await libraryService.putAssetContent(assetId, file);

        onStage('confirming');
        await libraryService.markAssetReady(grant.id);
      }

      onStage('filing');
      return libraryService.createItem({ ...item, asset_id: assetId });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
    },
  });
}
