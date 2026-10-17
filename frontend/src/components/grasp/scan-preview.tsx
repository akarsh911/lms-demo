'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { FileText } from 'lucide-react';

const sweep = keyframes`
  0% { top: -12%; }
  100% { top: 100%; }
`;

const glow = keyframes`
  0%, 100% { opacity: 0.03; }
  50% { opacity: 0.1; }
`;

// A page being read: the uploaded image (or a page glyph for a PDF) with a scan line sweeping it.
export function ScanPreview({ files, label, active }: { files: readonly File[]; label: string; active: boolean }): React.ReactElement {
  const urls = React.useMemo(() => files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : '')), [files]);

  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
      <Stack direction="row" spacing={1.5} sx={{ justifyContent: 'center', flexWrap: 'wrap', rowGap: 1.5 }}>
        {files.map((f, i) => (
          <Box
            key={`${f.name}-${i}`}
            sx={(t) => ({
              position: 'relative',
              width: files.length > 1 ? 150 : 220,
              aspectRatio: '3 / 4',
              borderRadius: `${t.band.radius.sm}px`,
              overflow: 'hidden',
              border: `1px solid ${t.brand.line2}`,
              bgcolor: t.brand.surface,
              boxShadow: t.shadows[4],
              transform: files.length > 1 ? `rotate(${(i - (files.length - 1) / 2) * 3}deg)` : 'none',
            })}
          >
            {urls[i] ? (
              <Box component="img" src={urls[i]} alt={f.name} sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <Stack sx={{ height: '100%', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', p: 2, textAlign: 'center' }} spacing={1}>
                <FileText size={40} />
                <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                  {f.name}
                </Typography>
              </Stack>
            )}
            {active ? (
              <>
                <Box sx={(t) => ({ position: 'absolute', inset: 0, bgcolor: t.palette.primary.main, animation: `${glow} 1.6s ease-in-out infinite` })} />
                <Box
                  sx={(t) => ({
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    height: '12%',
                    background: `linear-gradient(180deg, transparent, ${t.palette.primary.main})`,
                    borderBottom: `2px solid ${t.palette.primary.main}`,
                    opacity: 0.45,
                    animation: `${sweep} 1.3s linear infinite`,
                  })}
                />
              </>
            ) : null}
          </Box>
        ))}
      </Stack>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Stack>
  );
}
