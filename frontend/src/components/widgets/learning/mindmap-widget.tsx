'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ChevronLeft } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { LearningScopeGate } from '@/components/learning-scope/learning-scope-gate';
import { BookPicker } from '@/components/mindmap/book-picker';
import { ChapterWorkspace } from '@/components/mindmap/chapter-workspace';
import { MindmapError } from '@/components/mindmap/mindmap-error';
import { useMindmapGrants, type MindmapGrants } from '@/components/mindmap/mindmap-grants';
import { WidgetEmpty, WidgetLoading } from '@/components/widgets/widget-states';
import { MINDMAP_FLAT_STRUCTURE, MINDMAP_LINK_PARAMS } from '@/constants/mindmap';
import { useMindMapBooks, useMindMapChapters } from '@/hooks/query/use-mindmap';
import { useGradeLevels } from '@/hooks/query/use-school';
import type { PageRange } from '@/lib/mindmap/atlas-layout';
import { chapterOptions } from '@/lib/mindmap/chapters';
import { pageRangeOf } from '@/lib/mindmap/deep-link';
import type { ChapterDocument, MindmapBook, MindmapBooksPage } from '@/types/mindmap';
import type { WidgetProps } from '@/types/widget';

type LinkChanges = Partial<Record<keyof typeof MINDMAP_LINK_PARAMS, string | null>>;

/**
 * The mind map, end to end: pick a book, pick a chapter, read the map, open a
 * concept, trace a connection, drill yourself on it.
 *
 * An `immersive` widget, which is what the full-height presentation is for: this
 * is a workspace, not a readout, and a canvas in a 400px card is unusable.
 *
 * ## What it refuses to hide
 *
 * `meta.truncated` and `meta.orphan_atoms` are shown. A map built on a graph the
 * upstream capped is still a valid map of what it received, and saying so is the
 * difference between the two. Orphans are the 55% of atoms with no typed
 * relation, and naming the number is what stops a student reading the absence of
 * cross-links as an absence of content.
 */
