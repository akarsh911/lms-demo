import * as React from 'react';

import { requireSession } from '@/server/dal';

import { DesignReference } from './design-reference';

/**
 * The living design reference.
 *
 * Every primitive, in whichever band is selected. This is what a developer
 * opens before building a screen, and what a designer opens to check that a
 * band still reads correctly after a token change.
 *
 * It is NOT feature-gated — it renders no user data, only components with
 * hardcoded sample values. It does require a session, so it is not a public
 * page on a deployed instance.
 */
export default async function DesignPage(): Promise<React.ReactElement> {
  await requireSession();
  return <DesignReference />;
}
