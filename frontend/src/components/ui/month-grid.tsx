'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

import { DAY_SHORT } from '@/constants/school';
import { isoDayOf, monthMatrix, todayISO } from '@/lib/school/time';

export interface MonthGridDay {
  date: string;
  isoDay: number;
  inMonth: boolean;
  isToday: boolean;
}

export function MonthGrid({
  anchor,
  ariaLabel,
  renderDay,
  onSelect,
  dayLabel,
  minCellHeight = 88,
  selected,
  onPaint,
}: {
  anchor: string;
  ariaLabel: string;
  renderDay: (day: MonthGridDay) => React.ReactNode;
  onSelect?: (day: MonthGridDay) => void;
  dayLabel?: (day: MonthGridDay) => string;
  minCellHeight?: number;
  selected?: ReadonlySet<string>;
  onPaint?: (dates: string[], select: boolean) => void;
}): React.ReactElement {
  const theme = useTheme();
  const drag = React.useRef<{ from: string; select: boolean } | null>(null);
  const weeks = React.useMemo(() => monthMatrix(anchor), [anchor]);
  const month = anchor.slice(0, 7);
  const today = todayISO();

  const days = React.useMemo(
    () =>
      weeks.flat().map((date) => ({
        date,
        isoDay: isoDayOf(date),
        inMonth: date.slice(0, 7) === month,
        isToday: date === today,
      })),
    [weeks, month, today],
  );

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        role="grid"
        aria-label={ariaLabel}
        sx={{ minWidth: 700, display: 'grid', gap: '4px', gridTemplateColumns: 'repeat(7, 1fr)' }}
      >
        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
          <Box key={day} role="columnheader" sx={{ px: 0.5, pb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
              {DAY_SHORT[day]}
            </Typography>
          </Box>
        ))}

        {days.map((day) => {
          const isOn = selected?.has(day.date) ?? false;
          const paint = (to: string) => {
            if (!drag.current || !onPaint) return;
            const all = days.map((entry) => entry.date);
            const a = all.indexOf(drag.current.from);
            const b = all.indexOf(to);
            if (a < 0 || b < 0) return;
            const [lo, hi] = a <= b ? [a, b] : [b, a];
            onPaint(all.slice(lo, hi + 1), drag.current.select);
          };
          const content = (
            <Box
              sx={{
                minHeight: minCellHeight,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 0.5,
                p: 1,
                textAlign: 'left',
                borderRadius: `${theme.band.radius.sm}px`,
                border: `1px solid ${
                  isOn ? theme.brand.orange : day.isToday ? theme.brand.orange : theme.brand.line
                }`,
                outline: isOn ? `2px solid ${theme.brand.orange}` : 'none',
                outlineOffset: '-2px',
                backgroundColor: day.inMonth ? theme.brand.surface : theme.brand.sunken,
                opacity: day.inMonth ? 1 : 0.55,
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: day.isToday ? 800 : 600, color: day.isToday ? theme.brand.orange : theme.brand.sub }}
              >
                {Number(day.date.slice(8, 10))}
              </Typography>
              {renderDay(day)}
            </Box>
          );

          if (!onSelect && !onPaint) {
            return (
              <Box key={day.date} role="gridcell" sx={{ display: 'flex' }}>
                {content}
              </Box>
            );
          }

          return (
            <Box
              key={day.date}
              role="gridcell"
              aria-selected={onPaint ? isOn : undefined}
              sx={{ display: 'flex' }}
              onPointerDown={
                onPaint
                  ? (event) => {
                      event.preventDefault();
                      drag.current = { from: day.date, select: !isOn };
                      onPaint([day.date], !isOn);
                    }
                  : undefined
              }
              onPointerEnter={onPaint ? () => paint(day.date) : undefined}
              onPointerUp={onPaint ? () => (drag.current = null) : undefined}
            >
              <ButtonBase
                onClick={onPaint ? undefined : () => onSelect?.(day)}
                aria-label={dayLabel ? dayLabel(day) : day.date}
                sx={{
                  width: '100%',
                  alignItems: 'stretch',
                  borderRadius: `${theme.band.radius.sm}px`,
                  transition: `box-shadow ${theme.band.motion.fast}ms`,
                  '&:hover': { boxShadow: theme.shadows[2] },
                }}
              >
                {content}
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
