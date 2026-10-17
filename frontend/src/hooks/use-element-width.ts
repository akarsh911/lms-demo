'use client';

import * as React from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * The rendered size of an element, kept current with a ResizeObserver.
 *
 * For layouts that must respond to the space a component ACTUALLY has rather
 * than to the viewport. A widget is the case in point: the same widget sits
 * beside a sidebar on a page, alone in fullscreen, and alone on a phone, and a
 * viewport media query cannot tell those apart. Height matters as much as
 * width — a 1280×800 laptop is wide enough for two columns and too short for
 * everything one of them would like to hold.
 *
 * Returns a callback ref and the size, `null` until first measured.
 */
export function useElementSize(): [(el: HTMLElement | null) => void, ElementSize | null] {
  const [element, setElement] = React.useState<HTMLElement | null>(null);
  const [size, setSize] = React.useState<ElementSize | null>(null);

  React.useEffect(() => {
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width: Math.round(width), height: Math.round(height) },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, size];
}
