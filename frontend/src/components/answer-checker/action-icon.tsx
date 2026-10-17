'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

export function ActionIcon({
  label,
  onClick,
  disabled,
  href,
  compact = false,
  children,
}: {
  label: string;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
  href?: string;
  compact?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const link = href ? { href, target: '_blank', rel: 'noopener' } : { onClick };
  if (!compact) {
    return (
      <Button size="small" variant="text" startIcon={children} disabled={disabled} sx={{ whiteSpace: 'nowrap' }} {...link}>
        {label}
      </Button>
    );
  }
  return (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" aria-label={label} disabled={disabled} {...link}>
          {children}
        </IconButton>
      </span>
    </Tooltip>
  );
}
