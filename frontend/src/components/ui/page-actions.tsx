'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';

const SLOT_ID = 'page-actions';

const subscribe = (): (() => void) => () => undefined;

// Where a page's primary action sits: on the right of its title. The page renders the slot, a widget fills it.
export function PageActionsSlot(): React.ReactElement {
  return <div id={SLOT_ID} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }} />;
}

// Lets the widget that owns a dialog put its button in the page header, so the state stays with the widget.
export function PageActions({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const slot = React.useSyncExternalStore(
    subscribe,
    () => document.getElementById(SLOT_ID),
    () => null,
  );
  return slot ? createPortal(children, slot) : null;
}
