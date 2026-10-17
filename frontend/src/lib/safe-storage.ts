/**
 * `localStorage` that cannot throw.
 *
 * Every accessor here is wrapped, because the browser API is far less reliable
 * than it looks. Reading `window.localStorage` at all throws outright when site
 * data is blocked; Safari's private mode has historically accepted a write and
 * then thrown on the next one; a full quota throws on `setItem`; an extension
 * can replace the object with something that is not a Storage at all; and on
 * the server there is no `window` to ask. None of those are exceptional enough
 * to be worth a crash, because nothing stored through here is the truth about
 * anything — it is a convenience laid over state that exists elsewhere.
 *
 * So the contract is: a read gives back `null` when it cannot answer, a write
 * reports whether it landed, and neither ever propagates. A caller that needs
 * to tell the student something honest ("resume is off in private browsing")
 * asks `available()` rather than inferring it from a failure.
 */

function store(): Storage | null {
  try {
    // The property access itself is the part that throws.
    const s = window.localStorage;
    // An extension or a polyfill may leave something Storage-shaped but inert.
    return typeof s?.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

export const safeStorage = {
  /** True when a value can actually be written AND read back. */
  available(): boolean {
    const s = store();
    if (!s) return false;
    const probe = '__emerge.probe';
    try {
      s.setItem(probe, '1');
      const ok = s.getItem(probe) === '1';
      s.removeItem(probe);
      return ok;
    } catch {
      return false;
    }
  },

  get(key: string): string | null {
    try {
      return store()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },

  /** Whether the value landed. A caller that does not care may ignore it. */
  set(key: string, value: string): boolean {
    try {
      const s = store();
      if (!s) return false;
      s.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },

  remove(key: string): void {
    try {
      store()?.removeItem(key);
    } catch {
      /* nothing to do: the value is already unreachable */
    }
  },

  /** Every key under a prefix. Order is the storage's own, so callers sort. */
  keys(prefix: string): string[] {
    try {
      const s = store();
      if (!s) return [];
      const out: string[] = [];
      for (let i = 0; i < s.length; i += 1) {
        const key = s.key(i);
        if (key !== null && key.startsWith(prefix)) out.push(key);
      }
      return out;
    } catch {
      return [];
    }
  },

  /** Parsed JSON, or `null` for absent, unreadable OR malformed. */
  json<T>(key: string): T | null {
    const raw = safeStorage.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Half-written by a tab that was killed mid-save, or hand-edited. It
      // cannot be repaired and it will never parse, so stop it coming back.
      safeStorage.remove(key);
      return null;
    }
  },
};
