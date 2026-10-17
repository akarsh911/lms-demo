'use client';

import * as React from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { StepUpDialog } from '@/components/auth/step-up-dialog';
import { ThemeProvider } from '@/styles/theme';
import type { GradeBandId } from '@/styles/theme';

/**
 * Client providers.
 *
 * Note what is NOT here: any entitlement context. Entitlements are resolved on
 * the server and expressed as rendered markup. There is no client-side feature
 * store to read, and therefore none to tamper with.
 *
 * The grade band IS passed down, because it is a display preference rather than
 * a permission. It arrives already resolved from the server so the first paint
 * is correct — swapping the visual language after hydration would be visible.
 *
 * `v16-appRouter` is the correct import on Next 16; the MUI docs still show
 * `v15-appRouter`, which silently misconfigures the Emotion cache.
 */
export function Providers({
  children,
  band,
}: {
  children: React.ReactNode;
  band?: GradeBandId;
}): React.ReactElement {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider band={band} allowPreview>
        <QueryClientProvider client={queryClient}>
          {children}
          <StepUpDialog />
        </QueryClientProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
