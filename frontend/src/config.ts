export interface Config {
  site: { name: string; description: string; url: string };
  casUrl: string;
  /** Fixtures instead of the backend, and no sign-in. Set by `DEV_BYPASS=1`; see `next.config.mjs`. */
  devBypass: boolean;
  /** Which fixture user the bypass serves everything as. */
  devUser: string;
  /** The hosted demo: bypassed, except that textbook retrieval still calls the live engine. */
  publicDemo: boolean;
  devLiveServices: readonly string[];
  devLiveFallback: boolean;
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local.`,
    );
  }
  return value;
}

export const config: Config = {
  site: {
    name: 'Emerge',
    description: 'Emerge learning management',
    url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3005',
  },
  devBypass: process.env.NEXT_PUBLIC_DEV_BYPASS === 'true',
  devUser: process.env.NEXT_PUBLIC_DEV_BYPASS_USER || 'admin',
  publicDemo: process.env.NEXT_PUBLIC_DEMO === 'true',
  devLiveServices: (process.env.NEXT_PUBLIC_DEV_LIVE_SERVICES ?? '').split(',').filter(Boolean),
  devLiveFallback: process.env.NEXT_PUBLIC_DEV_LIVE_FALLBACK === 'true',
  // Server-only. Read lazily so a client bundle importing `paths` does not
  // drag a server env var into the browser.
  //
  // Trailing slashes are stripped, as `serviceBaseUrl` does: the CAS client
  // joins with `${casUrl}/`, so `https://host/` became `https://host//v1/...`,
  // which a deployed CAS answers with a 404 that reads like a missing route.
  get casUrl(): string {
    return required('CAS_BASE_URL', process.env.CAS_BASE_URL?.trim()).replace(/\/+$/, '');
  },
};
