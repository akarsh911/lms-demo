'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { Minus, Plus } from 'lucide-react';

import { useWidgetFrame } from '@/components/widgets/widget-frame';
import { TIMELINE_ERAS } from '@/constants/timeline';
import {
  clampView,
  cluster,
  deepTime,
  endOf,
  inView,
  lasts,
  overviewLabel,
  overviewScale,
  panBy,
  ticks,
  whenLabel,
  yearLabel,
  yearsBetween,
  zoomAt,
} from '@/lib/timeline/model';
import type { TimelineBounds, TimelineEvent, TimelineView } from '@/types/timeline';

import { useRegionColour } from './region-colour';

const DEFAULT_WIDTH = 1440;
const MIN_WIDTH = 420;
const H = 196;
const PAD = 30;
const TOP = 44;
const MID = 118;
const BASE = 168;
const ERA_ROOM = 44;
const OVERVIEW_H = 46;
const CLUSTER_PX = 15;
const STACK_MAX = 5;
const DRAG_SLOP = 3;
const OVERVIEW_LABEL_GAP = 12;
const OVERVIEW_CHAR_PX = 6.4;
const OVERVIEW_MARKS = [-1e6, -100000, -10000, -3000, -1000, 1, 1000, 1500, 1800, 1900, 2000];

interface OverviewMark {
  year: number;
  x: number;
  label: string;
  from: number;
  to: number;
  labelled: boolean;
}

function overviewMarks(bounds: TimelineBounds, xOf: (year: number, width: number) => number, W: number): OverviewMark[] {
  return OVERVIEW_MARKS.filter((year) => year >= bounds.earliest).reduce<OverviewMark[]>((marks, year) => {
    const x = xOf(year, W);
    const label = overviewLabel(year);
    const half = (label.length * OVERVIEW_CHAR_PX) / 2;
    const centre = Math.min(W - half, Math.max(half, x));
    const lastLabelled = [...marks].reverse().find((mark) => mark.labelled);
    const fits = !lastLabelled || centre - half >= lastLabelled.to + OVERVIEW_LABEL_GAP;
    return [...marks, { year, x, label, from: centre - half, to: centre + half, labelled: fits }];
  }, []);
}

function viewBoxX(element: Element, clientX: number, W: number): number {
  const rect = element.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * W;
}

