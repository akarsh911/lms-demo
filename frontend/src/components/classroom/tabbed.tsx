'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface TabSpec {
  slug: string;
  label: string;
}

export function useTabSlug(tabs: readonly TabSpec[]): [string, (slug: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const requested = params.get('tab');
  const current = tabs.some((tab) => tab.slug === requested)
    ? requested!
    : tabs[0]!.slug;

  const select = React.useCallback(
    (slug: string) => {
      const next = new URLSearchParams(params);
      next.set('tab', slug);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return [current, select];
}

export function TabBar({
  tabs,
  current,
  onSelect,
  idPrefix,
}: {
  tabs: readonly TabSpec[];
  current: string;
  onSelect: (slug: string) => void;
  idPrefix: string;
}): React.ReactElement {
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.slug === current),
  );

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={index}
        onChange={(_, next: number) => onSelect(tabs[next]!.slug)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ minHeight: 44 }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.slug}
            label={tab.label}
            id={`${idPrefix}-tab-${tab.slug}`}
            aria-controls={`${idPrefix}-panel-${tab.slug}`}
            sx={{ minHeight: 44 }}
          />
        ))}
      </Tabs>
    </Box>
  );
}

export function TabPanel({
  slug,
  current,
  idPrefix,
  children,
}: {
  slug: string;
  current: string;
  idPrefix: string;
  children: React.ReactNode;
}): React.ReactElement | null {
  if (slug !== current) return null;
  return (
    <Box
      role="tabpanel"
      id={`${idPrefix}-panel-${slug}`}
      aria-labelledby={`${idPrefix}-tab-${slug}`}
      sx={{ pt: 2.5 }}
    >
      {children}
    </Box>
  );
}
