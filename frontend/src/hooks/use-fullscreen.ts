'use client';

import * as React from 'react';

/**
 * Fullscreen for one element, with an in-page fallback.
 *
 * Native fullscreen (the Fullscreen API) is used where the browser offers it
 * for an element. Where it does not, notably Safari on iPhone, or where the
 * request is refused, the element is instead pinned over the whole viewport as
 * an overlay, which gives the same workspace without the browser chrome going.
 *
 * `document.fullscreenElement` is read as an external store rather than
 * mirrored into state from an effect: the browser owns that value, and leaving
 * fullscreen with Esc changes it without any event of ours.
 *
 * Usage: pass `ref` as the element's ref (a callback ref, so the element is in
 * state rather than read from a ref during render).
 */
export interface Fullscreen {
  ref: (element: HTMLElement | null) => void;
  /** True in either mode. */
  active: boolean;
  /** Which mode is active, if any. */
  mode: 'native' | 'overlay' | null;
  /** The element being made fullscreen: where overlays inside it should portal. */
  element: HTMLElement | null;
  enter: () => void;
  exit: () => void;
  toggle: () => void;
}

function subscribe(onChange: () => void): () => void {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
}
const getSnapshot = (): Element | null => document.fullscreenElement;
const getServerSnapshot = (): Element | null => null;

export function useFullscreen(): Fullscreen {
  const [element, setElement] = React.useState<HTMLElement | null>(null);
  const [overlay, setOverlay] = React.useState(false);
  const fullscreenElement = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const native = element !== null && fullscreenElement === element;
  const mode = native ? 'native' : overlay ? 'overlay' : null;

  const enter = React.useCallback(() => {
    if (!element) return;
    if (typeof element.requestFullscreen === 'function' && document.fullscreenEnabled) {
      element.requestFullscreen().catch(() => setOverlay(true));
    } else {
      setOverlay(true);
    }
  }, [element]);

  const exit = React.useCallback(() => {
    if (native) void document.exitFullscreen().catch(() => undefined);
    setOverlay(false);
  }, [native]);

  const toggle = React.useCallback(() => (mode ? exit() : enter()), [mode, enter, exit]);

  // The overlay has no browser-provided way out, so Esc is wired here. Native
  // fullscreen already exits on Esc by itself.
  React.useEffect(() => {
    if (!overlay) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) setOverlay(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay]);

  return { ref: setElement, active: mode !== null, mode, element, enter, exit, toggle };
}
