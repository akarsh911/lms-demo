'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import { useTheme, type Theme } from '@mui/material/styles';

import type { Annotation, AnnotationColour, BookletPage, Box as Rect } from '@/types/answer-checker';

function strokeOf(colour: AnnotationColour, theme: Theme): string {
  switch (colour) {
    case 'green':
      return theme.palette.success.main;
    case 'blue':
      return theme.palette.info.main;
    case 'amber':
      return theme.palette.warning.main;
    case 'red':
      return theme.palette.error.main;
    default: {
      const never: never = colour;
      return never;
    }
  }
}

function tick(box: Rect, offset = 0): string {
  const x = box.x + offset;
  const size = Math.min(box.w, box.h);
  return `M ${x} ${box.y + size * 0.55} L ${x + size * 0.35} ${box.y + size * 0.9} L ${x + size * 0.9} ${box.y + size * 0.1}`;
}

function wave(box: Rect): string {
  const y = box.y + box.h;
  const step = 14;
  let path = `M ${box.x} ${y}`;
  for (let x = box.x, up = true; x < box.x + box.w; x += step, up = !up) path += ` Q ${x + step / 2} ${up ? y - 8 : y + 8} ${x + step} ${y}`;
  return path;
}

function Mark({ annotation, stroke, scale }: { annotation: Annotation; stroke: string; scale: number }): React.ReactElement | null {
  const box = annotation.target.box;
  const width = 3 * scale;
  const common = { stroke, strokeWidth: width, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const title = annotation.reason ? <title>{annotation.reason}</title> : null;

  if (annotation.kind === 'freehand') {
    if (annotation.points.length < 2) return null;
    return <polyline {...common} points={annotation.points.map(([x, y]) => `${x},${y}`).join(' ')}>{title}</polyline>;
  }
  if (!box) return null;

  switch (annotation.kind) {
    case 'question_number':
      return <ellipse {...common} cx={box.x + box.w / 2} cy={box.y + box.h / 2} rx={box.w / 2 + 6 * scale} ry={box.h / 2 + 4 * scale}>{title}</ellipse>;
    case 'circle':
      return <ellipse {...common} cx={box.x + box.w / 2} cy={box.y + box.h / 2} rx={box.w / 2} ry={box.h / 2}>{title}</ellipse>;
    case 'underline':
      return <line {...common} x1={box.x} y1={box.y + box.h} x2={box.x + box.w} y2={box.y + box.h}>{title}</line>;
    case 'wavy_underline':
      return <path {...common} d={wave(box)}>{title}</path>;
    case 'tick':
      return <path {...common} d={tick(box)}>{title}</path>;
    case 'double_tick':
      return <path {...common} d={`${tick(box)} ${tick(box, Math.min(box.w, box.h) * 0.45)}`}>{title}</path>;
    case 'cross':
      return <path {...common} d={`M ${box.x} ${box.y} L ${box.x + box.h} ${box.y + box.h} M ${box.x + box.h} ${box.y} L ${box.x} ${box.y + box.h}`}>{title}</path>;
    case 'caret':
      return <path {...common} d={`M ${box.x} ${box.y + box.h} L ${box.x + box.w / 2} ${box.y} L ${box.x + box.w} ${box.y + box.h}`}>{title}</path>;
    case 'note':
    case 'margin_shorthand':
    case 'question_marks':
    case 'overflow_marker':
      return (
        <text x={box.x} y={box.y + box.h * 0.78} fill={stroke} fontSize={Math.max(18, box.h * 0.7)} fontFamily="'Segoe Print', 'Comic Sans MS', cursive" fontWeight={annotation.kind === 'question_marks' ? 700 : 400}>
          {annotation.text}
          {title}
        </text>
      );
    default: {
      const never: never = annotation.kind;
      return never;
    }
  }
}

export function BookletPageView({
  page,
  src,
  annotations,
  label,
}: {
  page: BookletPage;
  src: string;
  annotations: readonly Annotation[];
  label: string;
}): React.ReactElement {
  const theme = useTheme();
  const scale = page.width / 1240;
  const drawn = annotations.filter((annotation) => !annotation.deleted && annotation.target.page_index === page.index);

  return (
    <Box sx={{ position: 'relative', width: '100%', aspectRatio: `${page.width} / ${page.height}`, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: 'background.paper' }}>
      <Box component="img" src={src} alt={label} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
      <Box component="svg" viewBox={`0 0 ${page.width} ${page.height}`} preserveAspectRatio="none" aria-hidden sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {drawn.map((annotation) => (
          <Mark key={annotation.id} annotation={annotation} stroke={strokeOf(annotation.colour, theme)} scale={scale} />
        ))}
      </Box>
    </Box>
  );
}
