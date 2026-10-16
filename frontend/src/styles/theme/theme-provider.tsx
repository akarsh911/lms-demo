'use client';

import * as React from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';

import { createBandTheme } from './create-theme';
import { DEFAULT_BAND, GRADE_BANDS, isGradeBandId, type GradeBandId } from './bands';

/**
 * Makes the grade band rotatable at runtime.
 *
 * The band arrives from the SERVER as a prop — resolved from the user's class
 * groups (see `bandForGroupKeys`) — so the first paint is already correct. No
 * flash of the wrong band, and no `useEffect` that swaps the whole visual
 * language after hydration.
 *
 * `setBand` exists for previewing. It is a display preference and gates
 * nothing: a Class 12 student who forces the foundation band gets rounder
 * corners, not extra features. Entitlement is decided on the server and has no
 * connection to any of this.
 */
interface BandContextValue {
  band: GradeBandId;
  setBand: (next: GradeBandId) => void;
  /** True when the viewer has overridden the band resolved from their groups. */
  isOverridden: boolean;
  resetBand: () => void;
}

const BandContext = React.createContext<BandContextValue | null>(null);

export function useBand(): BandContextValue {
  const ctx = React.useContext(BandContext);
  if (!ctx) throw new Error('useBand must be used inside <ThemeProvider>.');
  return ctx;
}

const STORAGE_KEY = 'emerge.band.preview';

/**
 * The stored preview band, read as an EXTERNAL STORE rather than in an effect.
 *
 * `localStorage` is exactly what `useSyncExternalStore` is for. Reading it
 * during render would make the server and client disagree on the first paint —
 * a hydration mismatch across the entire theme — and reading it in an effect
 * means a `setState` that re-skins the app one frame late. `useSyncExternalStore`
 * takes a separate server snapshot, so the server renders the real band and the
 * client swaps only if a preview is actually stored.
 */
const bandStore = {
  subscribe(onChange: () => void): () => void {
    // `storage` fires in OTHER tabs; the custom event covers this one, so a
    // preview change is reflected everywhere at once.
    window.addEventListener('storage', onChange);
    window.addEventListener('emerge:band', onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener('emerge:band', onChange);
    };
  },
  getSnapshot(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private mode, or site data blocked. No preview is not an error.
      return null;
    }
  },
  // The server has no localStorage, and must not guess at one.
  getServerSnapshot(): string | null {
    return null;
  },
  set(next: string | null): void {
    try {
      if (next === null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* preference only — losing it costs nothing */
    }
    window.dispatchEvent(new Event('emerge:band'));
  },
};

export function ThemeProvider({
  children,
  band: serverBand = DEFAULT_BAND,
  allowPreview = false,
}: {
  children: React.ReactNode;
  /** Resolved on the server from the user's class groups. */
  band?: GradeBandId;
  /** Enables the preview override. Off in production unless a screen opts in. */
  allowPreview?: boolean;
}): React.ReactElement {
  const stored = React.useSyncExternalStore(
    bandStore.subscribe,
    bandStore.getSnapshot,
    bandStore.getServerSnapshot,
  );

  const override =
    allowPreview && stored && isGradeBandId(stored) ? stored : null;

  const band = override ?? serverBand;

  // Themes are memoised per band, not rebuilt on every render — `createTheme`
  // is not cheap and this sits at the root of the app.
  const theme = React.useMemo(() => createBandTheme(band), [band]);

  const value = React.useMemo<BandContextValue>(
    () => ({
      band,
      isOverridden: override !== null,
      setBand: (next) => bandStore.set(next),
      resetBand: () => bandStore.set(null),
    }),
    [band, override],
  );

  return (
    <BandContext.Provider value={value}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </BandContext.Provider>
  );
}

export { GRADE_BANDS };
