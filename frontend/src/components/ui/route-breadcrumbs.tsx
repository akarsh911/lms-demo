'use client';

import * as React from 'react';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';

/**
 * The ancestor trail above a nested page's title.
 *
 * A client component, and it has to be. MUI's `Link` takes the router link as a
 * `component` PROP, and a function cannot cross the server/client boundary:
 * rendering `<Link component={NextLink}>` from a Server Component throws
 * "Functions cannot be passed directly to Client Components", which is exactly
 * what the first version of the nested section page did. Doing the composition
 * on this side keeps the page a Server Component and hands it plain data.
 *
 * A crumb with no `href` renders as text. That is not decoration: an ancestor
 * the user cannot reach must not be offered as a door, and with orphan hoisting
 * in the sidebar a nested page can genuinely outlive its parent's grant.
 */
export interface Crumb {
  key: string;
  title: string;
  href: string | null;
}

export function RouteBreadcrumbs({
  crumbs,
  current,
}: {
  crumbs: readonly Crumb[];
  current: string;
}): React.ReactElement | null {
  if (crumbs.length === 0) return null;

  return (
    <Breadcrumbs sx={{ mb: 0.5 }}>
      {crumbs.map((crumb) =>
        crumb.href ? (
          <Link
            key={crumb.key}
            component={NextLink}
            href={crumb.href}
            variant="body2"
            color="text.secondary"
            underline="hover"
          >
            {crumb.title}
          </Link>
        ) : (
          <Typography key={crumb.key} variant="body2" color="text.secondary">
            {crumb.title}
          </Typography>
        ),
      )}
      <Typography variant="body2" color="text.primary" aria-current="page">
        {current}
      </Typography>
    </Breadcrumbs>
  );
}
