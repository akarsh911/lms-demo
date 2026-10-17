'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import visuallyHidden from '@mui/utils/visuallyHidden';
import type { Theme } from '@mui/material/styles';
import { ExternalLink, LayoutGrid } from 'lucide-react';

import { WidgetFrame, useWidgetFrame } from '@/components/widgets/widget-frame';
import {
  PLAYGROUND_HUB_CLASS_KEY,
  PLAYGROUND_PARAMS,
  PLAYGROUND_TIMELINE_PAGE,
  PLAYGROUND_TIMELINE_PARAMS,
} from '@/constants/playground';
import { TIMELINE_PARAMS } from '@/constants/timeline';
import { SCOPE_PARAMS } from '@/components/learning-scope/use-scope-url';
import {
  classParam,
  resolveSelection,
  spotOf,
  toolsFor,
  type PlaygroundChoice,
  type PlaygroundSelection,
} from '@/lib/playground/manifest';
import type { PlaygroundManifest } from '@/types/playground';

import { PlaygroundTools } from './playground-tools';
import { useHostChrome, useLightFrame } from './use-light-frame';

function PlaygroundControls({
  choice,
  selection,
  shown,
  onChoose,
}: {
  choice: PlaygroundChoice;
  selection: PlaygroundSelection;
  shown: string;
  onChoose: (next: PlaygroundChoice) => void;
}): React.ReactElement {
  const { container } = useWidgetFrame();
  const ring = (theme: Theme): React.CSSProperties => ({ border: `1px solid ${theme.brand.line2}`, borderRadius: '999px' });

  const back =
    selection.view !== 'tools'
      ? null
      : selection.tool
        ? { label: 'All tools', go: () => onChoose({ ...choice, view: 'tools', toolId: null }) }
        : { label: 'Back to the playground hub', go: () => onChoose({ ...choice, view: 'threads', toolId: null, threadId: null }) };

  return (
    <>
      {back ? (
        <Tooltip title={back.label} slotProps={{ popper: { container } }}>
          <IconButton aria-label={back.label} size="small" onClick={back.go} sx={ring}>
            <LayoutGrid size={16} />
          </IconButton>
        </Tooltip>
      ) : null}
      {selection.url ? (
        <Tooltip title="Open in a new tab" slotProps={{ popper: { container } }}>
          <IconButton component="a" href={shown} target="_blank" rel="noopener" aria-label="Open in a new tab" size="small" sx={ring}>
            <ExternalLink size={16} />
          </IconButton>
        </Tooltip>
      ) : null}
    </>
  );
}

function toolsHeading(cls: number | null): { title: string; eyebrow: string } {
  return { title: cls === null ? 'Tools' : `Tools for Class ${cls}`, eyebrow: 'Visual playground' };
}

function timelineLink(base: string, search: string): string {
  const from = new URLSearchParams(search);
  const query = new URLSearchParams();
  const cls = from.get(PLAYGROUND_TIMELINE_PARAMS.class);
  const words = from.get(PLAYGROUND_TIMELINE_PARAMS.query);
  if (cls) query.set(TIMELINE_PARAMS.class, cls);
  if (words) query.set(TIMELINE_PARAMS.query, words);
  const tail = query.toString();
  return tail ? `${base}?${tail}` : base;
}