function Ribbon({
  width: W,
  events,
  view,
  bounds,
  selected,
  isOther,
  onView,
  onSelect,
  onCluster,
}: {
  width: number;
  events: readonly TimelineEvent[];
  view: TimelineView;
  bounds: TimelineBounds;
  selected: TimelineEvent | null;
  isOther: (event: TimelineEvent) => boolean;
  onView: (next: TimelineView) => void;
  onSelect: (event: TimelineEvent) => void;
  onCluster: (members: readonly TimelineEvent[]) => void;
}): React.ReactElement {
  const theme = useTheme();
  const colour = useRegionColour();
  const IW = W - PAD * 2;
  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<{ x: number; view: TimelineView; moved: boolean; pointer: number } | null>(null);
  const dragged = React.useRef(false);
  const latest = React.useRef({ view, bounds, onView, W });

  React.useEffect(() => {
    latest.current = { view, bounds, onView, W };
  });

  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      const { view: current, bounds: limits, onView: change, W: width } = latest.current;
      const year = current.from + ((viewBoxX(svg, event.clientX, width) - PAD) / (width - PAD * 2)) * (current.to - current.from);
      change(zoomAt(current, year, event.deltaY > 0 ? 1.18 : 0.85, limits));
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, []);

  const xOf = (year: number): number => PAD + IW * (yearsBetween(view.from, year) / yearsBetween(view.from, view.to));
  const visible = inView(events, view);
  const { step, years } = ticks(view.from, view.to, Math.max(4, Math.round(IW / 170)));
  const era = view.from < 0 && view.to > 0 ? '' : view.to <= 0 ? 'BCE' : 'CE';
  const points = visible.filter((event) => !lasts(event) || xOf(endOf(event)) - xOf(event.year) < 2);
  const label = { fontSize: 11.5, fill: theme.brand.tert, fontVariantNumeric: 'tabular-nums' } as const;

  const picked = (event: TimelineEvent): void => {
    if (dragged.current) return;
    onSelect(event);
  };

  const pointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    dragged.current = false;
    drag.current = { x: event.clientX, view, moved: false, pointer: event.pointerId };
  };
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    const current = drag.current;
    if (!current) return;
    if (!current.moved && Math.abs(event.clientX - current.x) > DRAG_SLOP) {
      current.moved = true;
      event.currentTarget.setPointerCapture(current.pointer);
    }
    if (!current.moved) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const years = (((event.clientX - current.x) / rect.width) * W * (current.view.to - current.view.from)) / IW;
    onView(panBy(current.view, -years, bounds));
  };
  const pointerUp = (): void => {
    if (drag.current?.moved) dragged.current = true;
    drag.current = null;
  };

  return (
    <Box
      component="svg"
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      tabIndex={0}
      role="img"
      aria-label={`A line of time from ${yearLabel(Math.round(view.from))} to ${yearLabel(Math.round(view.to))}, with ${visible.length} events. Drag to move, scroll to zoom, arrow keys step through events.`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={pointerUp}
      sx={{
        display: 'block',
        width: '100%',
        height: 'auto',
        touchAction: 'none',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        fontFamily: theme.typography.fontFamily,
        '&:focus-visible': { outline: `2px solid ${theme.brand.accent}`, outlineOffset: -2 },
        '& .ev': { cursor: 'pointer' },
        '& .ev:hover circle, & .ev:hover rect': { stroke: theme.brand.ink, strokeWidth: 2 },
      }}
    >
      {years.map((year) => {
        const x = xOf(year);
        if (x < PAD - 1 || x > W - PAD + 1) return null;
        const underEra = step < 500 && era !== '' && x > W - PAD - ERA_ROOM;
        return (
          <g key={year}>
            <line x1={x} y1={TOP} x2={x} y2={BASE} stroke={theme.brand.line} />
            {underEra ? null : (
              <text x={x} y={TOP - 13} textAnchor="middle" style={label}>
                {yearLabel(year, step < 500)}
              </text>
            )}
          </g>
        );
      })}
      {step < 500 && era ? (
        <text x={W - PAD} y={TOP - 13} textAnchor="end" fontWeight={700} style={label}>
          {era}
        </text>
      ) : null}
      <line x1={PAD} y1={MID} x2={W - PAD} y2={MID} stroke={theme.brand.line2} />
      {view.from < 0 && view.to > 0 ? (
        <g>
          <line x1={xOf(1)} y1={TOP} x2={xOf(1)} y2={BASE} stroke={theme.brand.tert} strokeDasharray="3 3" />
          <text x={xOf(1) + 5} y={BASE - 4} fontWeight={700} style={label}>
            1 CE
          </text>
        </g>
      ) : null}
      {visible.filter(lasts).map((event) => {
        const start = Math.max(PAD, xOf(event.year));
        const end = Math.min(W - PAD, xOf(endOf(event)));
        if (end - start < 2) return null;
        const long = Math.abs(yearsBetween(event.year, endOf(event))) > (view.to - view.from) / 6;
        const fill = colour(event.region);
        return (
          <rect
            key={`span-${event.index}`}
            className="ev"
            x={start}
            y={BASE - 22}
            width={end - start}
            height={11}
            rx={5.5}
            fill={fill}
            fillOpacity={long ? 0.1 : 0.26}
            stroke={fill}
            strokeOpacity={long ? 0.35 : 0.6}
            strokeDasharray={long ? '4 3' : undefined}
            opacity={isOther(event) ? 0.34 : 1}
            onClick={() => picked(event)}
          >
            <title>{`${event.label} — ${whenLabel(event)}`}</title>
          </rect>
        );
      })}
      {cluster(points, (event) => xOf(event.year), CLUSTER_PX).map((group) => {
        const x = Math.max(PAD + 6, Math.min(W - PAD - 6, group.x));
        const first = group.items[0];
        if (!first) return null;
        if (group.items.length > STACK_MAX) {
          return (
            <g key={`cluster-${group.x}`} className="ev" onClick={() => onCluster(group.items)}>
              <circle cx={x} cy={MID} r={11} fill={colour(first.region)} />
              <text x={x} y={MID + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#FFFFFF" pointerEvents="none">
                {group.items.length}
              </text>
              <title>{`${group.items.length} events in these years. Click to open them.`}</title>
            </g>
          );
        }
        return group.items.map((event, level) => (
          <g key={event.index} className="ev" opacity={isOther(event) ? 0.34 : 1} onClick={() => picked(event)}>
            <circle
              cx={x}
              cy={MID - level * 17}
              r={6.5}
              fill={colour(event.region)}
              stroke={selected?.index === event.index ? theme.brand.ink : undefined}
              strokeWidth={selected?.index === event.index ? 2.5 : undefined}
            >
              <title>{`${whenLabel(event)} — ${event.label}`}</title>
            </circle>
          </g>
        ));
      })}
      {selected && visible.includes(selected) ? (
        <text
          x={Math.max(PAD, Math.min(W - PAD, xOf(selected.year)))}
          y={BASE + 20}
          textAnchor={xOf(selected.year) > (W * 2) / 3 ? 'end' : xOf(selected.year) < W / 3 ? 'start' : 'middle'}
          fontSize={13}
          fontWeight={700}
          fill={theme.brand.sub}
        >
          {selected.label.slice(0, 64)}
        </text>
      ) : null}
      {visible.length === 0 ? (
        <text x={W / 2} y={MID} textAnchor="middle" fontSize={13} fill={theme.brand.tert}>
          Nothing in these years. Drag the line, or press Fit.
        </text>
      ) : null}
    </Box>
  );
}

function Overview({
  width: W,
  events,
  view,
  bounds,
  onView,
}: {
  width: number;
  events: readonly TimelineEvent[];
  view: TimelineView;
  bounds: TimelineBounds;
  onView: (next: TimelineView) => void;
}): React.ReactElement {
  const theme = useTheme();
  const colour = useRegionColour();
  const scale = overviewScale(bounds);
  const dragging = React.useRef(false);
  const label = { fontSize: 11.5, fill: theme.brand.tert } as const;

  const jump = (event: React.PointerEvent<SVGSVGElement>): void => {
    const year = scale.year(viewBoxX(event.currentTarget, event.clientX, W), W);
    const span = view.to - view.from;
    onView(clampView({ from: year - span / 2, to: year + span / 2 }, bounds));
  };

  const marks = overviewMarks(bounds, scale.x, W);
  const windowStart = Math.min(scale.x(view.to, W), scale.x(view.from, W));
  const windowWidth = Math.max(3, Math.abs(scale.x(view.from, W) - scale.x(view.to, W)));

  return (
    <Box
      component="svg"
      viewBox={`0 0 ${W} ${OVERVIEW_H}`}
      role="img"
      aria-label="The whole span of school history on a compressed scale, with the part you are looking at marked. Click or drag to move there."
      onPointerDown={(event: React.PointerEvent<SVGSVGElement>) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        jump(event);
      }}
      onPointerMove={(event: React.PointerEvent<SVGSVGElement>) => {
        if (dragging.current) jump(event);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      sx={{
        display: 'block',
        width: '100%',
        height: 'auto',
        borderTop: `1px solid ${theme.brand.line}`,
        backgroundColor: theme.brand.subtle,
        touchAction: 'none',
        cursor: 'crosshair',
        fontFamily: theme.typography.fontFamily,
      }}
    >
      {marks.map((mark) => (
        <g key={mark.year}>
          <line x1={mark.x} y1={14} x2={mark.x} y2={OVERVIEW_H} stroke={theme.brand.line2} />
          {mark.labelled ? (
            <text x={(mark.from + mark.to) / 2} y={11} textAnchor="middle" style={label}>
              {mark.label}
            </text>
          ) : null}
        </g>
      ))}
      {events.map((event) => (
        <rect key={event.index} x={scale.x(event.year, W)} y={OVERVIEW_H - 24} width={1.8} height={15} fill={colour(event.region)} fillOpacity={0.6} />
      ))}
      <rect
        x={windowStart}
        y={14}
        width={windowWidth}
        height={OVERVIEW_H - 14}
        rx={4}
        fill={theme.brand.ink}
        fillOpacity={0.1}
        stroke={theme.brand.ink}
        strokeOpacity={0.45}
        strokeWidth={1.5}
      />
    </Box>
  );
}

export function TimelineRibbon({
  events,
  view,
  bounds,
  selected,
  showEras,
  isOther,
  onView,
  onFit,
  onSelect,
  onCluster,
}: {
  events: readonly TimelineEvent[];
  view: TimelineView;
  bounds: TimelineBounds;
  selected: TimelineEvent | null;
  showEras: boolean;
  isOther: (event: TimelineEvent) => boolean;
  onView: (next: TimelineView) => void;
  onFit: () => void;
  onSelect: (event: TimelineEvent) => void;
  onCluster: (members: readonly TimelineEvent[]) => void;
}): React.ReactElement {
  const { container } = useWidgetFrame();
  const middle = (view.from + view.to) / 2;
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);

  React.useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = (): void => setWidth(Math.max(MIN_WIDTH, Math.round(box.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={boxRef}
      sx={(theme) => ({
        flex: 'none',
        border: `1px solid ${theme.brand.line}`,
        borderRadius: `${theme.band.radius.md}px`,
        backgroundColor: theme.brand.surface,
        overflow: 'hidden',
      })}
    >
      <Stack
        direction="row"
        sx={(theme) => ({ flexWrap: 'wrap', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, borderBottom: `1px solid ${theme.brand.line}` })}
      >
        <Typography variant="subtitle2" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {yearLabel(Math.round(view.from))} to {yearLabel(Math.round(view.to))}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', lg: 'block' } }}>
          Drag the line to move, scroll to zoom
        </Typography>
        <Box sx={{ flex: 1 }} />
        {showEras ? (
          <Stack direction="row" component="nav" aria-label="Jump to an era" sx={{ flexWrap: 'wrap', gap: 0.25 }}>
            {TIMELINE_ERAS.map((era) => (
              <Button key={era.label} size="small" color="inherit" onClick={() => onView(clampView({ from: era.from, to: era.to }, bounds))}>
                {era.label}
              </Button>
            ))}
            <Button size="small" color="inherit" onClick={() => onView(deepTime(bounds))}>
              Deep time
            </Button>
          </Stack>
        ) : null}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Tooltip title="Zoom out" slotProps={{ popper: { container } }}>
            <IconButton size="small" aria-label="Zoom out" onClick={() => onView(zoomAt(view, middle, 1.7, bounds))}>
              <Minus size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom in" slotProps={{ popper: { container } }}>
            <IconButton size="small" aria-label="Zoom in" onClick={() => onView(zoomAt(view, middle, 0.6, bounds))}>
              <Plus size={16} />
            </IconButton>
          </Tooltip>
          <Button size="small" variant="outlined" onClick={onFit}>
            Fit
          </Button>
        </Stack>
      </Stack>
      <Ribbon
        width={width}
        events={events}
        view={view}
        bounds={bounds}
        selected={selected}
        isOther={isOther}
        onView={onView}
        onSelect={onSelect}
        onCluster={onCluster}
      />
      <Overview width={width} events={events} view={view} bounds={bounds} onView={onView} />
    </Box>
  );
}
