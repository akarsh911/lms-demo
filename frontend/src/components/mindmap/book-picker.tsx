'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { EmergeChip, Row, type ChipTone } from '@/components/ui';
import { WidgetEmpty, WidgetLoading } from '@/components/widgets/widget-states';
import { meaningOf } from '@/constants/library';
import {
  MINDMAP_AVAILABLE,
  MINDMAP_STATE_LABEL,
  MINDMAP_STATE_MEANING,
} from '@/constants/mindmap';
import type { MindmapBook, MindmapBooksPage } from '@/types/mindmap';

import { MindmapError } from './mindmap-error';

const STATE_TONE: Record<string, ChipTone> = {
  available: 'green',
  held: 'amber',
  parked: 'amber',
  pending: 'blue',
  failed: 'red',
  not_indexed: 'grey',
};

const isOpenable = (book: MindmapBook): boolean => book.mindmap_state === MINDMAP_AVAILABLE;

export function BookPicker({
  page,
  isPending,
  error,
  onRetry,
  onOpen,
}: {
  page: MindmapBooksPage | undefined;
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  onOpen: (itemId: string) => void;
}): React.ReactElement {
  const [showWaiting, setShowWaiting] = React.useState(false);

  if (isPending) return <WidgetLoading rows={5} />;
  if (error) return <MindmapError error={error} onRetry={onRetry} />;

  const books = page?.rows ?? [];
  const ready = books.filter(isOpenable);
  const waiting = books.filter((book) => !isOpenable(book));

  if (books.length === 0) {
    return (
      <WidgetEmpty message="There is nothing in your library that you can read yet, so there is no book to map. A book appears here once your school adds it to the library." />
    );
  }

  return (
    <Stack spacing={1.5} sx={{ minHeight: 0, overflowY: 'auto' }}>
      {ready.length > 0 ? (
        <Typography variant="body2" color="text.secondary">
          Choose a book to open its chapters.
        </Typography>
      ) : (
        <Alert severity="info" variant="outlined">
          None of your books has a mind map yet.
        </Alert>
      )}

      <BookList books={ready} onOpen={onOpen} />

      {waiting.length > 0 ? (
        <Box>
          <Button
            size="small"
            color="inherit"
            aria-expanded={showWaiting}
            onClick={() => setShowWaiting((open) => !open)}
            endIcon={showWaiting ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            sx={{ textTransform: 'none' }}
          >
            {waiting.length} more not ready yet
          </Button>
          <Collapse in={showWaiting}>
            <BookList books={waiting} onOpen={onOpen} />
          </Collapse>
        </Box>
      ) : null}

      {page?.page.has_more ? (
        <Typography variant="body2" color="text.secondary">
          Only the first {page.page.limit} items in your library are listed here.
        </Typography>
      ) : null}
    </Stack>
  );
}

function BookList({
  books,
  onOpen,
}: {
  books: readonly MindmapBook[];
  onOpen: (itemId: string) => void;
}): React.ReactElement {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {books.map((book) => (
        <Box component="li" key={book.id}>
          <Row
            onClick={isOpenable(book) ? () => onOpen(book.id) : undefined}
            title={book.title ?? 'Untitled'}
            subtitle={book.kind}
            trailing={
              <EmergeChip
                tone={STATE_TONE[book.mindmap_state] ?? 'grey'}
                label={meaningOf(MINDMAP_STATE_LABEL, book.mindmap_state)}
              />
            }
          />
          {isOpenable(book) ? null : (
            <Typography variant="body2" color="text.secondary" sx={{ pb: 1 }}>
              {meaningOf(MINDMAP_STATE_MEANING, book.mindmap_state)}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}
