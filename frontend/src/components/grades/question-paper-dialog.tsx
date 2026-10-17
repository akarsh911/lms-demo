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

// The paper as a printable page; the download is the same page saved, since no PDF is kept in the fixtures.
function paperHtml(paper: QuestionPaper): string {
  const sections = paper.sections.map((s, i) => `<h3>${s.title}</h3><p>${s.count} questions × ${s.marks_each} marks = ${s.count * s.marks_each}</p>${Array.from({ length: s.count }, (_, q) => `<p>Q${i + 1}.${q + 1} ________________________________________ [${s.marks_each}]</p>`).join('')}`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${paper.exam} · ${paper.subject}</title><style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;color:#17181C}h1,h2{text-align:center;margin:0}p{margin:6px 0}</style></head><body><h2>Delhi Public School, Nagpur</h2><h1>${paper.exam}</h1><p style="text-align:center">${paper.class_name} · ${paper.subject} · Maximum marks ${paper.max} · ${paper.duration_minutes} minutes</p><hr/><h3>General instructions</h3>${paper.instructions.map((line) => `<p>• ${line}</p>`).join('')}${sections}</body></html>`;
}

export function QuestionPaperDialog({ examSubjectId, onClose }: { examSubjectId: string; onClose: () => void }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useQuestionPaper(examSubjectId);

  const download = (): void => {
    if (!data) return;
    const url = URL.createObjectURL(new Blob([paperHtml(data)], { type: 'text/html' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: data.file_name.replace(/\.pdf$/, '.html') });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm">
      <DialogTitle>{data ? `${data.subject} · ${data.exam}` : 'Question paper'}</DialogTitle>
      <DialogContent dividers>
        {isPending ? <WidgetLoading rows={5} /> : null}
        {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}
        {data ? (
          <Box sx={(theme) => ({ p: 3, border: `1px solid ${theme.brand.line2}`, borderRadius: `${theme.band.radius.md}px`, backgroundColor: '#FFFDFC', fontFamily: 'Georgia, serif' })}>
            <Typography sx={{ textAlign: 'center', fontFamily: 'inherit', fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }} color="text.secondary">
              Delhi Public School, Nagpur
            </Typography>
            <Typography sx={{ textAlign: 'center', fontFamily: 'inherit', fontSize: 22, fontWeight: 700, mt: 0.5 }}>{data.exam}</Typography>
            <Typography sx={{ textAlign: 'center', fontFamily: 'inherit', mt: 0.5 }} color="text.secondary">
              {data.class_name} · {data.subject} · Maximum marks {data.max} · {data.duration_minutes} minutes{data.date ? ` · ${formatDay(data.date)}` : ''}
            </Typography>
            <Box component="hr" sx={{ border: 0, borderTop: '1px solid', borderColor: 'divider', my: 2 }} />
            <Typography sx={{ fontFamily: 'inherit', fontWeight: 700 }}>General instructions</Typography>
            <Stack component="ol" spacing={0.25} sx={{ pl: 2.5, my: 1, fontFamily: 'inherit' }}>
              {data.instructions.map((line) => (
                <Typography key={line} component="li" sx={{ fontFamily: 'inherit' }}>
                  {line}
                </Typography>
              ))}
            </Stack>
            {data.sections.map((section) => (
              <Stack key={section.title} direction="row" sx={{ justifyContent: 'space-between', mt: 1.5, fontFamily: 'inherit' }}>
                <Typography sx={{ fontFamily: 'inherit', fontWeight: 700 }}>{section.title}</Typography>
                <Typography sx={{ fontFamily: 'inherit' }} color="text.secondary">
                  {section.count} × {section.marks_each} = {section.count * section.marks_each}
                </Typography>
              </Stack>
            ))}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
        <Button variant="contained" startIcon={<Download size={16} />} disabled={!data} onClick={download}>
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
}
