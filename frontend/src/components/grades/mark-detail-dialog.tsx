'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { Download, FileText } from 'lucide-react';

import { EmergeChip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMark } from '@/hooks/query/use-grades';
import { formatDay } from '@/lib/dates';
import type { MarkDetail } from '@/types/grades';

import { MARK_STATE, percent } from './mark-states';
import { QuestionPaperDialog } from './question-paper-dialog';

function sheetHtml(detail: MarkDetail): string {
  const rows = detail.answer_sheet?.questions.map((q) => `<tr><td>Q${q.no}</td><td>${q.scored} / ${q.max}</td></tr>`).join('') ?? '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${detail.student} · ${detail.subject}</title><style>body{font-family:Georgia,serif;max-width:640px;margin:40px auto;color:#17181C}table{border-collapse:collapse;width:100%}td{padding:4px 8px;border-bottom:1px solid #D6D0CC}</style></head><body><h2>${detail.exam} · ${detail.subject}</h2><p>${detail.student} · ${detail.marks ?? '—'} / ${detail.max}</p><table>${rows}</table><p>Checked by ${detail.marked_by ?? '—'}</p>${detail.remarks ? `<p><em>${detail.remarks}</em></p>` : ''}</body></html>`;
}

// One mark opened: the score, the remark, the checked sheet question by question, and the paper it answered.
export function MarkDetailDialog({ markId, onClose }: { markId: string; onClose: () => void }): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useMark(markId);
  const [paper, setPaper] = React.useState(false);

  const download = (): void => {
    if (!data?.answer_sheet) return;
    const url = URL.createObjectURL(new Blob([sheetHtml(data)], { type: 'text/html' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: data.answer_sheet.file_name.replace(/\.pdf$/, '.html') });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md">
      <DialogTitle>{data ? `${data.subject} · ${data.exam}` : 'Mark'}</DialogTitle>
      <DialogContent dividers>
        {isPending ? <WidgetLoading rows={5} /> : null}
        {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}
        {data ? (
          <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 7fr)' } }}>
            <Stack spacing={2.5}>
              <Stack direction="row" sx={{ alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
                <Typography variant="display" component="p" sx={{ fontSize: 48, lineHeight: 1 }}>
                  {data.marks ?? '—'}
                  <Typography component="span" variant="h4" color="text.secondary" sx={{ ml: 0.75 }}>
                    / {data.max}
                  </Typography>
                </Typography>
                <EmergeChip label={data.marks === null ? MARK_STATE[data.status].label : percent(data.marks, data.max)} tone={MARK_STATE[data.status].tone} />
              </Stack>
              <Box component="dl" sx={{ display: 'grid', gap: 2, m: 0 }}>
                <Field label="Student">{data.student}</Field>
                <Field label="Checked by" quiet={!data.marked_by}>
                  {data.marked_by ?? 'Not recorded'}
                  {data.marked_at ? ` · ${formatDay(data.marked_at)}` : ''}
                </Field>
                <Field label="Remarks" quiet={!data.remarks}>
                  {data.remarks ?? 'No remarks were written.'}
                </Field>
              </Box>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                <Button variant="outlined" size="small" startIcon={<FileText size={14} />} onClick={() => setPaper(true)}>
                  Question paper
                </Button>
                {data.answer_sheet ? (
                  <Button variant="outlined" size="small" startIcon={<Download size={14} />} onClick={download}>
                    Download sheet
                  </Button>
                ) : null}
              </Stack>
            </Stack>

            <Box>
              <Typography variant="eyebrow" component="p" color="text.secondary" sx={{ mb: 1 }}>
                Checked answer sheet
              </Typography>
              {data.answer_sheet ? (
                <TableContainer sx={{ maxHeight: 360 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Question</TableCell>
                        <TableCell align="right">Scored</TableCell>
                        <TableCell align="right">Of</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.answer_sheet.questions.map((q) => (
                        <TableRow key={q.no} hover>
                          <TableCell>Q{q.no}</TableCell>
                          <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: q.scored === 0 ? 'error.main' : q.scored === q.max ? 'success.main' : 'text.primary', fontWeight: 600 }}>
                            {q.scored}
                          </TableCell>
                          <TableCell align="right" sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                            {q.max}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Stack direction="row" spacing={1.5} sx={(theme) => ({ alignItems: 'center', p: 2, borderRadius: `${theme.band.radius.md}px`, border: `1px dashed ${theme.brand.line2}`, color: 'text.secondary' })}>
                  <FileText size={20} aria-hidden />
                  <Typography variant="body2">{data.status === 'absent' ? 'The pupil was absent; there is no sheet.' : data.status === 'exempt' ? 'Exempted from this paper.' : 'This paper has not been checked yet.'}</Typography>
                </Stack>
              )}
            </Box>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
      {paper && data ? <QuestionPaperDialog examSubjectId={data.exam_subject_id} onClose={() => setPaper(false)} /> : null}
    </Dialog>
  );
}
