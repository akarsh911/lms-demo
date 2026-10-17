'use client';

import * as React from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { FileText, Link2, Send, Upload } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toast';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useClassRoles } from '@/hooks/query/use-class-roles';
import { useMaterialShares, useRemoveShare, useShareMaterial } from '@/hooks/query/use-material-shares';
import { formatMoment } from '@/lib/dates';
import type { ClassPupil } from '@/types/class-roles';

function ShareDialog({ offeringId, sectionId, label, onClose }: { offeringId: string; sectionId: string; label: string; onClose: () => void }): React.ReactElement {
  const notify = useToast();
  const share = useShareMaterial(offeringId);
  const roster = useClassRoles(sectionId);
  const [title, setTitle] = React.useState('');
  const [note, setNote] = React.useState('');
  const [link, setLink] = React.useState('');
  const [files, setFiles] = React.useState<string[]>([]);
  const [pupils, setPupils] = React.useState<ClassPupil[]>([]);

  return (
    <FormDialog
      open
      title={`Share with pupils of ${label}`}
      description="Only the pupils you choose see it, on this subject's page."
      submitLabel={pupils.length > 0 ? `Share with ${pupils.length} ${pupils.length === 1 ? 'Pupil' : 'Pupils'}` : 'Share'}
      pending={share.isPending}
      error={share.error}
      canSubmit={title.trim().length >= 3 && pupils.length > 0 && Boolean(note.trim() || link.trim() || files.length > 0)}
      onClose={onClose}
      onSubmit={() => share.mutate({ offering_id: offeringId, title, note, link, files, student_ids: pupils.map((p) => p.student_id) }, { onSuccess: () => (notify(`Shared with ${pupils.length} ${pupils.length === 1 ? 'pupil' : 'pupils'}`), onClose()) })}
    >
      <Autocomplete
        multiple
        options={roster.data?.pupils ?? []}
        value={pupils}
        onChange={(_, value) => setPupils(value)}
        loading={roster.isPending}
        getOptionLabel={(p) => `${p.roll ? `${p.roll} · ` : ''}${p.name}`}
        isOptionEqualToValue={(a, b) => a.student_id === b.student_id}
        renderInput={(params) => <TextField {...params} label="Pupils" placeholder="Name or roll number" />}
      />
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Extra practice: chapter 4" required />
      <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
      <TextField label="Link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <Button component="label" variant="outlined" size="small" startIcon={<Upload size={14} />}>
          Attach Files
          <input hidden type="file" multiple onChange={(e) => setFiles((prev) => [...new Set([...prev, ...[...(e.target.files ?? [])].map((f) => f.name)])])} />
        </Button>
        {files.map((f) => (
          <EmergeChip key={f} label={f} tone="grey" />
        ))}
      </Stack>
    </FormDialog>
  );
}

// Material a teacher hands to chosen pupils of a class; each pupil sees only what was handed to them.
export function SharedMaterial({ offeringId, sectionId, label, teaches }: { offeringId: string; sectionId: string; label: string; teaches: boolean }): React.ReactElement | null {
  const notify = useToast();
  const { data, isPending, isError, error, refetch } = useMaterialShares(offeringId);
  const remove = useRemoveShare(offeringId);
  const [sharing, setSharing] = React.useState(false);
  if (isPending) return <Card sx={{ p: 2.5 }}><WidgetLoading rows={2} /></Card>;
  if (isError) return <Card sx={{ p: 2.5 }}><WidgetError error={error} onRetry={() => void refetch()} /></Card>;
  if (!teaches && data.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title={teaches ? 'Shared with chosen pupils' : 'Shared with you'}
        subheader={teaches ? 'Worksheets, links and notes for some of the class, not all' : 'From your teacher, just for you and a few classmates'}
        action={
          teaches ? (
            <Button variant="contained" startIcon={<Send size={15} />} onClick={() => setSharing(true)}>
              Share with Pupils
            </Button>
          ) : null
        }
        sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', m: 0 } }}
      />
      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 3, pb: 2.5 }}>
          Nothing shared with particular pupils yet.
        </Typography>
      ) : (
        <List disablePadding>
          {data.map((s) => (
            <ListItem key={s.id} divider sx={{ px: 3, py: 1.5, gap: 2, alignItems: 'flex-start' }}>
              <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1">{s.title}</Typography>
                {s.note ? <Typography variant="body2">{s.note}</Typography> : null}
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, pt: 0.25 }}>
                  {s.files.map((f) => (
                    <EmergeChip key={f} label={f} tone="blue" icon={<FileText size={12} />} />
                  ))}
                  {s.link ? <EmergeChip label={s.link} tone="blue" icon={<Link2 size={12} />} /> : null}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {s.teacher} · {formatMoment(s.shared_at)}
                  {teaches ? ` · ${s.pupils.map((p) => p.name).join(', ')}` : ''}
                </Typography>
              </Stack>
              {teaches ? (
                <Button size="small" color="error" onClick={() => remove.mutate(s.id, { onSuccess: () => notify('Taken back') })}>
                  Take Back
                </Button>
              ) : null}
            </ListItem>
          ))}
        </List>
      )}
      {sharing ? <ShareDialog offeringId={offeringId} sectionId={sectionId} label={label} onClose={() => setSharing(false)} /> : null}
    </Card>
  );
}
