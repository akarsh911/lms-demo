'use client';

import * as React from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Link2, Paperclip } from 'lucide-react';

import type { HomeworkAttachment } from '@/types/homework';

const kindOf = (name: string): HomeworkAttachment['kind'] => (/\.pdf$/i.test(name) ? 'pdf' : /\.(png|jpe?g|gif|webp)$/i.test(name) ? 'image' : 'doc');

// Files and links handed out with an assignment. Only their names are kept until the library can store files.
export function AttachmentsField({ value, onChange }: { value: readonly HomeworkAttachment[]; onChange: (next: HomeworkAttachment[]) => void }): React.ReactElement {
  const [link, setLink] = React.useState('');
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Attachments</Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
        {value.map((f) => (
          <Chip key={f.name} icon={f.kind === 'link' ? <Link2 size={14} /> : <Paperclip size={14} />} label={f.name} onDelete={() => onChange(value.filter((x) => x.name !== f.name))} />
        ))}
        <Button size="small" variant="outlined" startIcon={<Paperclip size={14} />} onClick={() => input.current?.click()}>
          Attach File
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])].map((f) => ({ name: f.name, kind: kindOf(f.name) }));
            onChange([...value, ...picked.filter((p) => !value.some((f) => f.name === p.name))]);
            e.target.value = '';
          }}
        />
      </Stack>
      <Stack direction="row" spacing={1}>
        <TextField size="small" fullWidth placeholder="Paste a link to a video or a page" value={link} onChange={(e) => setLink(e.target.value)} />
        <Button
          size="small"
          disabled={!/^https?:\/\/\S+$/.test(link.trim())}
          onClick={() => {
            onChange([...value, { name: link.trim(), kind: 'link' }]);
            setLink('');
          }}
        >
          Add Link
        </Button>
      </Stack>
    </Stack>
  );
}
