'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';

import { CheckAnswerSheetsAction } from '@/components/answer-checker/check-answer-sheets-action';
import { PaperFiles } from '@/components/paper-setter/paper-files';
import { SETTER_PAPER_PARAM } from '@/constants/paper-setter';
import { paperSetterKeys } from '@/components/paper-setter/hooks';
import { KIND_LABEL } from '@/components/paper-setter/paper-basics';
import { useUrlState } from '@/components/school/url-state';
import { EmergeChip } from '@/components/ui/chip';
import { Divider, SectionHeader } from '@/components/ui/layout';
import { WidgetEmpty, WidgetError, WidgetLoading } from '@/components/widgets/widget-states';
import { useMdmBranches, useMdmSections, useMdmSessions } from '@/hooks/query/use-mdm';
import { paperClassLine, paperTitle, setQuestions } from '@/lib/answer-checker/paper';
import { markLabel } from '@/lib/papers/paper';
import { durationLabel } from '@/lib/school/time';
import type { ApiError } from '@/services/api';
import { paperService } from '@/services/papersetter';
import type { Paper, PaperSummary } from '@/types/papersetter';

import { usePaperGrade } from './paper-grade';
import { PaperNotFound } from './papers-board';

const WIDE_ONLY = { display: { xs: 'none', sm: 'table-cell' } } as const;

const setterPapersKey = [...paperSetterKeys.all, 'papers'] as const;
const setterPaperKey = (paperId: string) => [...paperSetterKeys.all, 'paper', paperId] as const;

function useSectionNames(): ReadonlyMap<string, string> {
  const branches = useMdmBranches();
  const sessions = useMdmSessions();
  const branchId = branches.data?.rows[0]?.id ?? null;
  const sessionRows = sessions.data?.rows ?? [];
  const sessionId = (sessionRows.find((row) => row.is_current) ?? sessionRows[0])?.id ?? null;
  const sections = useMdmSections(branchId, sessionId);
  return React.useMemo(() => new Map((sections.data?.rows ?? []).map((row) => [row.id, row.name ?? row.code ?? ''])), [sections.data]);
}

