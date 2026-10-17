'use client';

import * as React from 'react';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { EmergeChip } from '@/components/ui';
import type { MindMapCitation } from '@/types/mindmap';

/**
 * Whether a quotation may be presented as the book's words.
 *
 * Below 1.0 the atom is a normalised version of the sentence, not the sentence,
 * and quotation marks around 0.886 of one claim something the corpus does not
 * support. The Atlas says the same thing its own way, in `PageLine`.
 */
const isVerbatim = (matchRatio: number): boolean => matchRatio >= 1;

/**
 * Where a piece of text came from, and how exactly it matches the book.
 *
 * The `match_ratio` warning is the reason this component exists rather than a
 * page number inline. Below 1.0 the text is a normalised version of the book's
 * sentence, not the sentence. Presenting it in quotation marks would claim
 * something the corpus does not support, so a non-verbatim span says so plainly
 * instead of being silently rounded up to a quotation.
 */
export function CitationNote({
  citation,
  quoted,
}: {
  citation: MindMapCitation | null;
  /** Whether the caller displayed the text as a quotation. */
  quoted?: boolean;
}): React.ReactElement | null {
  if (!citation) return null;

  const verbatim = isVerbatim(citation.match_ratio);

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      {citation.page !== null ? (
        <Typography variant="caption" color="text.secondary">
          Page {citation.page}
        </Typography>
      ) : null}

      {!verbatim ? (
        <EmergeChip
          tone="amber"
          label={`Close paraphrase (${Math.round(citation.match_ratio * 100)}% match)`}
        />
      ) : quoted ? (
        <EmergeChip tone="green" label="The book's own words" />
      ) : null}
    </Stack>
  );
}
