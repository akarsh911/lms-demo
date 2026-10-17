'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowDownToLine, Check, CircleAlert } from 'lucide-react';

import { SearchField } from '@/components/ui/search-field';
import { Avatar } from '@/components/ui/row';
import { ROSE_RGB } from '@/styles/theme/colors';
import type { YearEnrollment } from '@/types/foundation';

export interface LaneStudent {
  row: YearEnrollment;
  // Where the student sits on the board now; null is the unassigned tray.
  at: string | null;
  // The lane they came from, when the move is staged and not yet saved.
  from: string | null;
}

const landing = keyframes`
  0% { transform: scale(0.96); box-shadow: 0 0 0 0 rgb(${ROSE_RGB} / 0.45); }
  40% { transform: scale(1.02); box-shadow: 0 0 0 6px rgb(${ROSE_RGB} / 0.18); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 rgb(${ROSE_RGB} / 0); }
`;

// The face of a student on the board, shared by the card in a lane and the one under the pointer.
export function StudentFace({ student, selected, moved }: { student: LaneStudent; selected: boolean; moved: boolean }): React.ReactElement {
  return (
    <>
      {selected ? (
        <Box aria-hidden sx={(theme) => ({ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: theme.brand.accent, color: theme.palette.primary.contrastText })}>
          <Check size={14} strokeWidth={3} />
        </Box>
      ) : (
        <Avatar name={student.row.name} size={24} />
      )}
      <Typography component="span" variant="body2" noWrap sx={{ flex: 1, minWidth: 0, textAlign: 'left', fontWeight: selected ? 600 : 500 }}>
        {student.row.name}
      </Typography>
      {moved ? (
        <Typography component="span" variant="caption" noWrap sx={(theme) => ({ flexShrink: 0, fontWeight: 600, color: theme.onTint.blue })}>
          from {student.from}
        </Typography>
      ) : student.row.roll_number ? (
        <Typography component="span" variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
          {student.row.roll_number}
        </Typography>
      ) : null}
    </>
  );
}

const lift = keyframes`
  from { transform: rotate(0deg) scale(1); }
  to { transform: rotate(-2deg) scale(1.04); }
`;

// What travels under the pointer: the student picked up, lifted, with the rest of a selection stacked behind and counted.
export function DragStack({ student, count }: { student: LaneStudent; count: number }): React.ReactElement {
  const layer = (n: number): React.ReactElement => (
    <Box aria-hidden sx={(theme) => ({ position: 'absolute', inset: 0, borderRadius: `${theme.band.radius.sm}px`, border: `1px solid ${theme.brand.accent}`, bgcolor: theme.tints.rose, transform: `translate(${n * 5}px, ${n * 5}px) rotate(${n * 2}deg)` })} />
  );
  return (
    <Box sx={{ position: 'relative', width: 1, height: 1, cursor: 'grabbing' }}>
      {count > 2 ? layer(2) : null}
      {count > 1 ? layer(1) : null}
      <Stack
        direction="row"
        sx={(theme) => ({
          position: 'relative',
          height: 1,
          alignItems: 'center',
          gap: 1,
          pl: 0.75,
          pr: 1,
          borderRadius: `${theme.band.radius.sm}px`,
          border: `1px solid ${theme.brand.accent}`,
          bgcolor: theme.brand.surface,
          boxShadow: theme.shadows[16],
          transform: 'rotate(-2deg) scale(1.04)',
          animation: `${lift} 140ms ease-out`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none', transform: 'none' },
        })}
      >
        <StudentFace student={student} selected={false} moved={false} />
      </Stack>
      {count > 1 ? (
        <Box sx={(theme) => ({ position: 'absolute', top: -10, right: -10, minWidth: 24, height: 24, px: 0.75, borderRadius: 12, display: 'grid', placeItems: 'center', bgcolor: theme.brand.accent, color: theme.palette.primary.contrastText, boxShadow: theme.shadows[4], typography: 'caption', fontWeight: 700 })}>
          {count}
        </Box>
      ) : null}
    </Box>
  );
}

function StudentCard({ student, selected, ghost, landed, dimmed, onToggle }: { student: LaneStudent; selected: boolean; ghost: boolean; landed: boolean; dimmed: boolean; onToggle: () => void }): React.ReactElement {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: student.row.id });
  const moved = student.from !== null;
  return (
    <ButtonBase
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-student={student.row.id}
      title={student.row.name}
      onClick={onToggle}
      aria-pressed={selected}
      aria-label={`${student.row.name}${moved ? `, moved from ${student.from}, not saved` : ''}`}
      sx={(theme) => ({
        justifyContent: 'flex-start',
        gap: 1,
        pl: 0.75,
        pr: 1,
        py: 0.625,
        minWidth: 0,
        touchAction: 'manipulation',
        borderRadius: `${theme.band.radius.sm}px`,
        border: `1px ${ghost ? 'dashed' : 'solid'} ${selected ? theme.brand.accent : moved ? theme.hues.blue : theme.brand.line2}`,
        bgcolor: selected ? theme.tints.rose : moved ? theme.tints.blue : theme.brand.surface,
        boxShadow: moved && !selected ? `inset 3px 0 0 ${theme.hues.blue}` : 'none',
        opacity: ghost ? 0.4 : dimmed ? 0.3 : 1,
        cursor: 'grab',
        transition: 'border-color 120ms, background-color 120ms, opacity 120ms',
        animation: landed ? `${landing} 700ms cubic-bezier(.2,.8,.2,1)` : 'none',
        '&:hover': { borderColor: selected ? theme.brand.accentLo : theme.brand.sub },
        '@media (prefers-reduced-motion: reduce)': { animation: 'none', transition: 'none' },
      })}
    >
      <StudentFace student={student} selected={selected} moved={moved} />
    </ButtonBase>
  );
}

