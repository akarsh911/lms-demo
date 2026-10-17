'use client';

import * as React from 'react';

const LIGHT = 'light';

function documentOf(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

export function useLightFrame(frame: React.RefObject<HTMLIFrameElement | null>, active: boolean): void {
  React.useEffect(() => {
    if (!active) return undefined;
    let seen: Document | null = null;
    let request = 0;
    const mark = (): void => {
      const element = frame.current;
      const doc = element ? documentOf(element) : null;
      if (doc && doc !== seen && doc.documentElement) {
        doc.documentElement.dataset.theme = LIGHT;
        seen = doc;
      }
      request = window.requestAnimationFrame(mark);
    };
    request = window.requestAnimationFrame(mark);
    return () => window.cancelAnimationFrame(request);
  }, [frame, active]);
}

const HOST_CHROME_ID = 'emerge-host-chrome';
const HOST_CHROME = '#clschip, #classdrop, .pg-ladder { display: none !important; }';

export function useHostChrome(frame: React.RefObject<HTMLIFrameElement | null>, active: boolean): void {
  React.useEffect(() => {
    if (!active) return undefined;
    let seen: Document | null = null;
    let request = 0;
    const dress = (): void => {
      const element = frame.current;
      const doc = element ? documentOf(element) : null;
      if (doc && doc !== seen && doc.head) {
        if (!doc.getElementById(HOST_CHROME_ID)) {
          const style = doc.createElement('style');
          style.id = HOST_CHROME_ID;
          style.textContent = HOST_CHROME;
          doc.head.appendChild(style);
        }
        seen = doc;
      }
      request = window.requestAnimationFrame(dress);
    };
    request = window.requestAnimationFrame(dress);
    return () => window.cancelAnimationFrame(request);
  }, [frame, active]);
}
