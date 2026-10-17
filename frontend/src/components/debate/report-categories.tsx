'use client';

import * as React from 'react';
import { useTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';

import type { ReportCategory } from '@/types/debate';

export function ReportCategories({ categories }: { categories: readonly ReportCategory[] }): React.ReactElement {
  const theme = useTheme();
  return (
    <BarChart
      height={categories.length * 30 + 40}
      layout="horizontal"
      yAxis={[{ data: categories.map((c) => c.label), width: 170 }]}
      xAxis={[{ min: 0, max: 100, tickNumber: 5 }]}
      series={[{ data: categories.map((c) => c.score), label: 'Score', color: theme.palette.primary.main, valueFormatter: (v: number | null) => (v === null ? '' : `${v} / 100`) }]}
      hideLegend
      borderRadius={6}
      margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
      grid={{ vertical: true }}
    />
  );
}
