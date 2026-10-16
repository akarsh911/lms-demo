const isDev = process.env.NODE_ENV !== 'production';

/**
 * Script policy.
 *
 * `'unsafe-eval'` is added in DEVELOPMENT ONLY. React uses `eval()` in dev for
 * debugging features (reconstructing call stacks across environments) and says
 * so in the error it throws when blocked; it never uses `eval()` in production.
 * Shipping the dev allowance to production would weaken the policy for a
 * capability production does not use.
 */
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const contentSecurityPolicy = (frameAncestors, { styleHosts = [], fontHosts = [] } = {}) =>
  [
    "default-src 'self'",
    scriptSrc,
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    ["style-src 'self' 'unsafe-inline'", ...styleHosts].join(' '),
    ["font-src 'self' data:", ...fontHosts].join(' '),
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ');

const assetContentSource = '/api/svc/core/library/assets/:assetId/content';
const paperFileSources = ['/demo/papers/:path*', '/api/svc/papersetter/api/v1/papers/:paperId/files/:name'];
const playgroundSource = '/playground/:path*';
const playgroundFonts = { styleHosts: ['https://fonts.googleapis.com'], fontHosts: ['https://fonts.gstatic.com'] };

// The services run in the browser, so the server's one switch is handed to the bundle here, at build time.
// `DEV_BYPASS=1` means fixtures in any build; `PUBLIC_DEMO=1` is the labs demo, which is the bypass plus live retrieval.
const publicDemo = process.env.PUBLIC_DEMO === '1';
const devBypass = process.env.DEV_BYPASS === '1' || publicDemo;
const namedUser = (process.env.DEV_BYPASS_USER ?? '').trim().toLowerCase();
const devUser = namedUser === 'principal' ? 'admin' : namedUser || (publicDemo ? 'dev' : 'admin');
const namedLiveServices = (process.env.DEV_LIVE_SERVICES ?? '')
  .split(',')
  .map((name) => name.trim().toLowerCase())
  .filter(Boolean);
const devLiveServices = devBypass
  ? [...new Set([...namedLiveServices, 'debate', ...(publicDemo ? ['retrieval'] : [])])]
  : [];
const devLiveFallback = devBypass && process.env.DEV_LIVE_FALLBACK !== '0';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_DEV_BYPASS: String(devBypass),
    NEXT_PUBLIC_DEV_BYPASS_USER: devUser,
    NEXT_PUBLIC_DEMO: String(publicDemo),
    NEXT_PUBLIC_DEV_LIVE_SERVICES: devLiveServices.join(','),
    NEXT_PUBLIC_DEV_LIVE_FALLBACK: String(devLiveFallback),
  },
  output: 'standalone',
  // Turbopack is the default builder in Next 16. An empty object is enough to
  // declare intent; adding a `webpack` key here without this fails the build.
  turbopack: {},
  // `typedRoutes` is deliberately OFF. It builds a closed union of literal
  // route strings, which cannot express paths derived from a data registry —
  // and a registry-driven router is the whole point of this app. The
  // registry↔feature-key integrity it would otherwise give us is enforced by
  // `scripts/check-routes.mjs` at prebuild instead, which also checks things
  // typedRoutes could never see (unknown CAS keys, persona presets, the
  // structural-group invariant).
  typedRoutes: false,

  // Do not advertise the framework and version to a scanner.
  poweredByHeader: false,

  experimental: {
    proxyClientMaxBodySize: '200mb',
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            /**
             * `script-src` MUST be stated explicitly, even to be permissive.
             *
             * This bit is a trap and it cost a broken app once already. CSP
             * falls `script-src` back to `default-src` when it is omitted — so
             * `default-src 'self'` with no `script-src` does not "leave scripts
             * alone", it BLOCKS every inline script. Next.js emits an inline
             * bootstrap (`self.__next_r`) plus the streamed hydration payload,
             * so blocking inline scripts produced `InvariantError: Expected a
             * request ID ... via self.__next_r` and React error #412 (the root
             * gave up on hydration and re-rendered entirely on the client).
             * The page still looked fine, which is what made it easy to miss.
             *
             * `'unsafe-inline'` is genuinely weak, and it is exactly the
             * posture the app had before any CSP existed — nothing was made
             * worse. The other directives below are the ones doing real work
             * right now: no framing, no form posts off-origin, no plugins, no
             * base-tag rewriting, no fetches to third parties.
             *
             * Tightening this means threading a nonce through Emotion and the
             * RSC stream. Worth doing when a screen first renders user-authored
             * content; not before.
             */
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy("'none'"),
          },
        ],
      },
      {
        source: assetContentSource,
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy("'self'"),
          },
        ],
      },
      ...paperFileSources.map((source) => ({
        source,
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy("'self'"),
          },
        ],
      })),
      {
        source: playgroundSource,
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy("'self'", playgroundFonts),
          },
        ],
      },
      {
        source: '/p/:persona/learning/debate/:path*',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }],
      },
      {
        source: '/p/:persona/learning/jerry',
        headers: [{ key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' }],
      },
    ];
  },
};

export default nextConfig;