function kindLabel(kind: string | null | undefined): string | null {
  if (!kind) return null;
  if (kind in KIND_LABEL) return KIND_LABEL[kind as keyof typeof KIND_LABEL];
  const words = kind.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const newestFirst = (left: PaperSummary, right: PaperSummary): number => (right.created_at ?? '').localeCompare(left.created_at ?? '');

export function SetterPapers(): React.ReactElement {
  const { get, put } = useUrlState();
  const selected = get(SETTER_PAPER_PARAM);
  const sectionNames = useSectionNames();
  const papers = useQuery<PaperSummary[], ApiError>({
    queryKey: setterPapersKey,
    queryFn: ({ signal }) => paperService.listPapers(signal),
  });
  const level = usePaperGrade();
  const rows = React.useMemo(
    () => [...(papers.data ?? [])].filter((paper) => level === null || paper.class_id === String(level)).sort(newestFirst),
    [papers.data, level],
  );

  return (
    <Stack spacing={2}>
      <SectionHeader title="Set in the paper setter" subtitle="Papers composed from the curriculum, newest first" />

      {papers.isPending ? <WidgetLoading rows={3} /> : null}
      {papers.isError ? <WidgetError error={papers.error} onRetry={() => void papers.refetch()} /> : null}
      {papers.data && rows.length === 0 ? <WidgetEmpty message="No paper has been set in the paper setter yet." /> : null}

      {rows.length > 0 ? (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Paper</TableCell>
                <TableCell sx={WIDE_ONLY}>Kind</TableCell>
                <TableCell>Marks</TableCell>
                <TableCell sx={WIDE_ONLY}>Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((paper) => (
                <TableRow key={paper.paper_id} hover selected={paper.paper_id === selected}>
                  <TableCell>
                    <Button
                      size="small"
                      sx={{ justifyContent: 'flex-start', textAlign: 'left', px: 0.5 }}
                      onClick={() => put({ [SETTER_PAPER_PARAM]: paper.paper_id })}
                    >
                      {paperTitle(paper)}
                    </Button>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 0.5 }}>
                      {paperClassLine(paper, sectionNames.get(paper.section_id ?? ''))}
                    </Typography>
                  </TableCell>
                  <TableCell sx={WIDE_ONLY}>{kindLabel(paper.kind) ?? '—'}</TableCell>
                  <TableCell>{typeof paper.marks === 'number' ? paper.marks : '—'}</TableCell>
                  <TableCell sx={WIDE_ONLY}>{typeof paper.minutes === 'number' ? durationLabel(paper.minutes) : 'Not stated'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : null}

      {selected ? <SetterPaperDetail paperId={selected} sectionNames={sectionNames} onClose={() => put({ [SETTER_PAPER_PARAM]: null })} /> : null}
    </Stack>
  );
}

function SetterPaperDetail({
  paperId,
  sectionNames,
  onClose,
}: {
  paperId: string;
  sectionNames: ReadonlyMap<string, string>;
  onClose: () => void;
}): React.ReactElement {
  const { data, isPending, isError, error, refetch } = useQuery<Paper, ApiError>({
    queryKey: setterPaperKey(paperId),
    queryFn: ({ signal }) => paperService.getPaper(paperId, signal),
  });
  const panel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    panel.current?.focus();
  }, [paperId]);

  if (isError && error.status === 404) return <PaperNotFound onClose={onClose} />;

  const questions = data ? setQuestions(data) : [];
  const bySection = questions.reduce<Map<string, typeof questions>>((groups, question) => {
    groups.set(question.section, [...(groups.get(question.section) ?? []), question]);
    return groups;
  }, new Map());

  return (
    <Box ref={panel} tabIndex={-1} role="region" aria-label="The paper you chose" sx={{ outline: 'none' }}>
      <Box sx={{ mb: 2 }}>
        <Divider />
      </Box>
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h4" component="h3">
              {data ? paperTitle(data) : 'Question paper'}
            </Typography>
            {data ? (
              <Typography variant="body2" color="text.secondary">
                {[paperClassLine(data, sectionNames.get(data.section_id ?? '')), kindLabel(data.kind), typeof data.marks === 'number' ? markLabel(data.marks) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            ) : null}
            {data?.status ? (
              <Box sx={{ mt: 0.75 }}>
                <EmergeChip dot tone={data.status === 'ready' ? 'green' : 'grey'} label={data.status === 'ready' ? 'Ready' : 'Draft'} />
              </Box>
            ) : null}
          </Box>
          <Button size="small" startIcon={<X size={16} />} onClick={onClose}>
            Close
          </Button>
        </Stack>

        {isPending ? <WidgetLoading rows={4} /> : null}
        {isError ? <WidgetError error={error} onRetry={() => void refetch()} /> : null}

        {data ? (
          <Box>
            <CheckAnswerSheetsAction paperId={data.paper_id} variant="contained" />
          </Box>
        ) : null}

        {data ? <PaperFiles paperId={data.paper_id} /> : null}

        {data && questions.length === 0 ? <WidgetEmpty message="This paper has no questions on it yet." /> : null}

        {[...bySection.entries()].map(([section, rows]) => (
          <Box component="section" key={section}>
            <SectionHeader title={section} subtitle={`${rows.length} question${rows.length === 1 ? '' : 's'} · ${markLabel(rows.reduce((sum, row) => sum + row.marks, 0))}`} />
            <Box component="ol" sx={{ m: 0, pl: 0, listStyle: 'none' }}>
              {rows.map((question) => (
                <Box
                  component="li"
                  key={question.n}
                  sx={(theme) => ({ display: 'flex', gap: 1.5, py: 1, borderBottom: `1px solid ${theme.brand.line}` })}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 32 }}>
                    Q{question.n}
                  </Typography>
                  <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }}>
                    {question.text}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {markLabel(question.marks)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
