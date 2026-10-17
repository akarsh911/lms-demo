'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';

import { percent } from '@/lib/gap-analyzer/model';
import type { GapStatus, Trend, TrendPoint } from '@/types/gap-analyzer';

import { STATUS_META, TREND_LABEL } from './status';

export function TrendSparkline({
  points,
  trend,
  status,
  width = 120,
  height = 32,
  tooltip = false,
}: {
  points: readonly TrendPoint[];
  trend: Trend;
  status: GapStatus;
  width?: number;
  height?: number;
  tooltip?: boolean;
}): React.ReactElement {
  const theme = useTheme();
  const first = points[0];
  const last = points[points.length - 1];
  if (points.length < 2 || !first || !last) {
    return (
      <Typography variant="caption" color="text.secondary" aria-label={TREND_LABEL.unknown} title={TREND_LABEL.unknown} sx={{ width, display: 'inline-block', textAlign: 'center' }}>
        —
      </Typography>
    );
  }
  const label = `${TREND_LABEL[trend]}: ${percent(first.score)} on ${first.date} to ${percent(last.score)} on ${last.date}`;
  const hue = STATUS_META[status].hue;
  return (
    <Box role="img" aria-label={label} title={label} sx={{ width, height, flexShrink: 0 }}>
      <SparkLineChart
        data={points.map((point) => Math.round(point.score * 100))}
        xAxis={{ scaleType: 'point', data: points.map((point) => point.date) }}
        yAxis={{ min: 0, max: 100 }}
        width={width}
        height={height}
        area
        curve="linear"
        color={hue ? theme.hues[hue] : theme.palette.text.secondary}
        showTooltip={tooltip}
        showHighlight={tooltip}
        valueFormatter={(value) => (value === null ? '—' : `${value}%`)}
      />
    </Box>
  );
}