// One column of the board: a section, or the unassigned tray, and a drop target for students dragged onto it.
export function ArrangeLane({
  dropId,
  title,
  capacity,
  students,
  selected,
  dragging,
  landed,
  arriving,
  leaving,
  match,
  focus,
  tray = false,
  onToggle,
}: {
  dropId: string;
  title: string;
  capacity: number | null;
  students: readonly LaneStudent[];
  selected: ReadonlySet<string>;
  // The students under the pointer while a drag is on, and an empty set otherwise.
  dragging: ReadonlySet<string>;
  landed: ReadonlySet<string>;
  arriving: number;
  leaving: number;
  match: (row: YearEnrollment) => boolean;
  focus?: boolean;
  tray?: boolean;
  onToggle: (enrollmentId: string) => void;
}): React.ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: dropId });
  const [search, setSearch] = React.useState('');
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focus]);

  const count = students.length;
  const incoming = dragging.size === 0 ? 0 : [...dragging].filter((id) => !students.some((s) => s.row.id === id)).length;
  const target = isOver && incoming > 0;
  const projected = count + (target ? incoming : 0);
  const full = capacity !== null && projected > capacity;
  const share = capacity ? Math.min(1, projected / capacity) : 0;
  const q = search.trim().toLowerCase();
  const shown = q ? students.filter((s) => s.row.name.toLowerCase().includes(q) || s.row.admission_number.toLowerCase().includes(q)) : students;

  return (
    <Card
      ref={(node: HTMLDivElement | null) => {
        ref.current = node;
        setNodeRef(node);
      }}
      role="group"
      aria-label={title}
      sx={(theme) => ({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'visible',
        transition: 'border-color 120ms, background-color 120ms, box-shadow 120ms',
        borderColor: target ? theme.brand.accent : focus ? theme.brand.ink : undefined,
        borderStyle: dragging.size > 0 && !target ? 'dashed' : 'solid',
        bgcolor: target ? theme.tints.rose : tray ? theme.brand.subtle : undefined,
        boxShadow: target ? `${theme.shadows[8]}, 0 0 0 3px rgb(${ROSE_RGB} / 0.18)` : undefined,
      })}
    >
      <Stack spacing={1} sx={{ px: 2, pt: 1.75, pb: 1.25 }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Typography variant="subtitle1" component="h3" noWrap>
              {title}
            </Typography>
            {arriving > 0 ? <Delta label={`+${arriving}`} title={`${arriving} moved in, not saved`} strong /> : null}
            {leaving > 0 ? <Delta label={`−${leaving}`} title={`${leaving} moved out, not saved`} /> : null}
          </Stack>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0, color: full ? 'warning.dark' : 'text.secondary' }}>
            {full ? <CircleAlert size={14} aria-hidden /> : null}
            <Typography variant="body2" sx={{ color: 'inherit', fontWeight: full || target ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
              {target ? `${count} → ${projected}` : count}
              {capacity !== null ? ` / ${capacity}` : ''}
            </Typography>
          </Stack>
        </Stack>
        {capacity !== null ? (
          <Box sx={(theme) => ({ height: 4, borderRadius: 2, bgcolor: theme.brand.sunken, overflow: 'hidden' })}>
            <Box sx={(theme) => ({ width: `${share * 100}%`, height: '100%', bgcolor: full ? theme.hues.amber : theme.palette.primary.main, transition: 'width 160ms' })} />
          </Box>
        ) : null}
        {count > 6 ? <SearchField label={`Find in ${title}`} value={search} onChange={setSearch} width="100%" /> : null}
      </Stack>


      <Box
        data-lane-scroll=""
        sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 0.75, px: 1.5, pb: 1.5, maxHeight: tray ? 'none' : 360, overflowY: 'auto', alignContent: 'start', minHeight: 72 }}
      >
        {shown.map((s) => (
          <StudentCard key={s.row.id} student={s} selected={selected.has(s.row.id)} ghost={dragging.has(s.row.id)} landed={landed.has(s.row.id)} dimmed={!match(s.row)} onToggle={() => onToggle(s.row.id)} />
        ))}
        {shown.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1', py: 2, textAlign: 'center' }}>
            {q ? `No one in ${title} matches “${search.trim()}”` : tray ? 'Everyone is placed' : 'Drop students here'}
          </Typography>
        ) : null}
      </Box>
      {target ? (
        <Stack direction="row" spacing={1} sx={(theme) => ({ position: 'absolute', zIndex: 1, left: 12, right: 12, bottom: 12, px: 1.5, py: 1.25, boxShadow: theme.shadows[8], pointerEvents: 'none', alignItems: 'center', justifyContent: 'center', borderRadius: `${theme.band.radius.sm}px`, border: `1.5px dashed ${theme.brand.accent}`, color: theme.onTint.rose, bgcolor: theme.brand.surface })}>
          <ArrowDownToLine size={16} aria-hidden />
          <Typography variant="subtitle2" sx={{ color: 'inherit' }}>
            Drop to move {incoming === 1 ? 'this student' : `${incoming} students`} to {title}
          </Typography>
        </Stack>
      ) : null}
    </Card>
  );
}

function Delta({ label, title, strong = false }: { label: string; title: string; strong?: boolean }): React.ReactElement {
  return (
    <Typography
      component="span"
      variant="caption"
      title={title}
      sx={(theme) => ({ px: 0.75, py: 0.125, borderRadius: 1, fontWeight: 700, fontVariantNumeric: 'tabular-nums', bgcolor: strong ? theme.tints.blue : theme.brand.sunken, color: strong ? theme.onTint.blue : theme.brand.sub })}
    >
      {label}
    </Typography>
  );
}
