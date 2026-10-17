'use client';

import * as React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { Theme } from '@mui/material/styles';

import { FactStrip } from '@/components/ui/fact-strip';
import { Segmented } from '@/components/ui/segmented';
import { useToast } from '@/components/ui/toast';
import { useSaveNotice } from '@/hooks/mutation/use-notices';
import { useNoticeReach } from '@/hooks/query/use-notices';
import { formatMoment } from '@/lib/dates';
import { DELIVERIES, NOTICE_CATEGORIES, type Delivery, type Notice, type NoticeCategory, type NoticeScope, type NoticeTarget } from '@/types/notices';

import { AudiencePicker, DELIVERY_LABEL } from './audience-picker';
import { CATEGORY } from './notice-meta';
import { NoticePreview } from './notice-preview';

type When = 'now' | 'later';
const EXPIRIES = ['never', 'week', 'month', 'date'] as const;
type Expiry = (typeof EXPIRIES)[number];

const local = (iso: string): string => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString();

// Writing, editing or copying an announcement. `copy` starts a new one from an old one.
export function NoticeComposer({ notice, copy = false, scope, onClose }: { notice: Notice | null; copy?: boolean; scope?: NoticeScope; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const save = useSaveNotice();
  const phone = useMediaQuery((theme: Theme) => theme.breakpoints.down('md'));
  const editing = notice && !copy ? notice : null;
  const live = editing?.state === 'published' || editing?.state === 'expired';

  const [title, setTitle] = React.useState(notice ? `${notice.title}${copy ? ' (copy)' : ''}` : '');
  const [body, setBody] = React.useState(notice?.body ?? '');
  const [category, setCategory] = React.useState<NoticeCategory>(notice?.category ?? 'general');
  const [audience, setAudience] = React.useState<NoticeTarget[]>(notice?.audience ?? (scope ? [scope.rule] : []));
  const [delivery, setDelivery] = React.useState<Delivery>(notice?.delivery ?? 'students');
  const [acknowledge, setAcknowledge] = React.useState(notice?.acknowledge ?? false);
  const [pinned, setPinned] = React.useState(notice?.pinned ?? false);
  const [when, setWhen] = React.useState<When>(editing?.state === 'scheduled' ? 'later' : 'now');
  const [at, setAt] = React.useState(() => local(editing?.state === 'scheduled' && editing.published_at ? editing.published_at : inDays(1)));
  const [expiry, setExpiry] = React.useState<Expiry>(editing?.expires_at ? 'date' : 'never');
  const [until, setUntil] = React.useState(() => editing?.expires_at ? local(editing.expires_at).slice(0, 10) : local(inDays(14)).slice(0, 10));

  const targets = audience.map(({ type, id }) => ({ type, id }));
  const reach = useNoticeReach({ targets, delivery });
  const publishAt = when === 'later' && !live ? new Date(at).toISOString() : null;
  const start = publishAt ?? new Date().toISOString();
  const expiresAt =
    expiry === 'never' ? null : expiry === 'week' ? new Date(Date.parse(start) + 7 * 86_400_000).toISOString() : expiry === 'month' ? new Date(Date.parse(start) + 30 * 86_400_000).toISOString() : new Date(`${until}T23:59:00`).toISOString();
  const problem = !title.trim()
    ? 'Give it a title.'
    : !body.trim()
      ? 'Write the message.'
      : targets.length === 0 || reach.data?.people === 0
        ? 'Choose who receives it.'
        : publishAt && publishAt <= new Date().toISOString()
          ? 'A scheduled time has to be in the future.'
          : expiresAt && expiresAt <= start
            ? 'It would expire before it goes out.'
            : null;

  const submit = (draft: boolean): void =>
    save.mutate(
      { id: editing?.id ?? null, body: { title, body, category, targets, delivery, acknowledge, pinned, publish_at: publishAt, expires_at: expiresAt, draft } },
      {
        onSuccess: (saved) => {
          notify(draft ? 'Saved as a draft' : saved.state === 'scheduled' ? `Scheduled for ${formatMoment(saved.published_at)}` : editing && live ? 'Announcement updated' : `Sent to ${saved.reach.people.toLocaleString('en-IN')} people`);
          onClose();
        },
      },
    );

  const primary = live ? 'Save Changes' : when === 'later' ? 'Schedule' : 'Publish Now';

  return (
    <Dialog open onClose={save.isPending ? undefined : onClose} fullWidth maxWidth="lg" fullScreen={phone}>
      <DialogTitle>{editing ? 'Edit announcement' : 'New announcement'}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, alignItems: 'start' }}>
          <Stack spacing={2.5}>
            {save.error ? (
              <Alert severity="error" variant="outlined" role="alert">
                {save.error.message}
              </Alert>
            ) : null}
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} required autoFocus placeholder="What is it about, in a few words" />
            <TextField label="Message" value={body} onChange={(e) => setBody(e.target.value)} required multiline minRows={5} helperText={`${body.trim().split(/\s+/).filter(Boolean).length} words`} />

            <Stack spacing={1}>
              <Typography variant="subtitle2">Category</Typography>
              <ToggleButtonGroup exclusive size="small" value={category} onChange={(_, next: NoticeCategory | null) => next && setCategory(next)} aria-label="Category" sx={{ flexWrap: 'wrap' }}>
                {NOTICE_CATEGORIES.map((c) => (
                  <ToggleButton key={c} value={c} sx={{ gap: 0.75 }}>
                    {CATEGORY[c].icon}
                    {CATEGORY[c].label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>

            <Stack spacing={1}>
              <Typography variant="subtitle2">Who receives it</Typography>
              {scope ? (
                <Stack spacing={1}>
                  <Typography variant="body2" color="text.secondary">
                    Everyone taking {scope.label}; nobody outside it.
                  </Typography>
                  <Segmented ariaLabel="Who in each family receives it" value={delivery} onChange={setDelivery} options={DELIVERIES.map((d) => ({ value: d, label: DELIVERY_LABEL[d] }))} />
                </Stack>
              ) : (
                <AudiencePicker value={audience} onChange={setAudience} delivery={delivery} onDelivery={setDelivery} />
              )}
            </Stack>

            <Stack>
              <FormControlLabel control={<Switch checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} />} label="Ask readers to acknowledge it" />
              <FormControlLabel control={<Switch checked={pinned} onChange={(e) => setPinned(e.target.checked)} />} label="Pin to the top of the feed" />
            </Stack>

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2">When</Typography>
                {live ? (
                  <Typography variant="body2" color="text.secondary">
                    Went out {formatMoment(editing?.published_at)}
                  </Typography>
                ) : (
                  <>
                    <Segmented
                      ariaLabel="When it goes out"
                      value={when}
                      onChange={setWhen}
                      options={[
                        { value: 'now', label: 'Now' },
                        { value: 'later', label: 'Schedule' },
                      ]}
                    />
                    {when === 'later' ? <TextField size="small" type="datetime-local" label="Goes out" value={at} onChange={(e) => setAt(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /> : null}
                  </>
                )}
              </Stack>
              <Stack spacing={1}>
                <Typography variant="subtitle2">Expires</Typography>
                <TextField select size="small" value={expiry} onChange={(e) => setExpiry(EXPIRIES.find((x) => x === e.target.value) ?? 'never')} aria-label="Expires">
                  <MenuItem value="never">Never</MenuItem>
                  <MenuItem value="week">A week after it goes out</MenuItem>
                  <MenuItem value="month">A month after it goes out</MenuItem>
                  <MenuItem value="date">On a date</MenuItem>
                </TextField>
                {expiry === 'date' ? <TextField size="small" type="date" label="Last day" value={until} onChange={(e) => setUntil(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} /> : null}
              </Stack>
            </Box>
          </Stack>

          <Stack spacing={2} sx={{ position: { md: 'sticky' }, top: 0 }}>
            <Typography variant="eyebrow" color="text.secondary">
              How it reaches people
            </Typography>
            <FactStrip
              facts={[
                { label: 'Students', value: (reach.data?.students ?? 0).toLocaleString('en-IN'), note: delivery === 'parents' ? 'Not sent' : `${reach.data?.sections ?? 0} ${reach.data?.sections === 1 ? 'section' : 'sections'}` },
                { label: 'Parents', value: (reach.data?.parents ?? 0).toLocaleString('en-IN'), note: delivery === 'students' ? 'Not sent' : 'Families' },
                { label: 'Staff', value: (reach.data?.staff ?? 0).toLocaleString('en-IN'), note: 'Teachers, office' },
                { label: 'In all', value: (reach.data?.people ?? 0).toLocaleString('en-IN'), note: 'Each once' },
              ]}
            />
            <Typography variant="eyebrow" color="text.secondary">
              Preview
            </Typography>
            <Card variant="outlined">
              <NoticePreview title={title} body={body} category={category} pinned={pinned} acknowledge={acknowledge} when={publishAt ?? (live ? (editing?.published_at ?? null) : null)} />
            </Card>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions sx={{ gap: 1, flexWrap: 'wrap' }}>
        {problem ? (
          <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto', pl: 1, width: { xs: '100%', sm: 'auto' } }}>
            {problem}
          </Typography>
        ) : null}
        <Button variant="outlined" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        {live ? null : (
          <Button variant="outlined" onClick={() => submit(true)} disabled={save.isPending || !title.trim()}>
            Save Draft
          </Button>
        )}
        <Button variant="contained" onClick={() => submit(false)} disabled={Boolean(problem)} loading={save.isPending}>
          {primary}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
