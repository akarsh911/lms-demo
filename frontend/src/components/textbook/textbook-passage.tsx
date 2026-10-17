'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { BookOpenText } from 'lucide-react';

import { useTextbookPassages, type TextbookScope } from '@/hooks/query/use-textbook-passages';
import { excerpt, readableVerbatim } from '@/lib/retrieval/passage';

/**
 * "From your textbook": the passage of the student's own book that backs what
 * a panel is teaching, quoted verbatim with its page citation.
 *
 * Grounding, never authority. The panel it sits in is complete without it:
 * marks, explanations and instructions never depend on retrieval. So every
 * failure is quiet: loading is a thin placeholder, an unreachable engine or a
 * chapter that is not in the library renders a single muted line, not an
 * error card, because a missing citation should not look like a broken lab.
 *
 * Only the top passage is shown; "Show another" steps through the next ones,
 * for when the best match is the chapter summary rather than the exposition.
 */
export function TextbookPassage({
  scope,
  query,
  heading = 'From your NCERT textbook',
  topK = 3,
  enabled = true,
}: {
  scope: TextbookScope;
  query: string;
  heading?: string;
  topK?: number;
  /** Hold the requests until the passage is actually wanted (an answered question). */
  enabled?: boolean;
}): React.ReactElement | null {
  const theme = useTheme();
  const result = useTextbookPassages(scope, query, { topK, enabled });
  const [shown, setShown] = React.useState(0);

  if (!enabled) return null;

  const frame = (children: React.ReactNode): React.ReactElement => (
    <Box
      component="figure"
      sx={{
        m: 0,
        mt: 1.25,
        p: 1.25,
        borderRadius: `${theme.band.radius.sm}px`,
        backgroundColor: theme.brand.subtle,
        borderLeft: `3px solid ${theme.hues.teal}`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          color: theme.brand.tert,
          fontSize: theme.band.type.min,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          mb: 0.5,
        }}
      >
        <BookOpenText size={13} aria-hidden="true" />
        {heading}
      </Box>
      {children}
    </Box>
  );

  if (result.status === 'loading') {
    return frame(
      <>
        <Skeleton variant="text" />
        <Skeleton variant="text" width="80%" />
      </>,
    );
  }

  if (result.status === 'error' || result.status === 'empty') {
    return frame(
      <Typography sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.tert }}>
        {result.status === 'error'
          ? 'The textbook library could not be reached just now.'
          : 'This isn’t covered in your textbook library yet.'}
      </Typography>,
    );
  }

  const passage = result.passages[shown % result.passages.length]!;
  // The pages this passage came from: the running head printed on each of them
  // is furniture, and knowing the number is what makes it safe to remove.
  const text = excerpt(readableVerbatim(passage.verbatim_text, [passage.page, ...(passage.citation.page_range ?? [])]));

  return frame(
    <>
      <Typography
        component="blockquote"
        sx={{ m: 0, fontSize: theme.band.type.base - 1, color: theme.brand.text, fontStyle: 'italic', textWrap: 'pretty' }}
      >
        “{text}”
      </Typography>
      <Box
        component="figcaption"
        sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 0.75 }}
      >
        <Typography sx={{ fontSize: theme.band.type.min + 0.5, color: theme.brand.sub, fontWeight: 600 }}>
          {passage.citation.render}
        </Typography>
        {result.passages.length > 1 ? (
          <Button
            size="small"
            variant="text"
            onClick={() => setShown((i) => i + 1)}
            sx={{ px: 1, ml: 'auto', flex: 'none' }}
          >
            Show another
          </Button>
        ) : null}
      </Box>
    </>,
  );
}
