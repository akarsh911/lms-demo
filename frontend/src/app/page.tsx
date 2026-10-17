import { redirect } from 'next/navigation';

import { paths } from '@/paths';
import { defaultPersonaSlug } from '@/server/dal';

import { NoPersona } from './no-persona';

/**
 * The landing route resolves the user's default persona and redirects into it.
 *
 * The app has no personaless surface: every real screen lives under
 * `/p/<persona>/…` so that the URL always says which hat is being worn. That is
 * what makes back/forward, refresh, deep links and a second tab all behave.
 */
export default async function RootPage(): Promise<React.ReactElement> {
  const slug = await defaultPersonaSlug();
  if (!slug) {
    // Signed in, but no group confers a designation. Not an error — say so.
    return <NoPersona />;
  }
  redirect(paths.persona(slug));
}
