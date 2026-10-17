import * as React from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import NextLink from 'next/link';
import { ArrowRight, Puzzle } from 'lucide-react';

// Says plainly that an area's own workspace is another module's, and offers the page that exists today if there is one.
export function ModuleNote({ module, does, href, linkLabel }: { module: string; does: string; href?: string | null; linkLabel?: string }): React.ReactElement {
  return (
    <Stack
      direction="row"
      sx={(theme) => ({
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1.5,
        backgroundColor: theme.brand.subtle,
        border: `1px solid ${theme.brand.line}`,
        borderRadius: `${theme.band.radius.md}px`,
      })}
    >
      <Puzzle size={18} aria-hidden />
      <Typography variant="body2" sx={{ flex: '1 1 260px' }}>
        {does} arrives with the {module} module. This tab shows where the year stands in the meantime.
      </Typography>
      {href ? (
        <Button component={NextLink} href={href} size="small" variant="outlined" endIcon={<ArrowRight size={14} />}>
          {linkLabel}
        </Button>
      ) : null}
    </Stack>
  );
}
