'use client';

import * as React from 'react';
import ButtonBase from '@mui/material/ButtonBase';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableFooter from '@mui/material/TableFooter';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { percent } from '@/lib/gap-analyzer/model';
import type { ClassAnalysis, ClassCell, ClassTopicSummary } from '@/types/gap-analyzer';

import { STATUS_META, cellFill } from './status';

const CELL = 34;
const NAME_WIDTH = 190;

function visibleTopics(analysis: ClassAnalysis, showAll: boolean): ClassTopicSummary[] {
  return analysis.topics.filter((topic) => showAll || (topic.coverage !== 'not_taught' && topic.learners_with_data > 0));
}

export function ClassHeatmap({
  analysis,
  showAll,
  onCell,
  onLearner,
}: {
  analysis: ClassAnalysis;
  showAll: boolean;
  onCell: (studentId: string, topicId: string) => void;
  onLearner?: (studentId: string) => void;
}): React.ReactElement {
  const topics = visibleTopics(analysis, showAll);
  const cells = React.useMemo(() => new Map<string, ClassCell>(analysis.cells.map((cell) => [`${cell.student_id}|${cell.topic_id}`, cell])), [analysis.cells]);
  const groups = analysis.chapters
    .map((chapter) => ({ ...chapter, shown: topics.filter((topic) => topic.chapter_id === chapter.chapter_id) }))
    .filter((chapter) => chapter.shown.length > 0);

  if (topics.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No chapter of this subject has been taught yet.
      </Typography>
    );
  }

  return (
    <TableContainer sx={{ maxHeight: { md: '64vh' }, border: 1, borderColor: 'divider', borderRadius: 1 }}>
      {/* Fixed layout over the full width: topic columns share the card evenly instead of bunching at the left. */}
      <Table size="small" stickyHeader aria-label={`${analysis.subject.name} gaps by learner and topic in ${analysis.section.label}`} sx={{ width: '100%', minWidth: NAME_WIDTH + topics.length * CELL, tableLayout: 'fixed', '& td, & th': { borderColor: 'divider' }, '& tbody tr:nth-of-type(even) td, & tbody tr:nth-of-type(even) th': { bgcolor: (t) => t.brand.subtle } }}>
        <colgroup>
          <col style={{ width: NAME_WIDTH }} />
          {topics.map((topic) => (
            <col key={topic.topic_id} />
          ))}
        </colgroup>
        <TableHead>
          <TableRow>
            <TableCell rowSpan={2} sx={{ left: 0, zIndex: 4, verticalAlign: 'bottom', fontWeight: 700 }}>
              Learner
            </TableCell>
            {groups.map((chapter) => (
              <TableCell key={chapter.chapter_id} colSpan={chapter.shown.length} align="center" title={chapter.title} sx={{ px: 0.75, borderLeft: 1, borderLeftColor: 'divider' }}>
                <Typography variant="caption" noWrap component="span" sx={{ display: 'block', fontWeight: 700 }}>
                  {chapter.title}
                </Typography>
              </TableCell>
            ))}
          </TableRow>
          <TableRow>
            {topics.map((topic) => (
              <TableCell key={topic.topic_id} title={topic.title} align="center" sx={{ top: 33, px: 0.5, py: 0.75, height: 64, verticalAlign: 'bottom', whiteSpace: 'normal' }}>
                <Typography variant="caption" component="span" sx={{ display: '-webkit-box', whiteSpace: 'normal', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.2, fontWeight: 600, fontSize: 10.5, textTransform: 'none', letterSpacing: 0, hyphens: 'auto', overflowWrap: 'normal', wordBreak: 'normal' }}>
                  {/, part \d+$/i.test(topic.title) ? topic.title.replace(/^.*, part (\d+)$/i, 'Part $1') : topic.title}
                </Typography>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {analysis.learners.map((learner) => (
            <TableRow key={learner.student_id} hover>
              <TableCell component="th" scope="row" sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', py: 0.25 }}>
                <ButtonBase onClick={() => onLearner?.(learner.student_id)} disabled={!onLearner} aria-label={`Open ${learner.name}'s profile`} sx={(theme) => ({ justifyContent: 'flex-start', borderRadius: 0.5, '&:hover': { color: theme.palette.primary.main, textDecoration: 'underline' } })}>
                  <Typography variant="body2" noWrap>
                    {learner.roll_number ? `${learner.roll_number}. ` : ''}
                    {learner.name}
                  </Typography>
                </ButtonBase>
              </TableCell>
              {topics.map((topic) => {
                const cell = cells.get(`${learner.student_id}|${topic.topic_id}`);
                const status = cell?.status ?? 'no_data';
                const diffuse = cell !== undefined && cell.score !== null && !cell.topic_specific;
                return (
                  <TableCell key={topic.topic_id} sx={{ px: 0.375, py: 0.25 }}>
                    <ButtonBase
                      onClick={() => onCell(learner.student_id, topic.topic_id)}
                      aria-label={`${learner.name}, ${topic.title}: ${STATUS_META[status].label}${cell?.score !== null && cell?.score !== undefined ? `, ${percent(cell.score)}` : ''}${diffuse ? ', from a whole-paper exam mark only' : ''}`}
                      sx={(theme) => ({
                        ...cellFill(theme, status),
                        ...(diffuse ? { opacity: 0.45 } : {}),
                        width: '100%',
                        maxWidth: 88,
                        display: 'flex',
                        mx: 'auto',
                        height: 28,
                        borderRadius: 0.5,
                        fontSize: theme.typography.caption.fontSize,
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600,
                        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                      })}
                    >
                      {cell?.score !== null && cell?.score !== undefined ? Math.round(cell.score * 100) : ''}
                    </ButtonBase>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell component="th" scope="row" sx={{ position: 'sticky', left: 0, bottom: 0, zIndex: 3, bgcolor: 'background.paper', fontWeight: 700 }}>
              Weak in this class
            </TableCell>
            {topics.map((topic) => (
              <TableCell key={topic.topic_id} align="center" title={`${topic.weak} of ${topic.learners_with_data} learners with evidence`} sx={{ position: 'sticky', bottom: 0, bgcolor: 'background.paper', p: 0.25, fontWeight: topic.class_wide ? 800 : 500, color: topic.class_wide ? 'error.main' : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {topic.learners_with_data > 0 ? `${Math.round(topic.weak_share * 100)}%` : '—'}
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
    </TableContainer>
  );
}
