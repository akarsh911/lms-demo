'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Download } from 'lucide-react';

import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useQuestionPaper } from '@/hooks/query/use-grades';
import { formatDay } from '@/lib/dates';
import type { QuestionPaper } from '@/types/grades';

function keyHtml(paper: QuestionPaper): string {
  const key = paper.answer_key;
  if (!key) return '';
  const objective = key.objective.map((q) => `<td style="padding:4px 10px;border:1px solid #D6D0CC">${q.no}: <b>${q.answer}</b></td>`).join('');
  const scheme = key.scheme.map((s) => `<p><b>${s.section}</b><br/>${s.note}</p>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Answer key · ${paper.subject}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;color:#17181C}</style></head><body><h2>${paper.exam} · ${paper.class_name} · ${paper.subject}</h2><p>Answer key, uploaded by ${key.uploaded_by} on ${key.uploaded_at}</p><table><tr>${objective}</tr></table>${scheme}</body></html>`;
}

// The key the setter uploaded: objective answers in a grid, then one line of scheme per section.
export function AnswerKeyDialog({ examSubjectId, onClose }: { examSubjectId: string; onClose: () => void }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useQuestionPaper(examSubjectId);
  const key = data?.answer_key ?? null;

  const download = (): void => {
    if (!data || !key) return;
    const url = URL.createObjectURL(new Blob([keyHtml(data)], { type: 'text/html' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: key.file_name.replace(/\.pdf$/, '.html') });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm">
      <DialogTitle>{data ? `Answer key · ${data.subject} · ${data.class_name}` : 'Answer key'}</DialogTitle>
      <DialogContent dividers>
        {isPending ? <WidgetLoading rows={4} /> : null}
        {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}
        {data && !key ? (
          <Typography variant="body2" color="text.secondary">
            No answer key has been uploaded for this paper.
          </Typography>
        ) : null}
        {data && key ? (
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Uploaded by {key.uploaded_by} on {formatDay(key.uploaded_at)} · {data.exam}
            </Typography>
            {key.objective.length > 0 ? (
              <Box>
                <Typography variant="eyebrow" component="p" color="text.secondary" sx={{ mb: 1 }}>
                  Objective answers
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 0.75 }}>
                  {key.objective.map((q) => (
                    <Box key={q.no} sx={(theme) => ({ px: 1, py: 0.5, borderRadius: 1.5, border: `1px solid ${theme.brand.line}`, backgroundColor: theme.brand.surface, display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums' })}>
                      <Typography component="span" variant="body2" color="text.secondary">
                        Q{q.no}
                      </Typography>
                      <Typography component="span" variant="subtitle2">
                        {q.answer}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ) : null}
            <Box>
              <Typography variant="eyebrow" component="p" color="text.secondary" sx={{ mb: 1 }}>
                Marking scheme
              </Typography>
              <Stack spacing={1}>
                {key.scheme.map((s) => (
                  <Box key={s.section}>
                    <Typography variant="subtitle2" component="p">
                      {s.section}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {s.note}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
        <Button variant="contained" startIcon={<Download size={16} />} disabled={!key} onClick={download}>
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}
