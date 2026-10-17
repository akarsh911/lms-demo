'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';

import { PAPER_SETTER_PARAMS } from '@/constants/paper-setter';
import { useMdmBranches, useMdmSections, useMdmSessions, useMdmSubjects } from '@/hooks/query/use-mdm';
import type { SectionRow } from '@/types/academic';

import { useCurriculumTree, usePaperSetterCurricula } from './hooks';
import type { TreeNode } from './node-tree';
import { PAPER_KINDS, type PaperKind } from './state';

export interface PrefillAsk {
  subject: string;
  section: string;
  chapter: string;
  topic: string;
  kind: string;
  title: string;
}

export interface Prefill {
  subjectId: string;
  curriculumId: string;
  nodeIds: string[];
  paperKind: PaperKind;
  sectionId: string;
  title: string;
  focus: string[];
  complete: boolean;
}

export type PrefillState = { status: 'none' } | { status: 'pending' } | { status: 'ready'; prefill: Prefill };

const QUIZ_KIND: PaperKind = 'assignment';

const same = (left: string | null | undefined, right: string): boolean => (left ?? '').trim().toLowerCase() === right.trim().toLowerCase();

function sectionFor(rows: readonly SectionRow[], gradeLevelId: string, wanted: string): string {
  if (wanted === '') return '';
  const target = wanted.toLowerCase();
  const match = rows
    .filter((row) => row.grade_level_id === gradeLevelId)
    .find((row) => row.id === wanted || [row.name, row.code].some((value) => (value ?? '').toLowerCase() === target || (value ?? '').toLowerCase().endsWith(target)));
  return match?.id ?? '';
}

function chaptersOf(tree: readonly TreeNode[]): TreeNode[] {
  return tree.flatMap((node) => (node.kind === 'unit' ? node.children : [node])).filter((node) => node.kind === 'chapter');
}

function findChapter(tree: readonly TreeNode[], wanted: string): TreeNode | null {
  if (wanted === '') return null;
  const chapters = chaptersOf(tree);
  const number = /^\d{1,2}$/.test(wanted) ? Number.parseInt(wanted, 10) : null;
  return (
    chapters.find((node) => node.id === wanted) ??
    chapters.find((node) => same(node.title, wanted)) ??
    (number === null ? undefined : chapters.find((node) => node.sequence === number)) ??
    null
  );
}

function findTopic(tree: readonly TreeNode[], chapter: TreeNode | null, wanted: string): TreeNode | null {
  if (wanted === '') return null;
  const pool = chapter ? chapter.children : chaptersOf(tree).flatMap((node) => node.children);
  return pool.find((node) => node.id === wanted) ?? pool.find((node) => same(node.title, wanted)) ?? null;
}

function chapterOfTopic(tree: readonly TreeNode[], topic: TreeNode | null): TreeNode | null {
  if (!topic) return null;
  return chaptersOf(tree).find((node) => node.children.some((child) => child.id === topic.id)) ?? null;
}

export function usePrefillAsk(): PrefillAsk {
  const params = useSearchParams();
  const query = params.toString();
  return React.useMemo(() => {
    const read = (key: string): string => new URLSearchParams(query).get(key)?.trim() ?? '';
    return {
      subject: read(PAPER_SETTER_PARAMS.subject),
      section: read(PAPER_SETTER_PARAMS.section),
      chapter: read(PAPER_SETTER_PARAMS.chapter),
      topic: read(PAPER_SETTER_PARAMS.topic),
      kind: read(PAPER_SETTER_PARAMS.kind),
      title: read(PAPER_SETTER_PARAMS.title),
    };
  }, [query]);
}

export function useComposePrefill(ask: PrefillAsk, gradeLevelId: string): PrefillState {
  const asked = ask.subject !== '';
  const subjects = useMdmSubjects();
  const subject = asked
    ? (subjects.data?.rows ?? []).find((row) => row.id === ask.subject || same(row.code, ask.subject) || same(row.name, ask.subject))
    : undefined;
  const curricula = usePaperSetterCurricula(subject?.id ?? null, gradeLevelId || null);
  const curriculum = curricula.data?.[0];
  const tree = useCurriculumTree(curriculum?.id ?? null);
  const branches = useMdmBranches();
  const sessions = useMdmSessions();
  const sessionRows = sessions.data?.rows ?? [];
  const sessionId = (sessionRows.find((row) => row.is_current) ?? sessionRows[0])?.id ?? null;
  const sections = useMdmSections(ask.section === '' ? null : (branches.data?.rows[0]?.id ?? null), sessionId);
  const sectionRows = sections.data?.rows;

  return React.useMemo<PrefillState>(() => {
    if (!asked) return { status: 'none' };
    if (subjects.isPending) return { status: 'pending' };
    if (!subject) return { status: 'ready', prefill: emptyPrefill(ask) };
    if (gradeLevelId === '') return { status: 'ready', prefill: { ...emptyPrefill(ask), subjectId: subject.id } };
    if (curricula.isPending) return { status: 'pending' };
    if (!curriculum) return { status: 'ready', prefill: { ...emptyPrefill(ask), subjectId: subject.id } };
    if (tree.isPending) return { status: 'pending' };
    if (ask.section !== '' && !sectionRows && !sections.isError) return { status: 'pending' };

    const topicNode = findTopic(tree.tree, findChapter(tree.tree, ask.chapter), ask.topic);
    const chapter = findChapter(tree.tree, ask.chapter) ?? chapterOfTopic(tree.tree, topicNode);
    const nodeIds = topicNode ? [topicNode.id] : chapter ? [chapter.id] : [];
    const about = ask.topic || chapter?.title || '';
    const quiz = nodeIds.length > 0 || ask.topic !== '';
    const kind = PAPER_KINDS.find((option) => option === ask.kind) ?? (quiz ? QUIZ_KIND : PAPER_KINDS[0]);

    return {
      status: 'ready',
      prefill: {
        subjectId: subject.id,
        curriculumId: curriculum.id,
        nodeIds,
        paperKind: kind,
        sectionId: sectionFor(sectionRows ?? [], gradeLevelId, ask.section),
        title: ask.title || (quiz && about !== '' ? `Quick quiz: ${about}` : ''),
        focus: ask.topic !== '' && !topicNode ? [ask.topic] : [],
        complete: nodeIds.length > 0,
      },
    };
  }, [asked, ask, gradeLevelId, subjects.isPending, subject, curricula.isPending, curriculum, tree.isPending, tree.tree, sectionRows, sections.isError]);
}

function emptyPrefill(ask: PrefillAsk): Prefill {
  return {
    subjectId: '',
    curriculumId: '',
    nodeIds: [],
    paperKind: PAPER_KINDS.find((option) => option === ask.kind) ?? PAPER_KINDS[0],
    sectionId: '',
    title: ask.title,
    focus: [],
    complete: false,
  };
}
