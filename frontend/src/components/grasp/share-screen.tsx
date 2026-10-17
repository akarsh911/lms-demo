'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { keyframes } from '@mui/material/styles';
import { Copy, X } from 'lucide-react';
import QRCode from 'qrcode';

import { EmergeLogo } from '@/components/brand/emerge-logo';
import { useToast } from '@/components/ui/toast';
import { useGraspHost } from '@/hooks/query/use-grasp';
import { encodeCarry } from '@/lib/grasp/carry';
import { paths } from '@/paths';
import type { GraspCheck } from '@/types/grasp';

const pop = keyframes`
  0% { opacity: 0; transform: translateY(14px) scale(0.85); }
  60% { opacity: 1; transform: translateY(-3px) scale(1.04); }
  100% { opacity: 1; transform: none; }
`;

const noSubscription = (): (() => void) => () => undefined;

export const spaced = (code: string): string => `${code.slice(0, 3)} ${code.slice(3)}`;

// The address a phone can open: the LAN one when the teacher is looking at localhost.
export function useJoinUrl(check: GraspCheck): { url: string; host: string } {
  const host = useGraspHost();
  const origin = React.useSyncExternalStore(noSubscription, () => window.location.origin, () => '');
  const local = /localhost|127\.0\.0\.1/.test(origin);
  const base = local ? (host.data?.origins[0] ?? origin) : origin;
  return { url: `${base}${paths.graspJoin(check.code)}?c=${encodeCarry(check)}`, host: base.replace(/^https?:\/\//, '') };
}

export function QrImage({ value, size }: { value: string; size: number }): React.ReactElement {
  const [src, setSrc] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    void QRCode.toDataURL(value, { margin: 1, errorCorrectionLevel: 'L', width: size * 2, color: { dark: '#17181C', light: '#FFFFFF' } }).then((d) => live && setSrc(d));
    return () => {
      live = false;
    };
  }, [value, size]);
  return <Box sx={{ width: size, height: size, bgcolor: 'common.white', borderRadius: 2, p: 1, flex: 'none' }}>{src ? <Box component="img" src={src} alt="QR code to join" sx={{ width: '100%', height: '100%', display: 'block' }} /> : null}</Box>;
}

export function ShareScreen({ check, onClose }: { check: GraspCheck; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const { url, host } = useJoinUrl(check);
  const recent = [...check.attempts].sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
  const done = check.attempts.filter((a) => a.stage === 'done').length;

  return (
    <Dialog fullScreen open onClose={onClose} slotProps={{ paper: { sx: (t) => ({ bgcolor: t.brand.canvas }) } }}>
      <Stack sx={{ height: '100%', p: { xs: 2, md: 5 } }} spacing={3}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <EmergeLogo height={30} />
            <Typography variant="eyebrow" color="text.secondary">
              GRASP · {check.subject} · {check.section}
            </Typography>
          </Stack>
          <IconButton aria-label="Close" onClick={onClose}>
            <X />
          </IconButton>
        </Stack>

        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.15fr 0.85fr' }, gap: { xs: 3, lg: 6 }, alignItems: 'center', minHeight: 0 }}>
          <Stack spacing={3} sx={{ alignItems: { xs: 'center', lg: 'flex-start' }, textAlign: { xs: 'center', lg: 'left' } }}>
            <Typography variant="h2" component="h2" sx={{ maxWidth: '22ch' }}>
              {check.title}
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} sx={{ alignItems: 'center' }}>
              <QrImage value={url} size={340} />
              <Stack spacing={1.5}>
                <Typography variant="body1" color="text.secondary">
                  Go to <Box component="b" sx={{ color: 'text.primary' }}>{host}/g</Box> and enter
                </Typography>
                <Typography sx={(t) => ({ fontFamily: t.typography.display.fontFamily, fontWeight: 800, fontSize: { xs: 64, md: 104 }, lineHeight: 1, letterSpacing: '0.04em', color: t.brand.ink })}>{spaced(check.code)}</Typography>
                <Button variant="outlined" size="small" startIcon={<Copy size={14} />} sx={{ alignSelf: { xs: 'center', lg: 'flex-start' } }} onClick={() => void navigator.clipboard?.writeText(url).then(() => notify('Link copied'))}>
                  Copy link
                </Button>
              </Stack>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '52ch' }}>
              No sign-in. Students answer, then read their own work back in {check.checkCount} questions of {check.seconds} seconds each.
            </Typography>
          </Stack>

          <Box sx={(t) => ({ bgcolor: t.brand.surface, border: `1px solid ${t.brand.line}`, borderRadius: `${t.band.radius.lg}px`, p: 3, height: { lg: '100%' }, maxHeight: { lg: 560 }, display: 'flex', flexDirection: 'column', minHeight: 0 })}>
            <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h4" component="h3">
                {check.attempts.length} joined
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {done} handed in
              </Typography>
            </Stack>
            {recent.length === 0 ? (
              <Typography color="text.secondary" sx={{ m: 'auto' }}>
                Waiting for the first student…
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignContent: 'flex-start', overflow: 'auto' }}>
                {recent.map((a) => (
                  <Box
                    key={a.id}
                    sx={(t) => ({
                      animation: `${pop} 420ms cubic-bezier(.34,1.4,.64,1) both`,
                      px: 1.75,
                      py: 0.75,
                      borderRadius: 99,
                      fontWeight: 600,
                      fontSize: 15,
                      bgcolor: a.stage === 'done' ? t.tints.green : a.stage === 'checking' ? t.tints.violet : t.tints.grey,
                      color: a.stage === 'done' ? t.onTint.green : a.stage === 'checking' ? t.onTint.violet : t.onTint.grey,
                    })}
                  >
                    {a.name}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </Stack>
    </Dialog>
  );
}
