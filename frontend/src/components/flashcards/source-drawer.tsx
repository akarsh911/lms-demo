'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import CardHeader from '@mui/material/CardHeader';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, X } from 'lucide-react';

import { queryKeys } from '@/constants/query-keys';
import { useSourcePage } from '@/hooks/query/use-flashcards';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { libraryService } from '@/services/library';
import type { Flashcard } from '@/types/flashcards';

import { pagesLabel } from './palette';

const DRAWER_WIDTH = 460;
const FALLBACK_WORDS = 12;

interface Located {
  before: string;
  match: string;
  after: string;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternFor(words: readonly string[]): RegExp {
  return new RegExp(words.map(escapeRegExp).join('\\s+'), 'i');
}

export function locateExcerpt(text: string, excerpt: string): Located | null {
  const words = excerpt.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const found = patternFor(words).exec(text) ?? patternFor(words.slice(0, FALLBACK_WORDS)).exec(text);
  if (!found) return null;
  return {
    before: text.slice(0, found.index),
    match: found[0],
    after: text.slice(found.index + found[0].length),
  };
}

function useLinkedBook(documentId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.flashcards.all, 'linked-book', documentId ?? ''],
    queryFn: async ({ signal }) => {
      const page = await libraryService.listItems(
        { limit: 50, offset: 0, filters: { engine_document_id: documentId ?? undefined } },
        signal,
      );
      return page.rows.find((row) => row.engine_document_id === documentId && row.asset_id) ?? null;
    },
    enabled: Boolean(documentId),
    staleTime: Infinity,
    retry: false,
  });
}

export interface PageSource {
  documentId: string | null;
  documentTitle: string;
  chapterTitle: string;
  pageRange: [number, number] | null;
  excerpt: string;
  figure?: string | null;
  figureAlt?: string;
  subheader: string;
  fallbackNote: string;
  notice?: string;
}

export function SourceDrawer({
  card,
  chapterTitle,
  onClose,
}: {
  card: Flashcard | null;
  chapterTitle: string;
  onClose: () => void;
}): React.ReactElement {
  const citation = card?.citations[0] ?? null;
  return (
    <PageSourceDrawer
      source={
        card
          ? {
              documentId: citation?.document_id ?? null,
              documentTitle: citation?.document_title || 'Textbook',
              chapterTitle,
              pageRange: citation?.page_range ?? null,
              excerpt: card.source_excerpt || card.back || '',
              figure: card.visual?.reference ?? card.figure_refs[0] ?? null,
              figureAlt: card.visual?.alt_text || 'Figure from the textbook',
              subheader: 'Where this card came from',
              fallbackNote: 'Only the cited line is available for this card.',
            }
          : null
      }
      onClose={onClose}
    />
  );
}

export function PageSourceDrawer({
  source,
  onClose,
}: {
  source: PageSource | null;
  onClose: () => void;
}): React.ReactElement {
  const page = source?.pageRange?.[0] ?? null;
  const documentId = source?.documentId ?? null;
  const sourcePage = useSourcePage(documentId, page);
  const book = useLinkedBook(documentId);
  const figure = source?.figure ?? null;
  const pages = pagesLabel(source?.pageRange ?? null);
  const excerpt = source?.excerpt ?? '';
  const located = sourcePage.data ? locateExcerpt(sourcePage.data.text, excerpt) : null;
  const assetId = book.data?.asset_id;

  return (
    <Drawer
      anchor="right"
      open={Boolean(source)}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: '100%', sm: DRAWER_WIDTH } } } }}
    >
      {source ? (
        <Stack sx={{ height: '100%' }}>
          <CardHeader
            title="Source"
            subheader={source.subheader}
            action={
              <IconButton aria-label="Close source" onClick={onClose}>
                <X size={18} />
              </IconButton>
            }
          />

          <Stack spacing={2.5} sx={{ px: 3, py: 2.5, overflowY: 'auto', flex: 1 }}>
            <Breadcrumbs aria-label="Source location" separator="›">
              <Typography variant="body2" color="text.secondary">
                {source.documentTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {source.chapterTitle}
              </Typography>
              {pages ? (
                <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
                  {pages}
                </Typography>
              ) : null}
            </Breadcrumbs>

            {source.notice ? (
              <Typography variant="caption" color="text.secondary">
                {source.notice}
              </Typography>
            ) : null}

            {figure ? (
              <Box
                component="img"
                src={figure}
                alt={source.figureAlt || 'Figure from the textbook'}
                sx={{ maxWidth: '100%', borderRadius: 1, border: 1, borderColor: 'divider' }}
              />
            ) : null}

            <Box>
              <Typography variant="eyebrow" color="text.secondary">
                From the book
              </Typography>
              <Box sx={{ mt: 1 }}>
                {sourcePage.isPending && documentId && page !== null ? (
                  <Stack spacing={1}>
                    <Skeleton variant="text" />
                    <Skeleton variant="text" />
                    <Skeleton variant="text" width="70%" />
                  </Stack>
                ) : located && sourcePage.data ? (
                  <PageText located={located} />
                ) : (
                  <Stack spacing={1}>
                    <PageText located={{ before: '', match: excerpt, after: '' }} />
                    <Typography variant="caption" color="text.secondary">
                      {source.fallbackNote}
                    </Typography>
                  </Stack>
                )}
              </Box>
            </Box>
          </Stack>

          {assetId ? (
            <Box sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                startIcon={<BookOpen size={16} />}
                endIcon={<ExternalLink size={14} />}
                href={`${libraryService.assetContentUrl(assetId)}${page ? `#page=${page}` : ''}`}
                target="_blank"
                rel="noopener"
              >
                Open in book
              </Button>
            </Box>
          ) : null}
        </Stack>
      ) : null}
    </Drawer>
  );
}

function PageText({ located }: { located: Located }): React.ReactElement {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const mark = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    mark.current?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [reduced, located.match]);

  const paragraphs = (text: string): React.ReactNode =>
    text.split('\n').map((line, index, all) => (
      <React.Fragment key={index}>
        {line}
        {index < all.length - 1 ? <Box component="span" sx={{ display: 'block', height: theme.spacing(1.5) }} /> : null}
      </React.Fragment>
    ));

  return (
    <Typography variant="body1" component="div" sx={{ lineHeight: 1.75, whiteSpace: 'normal' }}>
      {paragraphs(located.before)}
      <Box
        component="mark"
        ref={mark}
        sx={{
          color: theme.brand.ink,
          bgcolor: theme.palette.warning.light,
          borderRadius: 0.5,
          px: 0.25,
          boxDecorationBreak: 'clone',
          WebkitBoxDecorationBreak: 'clone',
          '@keyframes source-pulse': {
            '0%': { boxShadow: `0 0 0 0 ${alpha(theme.palette.warning.main, 0.55)}` },
            '100%': { boxShadow: `0 0 0 10px ${alpha(theme.palette.warning.main, 0)}` },
          },
          animation: reduced ? 'none' : 'source-pulse 1.1s ease-out 2',
        }}
      >
        {located.match}
      </Box>
      {paragraphs(located.after)}
    </Typography>
  );
}
