import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';

import { assertPersonaInvariant } from '@/constants/personas';
import { config } from '@/config';
import { resolveBand } from '@/server/band';

import { Providers } from './providers';

/**
 * Bricolage Grotesque (titles and numbers), Inter (body) and JetBrains Mono
 * (labels), self-hosted by `next/font`.
 *
 * Deliberately NOT a <link> to fonts.googleapis.com. Two reasons, and the first
 * is not obvious: this app's CSP sets `style-src 'self'`, which blocks a
 * stylesheet from Google's domain outright — the font would silently fail to
 * load and every screen would fall back to system UI. `next/font` self-hosts
 * the files, so `'self'` is all that is needed.
 *
 * It also removes a render-blocking third-party request and the layout shift
 * that comes with it.
 */
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
  variable: '--font-display',
});

const sans = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  // `template` so a page sets only its own name and still reads
  // "Attendance · Emerge" in the tab and in a shared link.
  title: { default: config.site.name, template: `%s · ${config.site.name}` },
  description: config.site.description,
  applicationName: config.site.name,
  // The square mark, not the wordmark: the wordmark is 2.5:1 and is unreadable
  // at favicon size. `src/app/icon.svg` is picked up by Next automatically.
  icons: { icon: '/icon.svg' },
};

// Fail at startup rather than shipping a persona table that silently gives one
// role to the whole tenant. See constants/personas.ts.
assertPersonaInvariant();

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  // Resolved here, on the server, so the very first paint is already in the
  // right band. Doing it client-side would show every user the default band for
  // a moment and then visibly re-skin the whole app.
  const band = await resolveBand();

  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body style={{ margin: 0 }}>
        <Providers band={band}>{children}</Providers>
      </body>
    </html>
  );
}
