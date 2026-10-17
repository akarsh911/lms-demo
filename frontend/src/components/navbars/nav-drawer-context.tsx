'use client';

import * as React from 'react';

/**
 * The mobile drawer's open state.
 *
 * It lives in a context because the two halves of the control are on opposite
 * sides of a Server Component: the hamburger is in the top bar and the drawer
 * is in the sidebar, and the layout that renders both cannot hold client state.
 * Lifting it here keeps that layout a Server Component, which matters: it is
 * where `requirePersona` runs.
 *
 * The provider takes `children`, so everything inside stays server-rendered.
 */
interface NavDrawerValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const NavDrawerContext = React.createContext<NavDrawerValue | null>(null);

export function NavDrawerProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);

  const value = React.useMemo<NavDrawerValue>(
    () => ({ open, setOpen, toggle: () => setOpen((v) => !v) }),
    [open],
  );

  return <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>;
}

/**
 * Throws when used outside the provider rather than returning a no-op default.
 * A silently inert hamburger is much harder to notice than a crash on the first
 * render of the shell.
 */
export function useNavDrawer(): NavDrawerValue {
  const value = React.useContext(NavDrawerContext);
  if (!value) {
    throw new Error('useNavDrawer must be used inside <NavDrawerProvider>.');
  }
  return value;
}