export function PlaygroundViewer({
  manifest,
  grade,
  timelineHref,
}: {
  manifest: PlaygroundManifest;
  grade: number | null;
  timelineHref: string | null;
}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const choice: PlaygroundChoice = {
    view: params.get(PLAYGROUND_PARAMS.view) === 'tools' ? 'tools' : 'threads',
    cls: grade ?? classParam(params.get(PLAYGROUND_PARAMS.class)),
    threadId: params.get(PLAYGROUND_PARAMS.thread),
    toolId: params.get(PLAYGROUND_PARAMS.tool),
  };
  const selection = resolveSelection(manifest, choice);

  const [frame, setFrame] = React.useState({ src: selection.url ?? '', visit: 0 });
  const [shown, setShown] = React.useState(selection.url ?? '');
  const [loading, setLoading] = React.useState(selection.url !== null);
  const intended = React.useRef<PlaygroundChoice>(choice);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  useLightFrame(frameRef, selection.url !== null);
  useHostChrome(frameRef, selection.url !== null && grade !== null);
  // Speech queued inside the frame can outlive it in Chrome, so the frame is silenced whenever it is replaced or the page is left.
  React.useEffect(() => {
    const el = frameRef.current;
    return () => {
      try {
        el?.contentWindow?.speechSynthesis.cancel();
      } catch {
        // A frame from another origin cannot be reached; it silences itself on pagehide.
      }
    };
  }, [frame.visit]);

  React.useLayoutEffect(() => {
    if (grade === null) return;
    try {
      window.localStorage.setItem(PLAYGROUND_HUB_CLASS_KEY, JSON.stringify(grade));
    } catch {
      return;
    }
  }, [grade]);

  const record = React.useCallback(
    (next: PlaygroundChoice) => {
      intended.current = next;
      const query = new URLSearchParams(params);
      const put = (key: string, value: string | null): void => {
        if (value === null) query.delete(key);
        else query.set(key, value);
      };
      const tools = next.view === 'tools';
      const cls = next.cls === null ? null : String(next.cls);
      put(PLAYGROUND_PARAMS.class, grade === null ? cls : null);
      put(SCOPE_PARAMS.grade, grade === null ? null : cls);
      put(PLAYGROUND_PARAMS.thread, next.threadId);
      put(PLAYGROUND_PARAMS.tool, tools ? next.toolId : null);
      put(PLAYGROUND_PARAMS.view, tools && next.toolId === null ? 'tools' : null);
      const search = query.toString();
      window.history.replaceState(null, '', search ? `${pathname}?${search}` : pathname);
    },
    [params, pathname, grade],
  );

  const choose = (next: PlaygroundChoice): void => {
    record(next);
    const url = resolveSelection(manifest, next).url;
    if (url === null) {
      setShown('');
      setLoading(false);
      return;
    }
    if (url === shown) return;
    setLoading(true);
    setFrame((current) => ({ src: url, visit: current.visit + 1 }));
  };

  const follow = (event: React.SyntheticEvent<HTMLIFrameElement>): void => {
    setLoading(false);
    let location: Location;
    try {
      const inner = event.currentTarget.contentWindow?.location;
      if (!inner) return;
      location = inner;
    } catch {
      return;
    }
    if (timelineHref && location.pathname === PLAYGROUND_TIMELINE_PAGE) {
      router.push(timelineLink(timelineHref, location.search));
      return;
    }
    setShown(`${location.pathname}${location.search}${location.hash}`);
    const spot = spotOf(manifest, location.pathname);
    const current = intended.current;
    if (spot === null) return;
    switch (spot.kind) {
      case 'hub':
        if (current.view !== 'threads' || current.threadId !== null) {
          record({ ...current, view: 'threads', threadId: null, toolId: null });
        }
        return;
      case 'tool':
        if (current.view !== 'tools' || current.toolId !== spot.toolId) {
          record({ ...current, view: 'tools', toolId: spot.toolId });
        }
        return;
      case 'thread': {
        const band = manifest.bands.find((b) => b.id === spot.band);
        if (!band) return;
        const cls = current.cls !== null && band.classes.includes(current.cls) ? current.cls : (band.classes[0] ?? null);
        if (current.view !== 'threads' || cls !== current.cls || spot.threadId !== current.threadId) {
          record({ view: 'threads', cls, threadId: spot.threadId, toolId: null });
        }
        return;
      }
      default: {
        const unreachable: never = spot;
        return unreachable;
      }
    }
  };

  const tools = selection.url === null ? toolsHeading(selection.cls) : null;
  const frameTitle = selection.tool?.title ?? (selection.page ? `${selection.thread?.name ?? ''}: ${selection.page.title}` : 'Visual playground hub');

  return (
    <WidgetFrame
      title={tools ? tools.title : <Box component="span" sx={visuallyHidden}>{frameTitle}</Box>}
      eyebrow={tools?.eyebrow}
      actions={<PlaygroundControls choice={choice} selection={selection} shown={shown} onChoose={choose} />}
      bodySx={{ backgroundColor: (t) => t.brand.canvas, minHeight: { xs: 560, md: 0 } }}
    >
      {selection.url === null ? (
        <PlaygroundTools tools={toolsFor(manifest, selection.cls)} onOpen={(toolId) => choose({ ...choice, view: 'tools', toolId })} />
      ) : (
        <>
          {loading ? (
            <LinearProgress aria-label="Loading the playground" sx={{ position: 'absolute', inset: '0 0 auto 0', zIndex: 1 }} />
          ) : null}
          <Box
            key={frame.visit}
            ref={frameRef}
            component="iframe"
            src={frame.src}
            title={frameTitle}
            onLoad={follow}
            allow="fullscreen; autoplay"
            sx={{ display: 'block', width: '100%', height: '100%', minHeight: 'inherit', border: 0 }}
          />
        </>
      )}
    </WidgetFrame>
  );
}