export function MindMapWidget({ title }: WidgetProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const grants = useMindmapGrants();

  const itemId = params.get(MINDMAP_LINK_PARAMS.item);
  const sectionId = params.get(MINDMAP_LINK_PARAMS.section);
  const from = params.get(MINDMAP_LINK_PARAMS.from);
  const to = params.get(MINDMAP_LINK_PARAMS.to);
  const range = React.useMemo(() => pageRangeOf(from, to), [from, to]);

  const books = useMindMapBooks(grants.mayReadMaps);
  const gradeLevels = useGradeLevels();
  const bookGrades = React.useMemo(() => {
    if (!books.data || !gradeLevels.data) return undefined;
    const levelOf = new Map(gradeLevels.data.rows.map((row) => [row.id, row.sequence]));
    const levels = books.data.rows.map((row) => levelOf.get(row.grade_level_id ?? ''));
    return [...new Set(levels.filter((level): level is number => typeof level === 'number'))].sort((a, b) => a - b);
  }, [books.data, gradeLevels.data]);
  const scopeSettled = !books.isPending && !gradeLevels.isPending;

  const hrefWith = (changes: LinkChanges): string => {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      const key = MINDMAP_LINK_PARAMS[name as keyof typeof MINDMAP_LINK_PARAMS];
      if (value === null || value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const openBook = (id: string): void => {
    router.push(hrefWith({ item: id, section: null, from: null, to: null, topic: null }), { scroll: false });
  };
  const closeBook = (): void => {
    router.push(hrefWith({ item: null, section: null, from: null, to: null, view: null, topic: null }), { scroll: false });
  };
  const openChapter = (id: string): void => {
    router.replace(hrefWith({ section: id, from: null, to: null, topic: null }), { scroll: false });
  };
  const clearRange = (): void => {
    router.replace(hrefWith({ from: null, to: null }), { scroll: false });
  };

  if (!grants.settled) {
    return framed(
      <>
        <Typography variant="h4">{title}</Typography>
        <WidgetLoading rows={5} />
      </>,
    );
  }
  if (!grants.mayReadMaps) {
    return framed(
      <>
        <Typography variant="h4">{title}</Typography>
        <Alert severity="info" variant="outlined">
          Your account has not been given access to mind maps.
        </Alert>
      </>,
    );
  }
  if (itemId) {
    return framed(
      <OpenBook
        title={title}
        itemId={itemId}
        sectionId={sectionId}
        range={range}
        book={books.data?.rows.find((row) => row.id === itemId)}
        grants={grants}
        onClose={closeBook}
        onChapter={openChapter}
        onClearRange={clearRange}
      />,
    );
  }
  if (!scopeSettled) return framed(<WidgetLoading rows={5} />);
  if (books.error) {
    return framed(
      <BookPicker page={undefined} isPending={false} error={books.error} onRetry={() => void books.refetch()} onOpen={openBook} />,
    );
  }

  const picker = (page: MindmapBooksPage | undefined): React.ReactElement =>
    framed(<BookPicker page={page} isPending={false} error={null} onRetry={() => void books.refetch()} onOpen={openBook} />);

  return (
    <LearningScopeGate
      mode="grade-only"
      grades={bookGrades && bookGrades.length > 0 ? bookGrades : undefined}
      ungated={picker(books.data)}
    >
      {(scope) => picker(booksForGrade(books.data, scope.grade.id))}
    </LearningScopeGate>
  );
}

function framed(children: React.ReactNode): React.ReactElement {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {children}
      </CardContent>
    </Card>
  );
}

function OpenBook({
  title,
  itemId,
  sectionId,
  range,
  book,
  grants,
  onClose,
  onChapter,
  onClearRange,
}: {
  title: string;
  itemId: string;
  sectionId: string | null;
  range: PageRange | null;
  book: MindmapBook | undefined;
  grants: MindmapGrants;
  onClose: () => void;
  onChapter: (sectionId: string) => void;
  onClearRange: () => void;
}): React.ReactElement {
  const chapters = useMindMapChapters(itemId);

  /**
   * Only documents with a real syllabus structure are offered. The engine
   * refuses to call a `flat` document mappable, because a fallback structure is
   * not a syllabus, and offering one here would produce a map of a heading.
   */
  const documents = React.useMemo(
    () => (chapters.data?.documents ?? []).filter((d) => d.structure !== MINDMAP_FLAT_STRUCTURE),
    [chapters.data],
  );
  const options = React.useMemo(() => documents.flatMap(chapterOptions), [documents]);

  // First chapter as the default, so the screen is never an empty picker.
  const active = sectionId ?? options[0]?.id ?? null;
  const listed = active !== null && options.some((o) => o.id === active);
  const flatOnly = (chapters.data?.documents.length ?? 0) > 0 && documents.length === 0;

  return (
    <>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { md: 'center' } }}
      >
        <Typography variant="h4" sx={{ flex: 'none' }}>
          {title}
        </Typography>
        <Button
          size="small"
          color="inherit"
          startIcon={<ChevronLeft size={16} />}
          onClick={onClose}
          sx={{ flex: 'none' }}
        >
          All books
        </Button>
        <Stack sx={{ minWidth: 0 }}>
          <Typography variant="body1" noWrap sx={{ fontWeight: 600 }}>
            {book?.title ?? documents[0]?.title ?? 'Book'}
          </Typography>
          {documentLine(documents[0]) ? (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ textTransform: 'capitalize' }}
            >
              {documentLine(documents[0])}
            </Typography>
          ) : null}
        </Stack>
        {options.length > 0 ? (
          <TextField
            select
            size="small"
            label="Chapter"
            value={listed ? active : ''}
            onChange={(e) => onChapter(e.target.value)}
            sx={{ minWidth: 260 }}
          >
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id} sx={{ pl: 2 + o.depth * 2 }}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </Stack>

      {chapters.error ? (
        <MindmapError error={chapters.error} onRetry={() => void chapters.refetch()} />
      ) : active ? (
        <ChapterWorkspace
          key={`${itemId}:${active}`}
          itemId={itemId}
          sectionId={active}
          range={range}
          grants={grants}
          onClearRange={onClearRange}
        />
      ) : chapters.isPending ? (
        <WidgetLoading rows={5} />
      ) : (
        <WidgetEmpty
          message={
            flatOnly
              ? 'This book was indexed without a chapter structure, so there are no chapters to map.'
              : 'This book has no chapters to map yet. A chapter becomes mappable once its concepts have been extracted.'
          }
        />
      )}
    </>
  );
}

function booksForGrade(page: MindmapBooksPage | undefined, gradeId: string): MindmapBooksPage | undefined {
  if (!page) return page;
  const rows = page.rows.filter((row) => !row.grade_level_id || row.grade_level_id === gradeId);
  return { ...page, rows, count: rows.length };
}

function documentLine(document: ChapterDocument | undefined): string | null {
  if (!document) return null;
  const parts: string[] = [];
  if (document.subject) parts.push(document.subject);
  if (typeof document.grade === 'number') parts.push(`Class ${document.grade}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
