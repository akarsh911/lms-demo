import type {
  CreateDebateRequest,
  DebateCatalog,
  DebateClip,
  DebateEndReason,
  DebateHealth,
  DebatePhase,
  DebatePosition,
  DebateReportEnvelope,
  DebateSegment,
  DebateSession,
  DebateTurn,
  HostClip,
  SegmentMetrics,
} from '@/types/debate';

import { DEBATE_CATALOG } from './debate-catalog';
import { buildScriptedReport } from './debate-report';
import {
  hostClosingLines,
  hostOpeningLines,
  scriptedAiTurn,
  scriptedStudentLine,
} from './debate-script';
import { fail } from './rows';

const GRACE_MS = 4000;
const AI_PLAYBACK_GRACE_MS = 20000;
const MAX_TURNS = 40;
const REPORT_STAGES: readonly [number, string][] = [
  [0, 'queued'],
  [600, 'delivery'],
  [1400, 'fact_check'],
  [2600, 'evaluation'],
];
const REPORT_READY_MS = 3800;
const MIN_STUDENT_WORDS = 15;

interface SegmentRow extends DebateSegment, SegmentMetrics {}

interface TurnRow {
  index: number;
  speaker: 'student' | 'ai';
  status: DebateTurn['status'];
  text: string;
  chunks: string[];
}

interface HostScript {
  opening: HostClip[];
  closing: Record<'time_limit' | 'manual', HostClip[]>;
}

interface SessionRow {
  id: string;
  request: CreateDebateRequest;
  topic: string;
  topicId: string | null;
  category: string | null;
  studentPosition: DebatePosition;
  aiPosition: DebatePosition;
  assignedBy: 'student' | 'system';
  phase: DebatePhase;
  version: number;
  createdAt: number;
  startedAt: number | null;
  deadlineAt: number | null;
  endedAt: number | null;
  endReason: DebateEndReason | null;
  finalizeAfter: number | null;
  evaluationStartedAt: number | null;
  aiTurnExpiresAt: number | null;
  turns: TurnRow[];
  segments: SegmentRow[];
  host: HostScript | null;
  studentLineCursor: number;
}

const SESSIONS = new Map<string, SessionRow>();
let sequence = 0;

const TRANSITIONS: Readonly<Record<DebatePhase, readonly DebatePhase[]>> = {
  ready: ['host_intro', 'cancelled'],
  host_intro: ['student_turn', 'processing', 'finalizing', 'cancelled'],
  student_turn: ['processing', 'finalizing'],
  processing: ['ai_turn', 'finalizing'],
  ai_turn: ['student_turn', 'finalizing'],
  finalizing: ['evaluating'],
  evaluating: ['report_ready', 'report_failed'],
  report_failed: ['evaluating'],
  report_ready: [],
  cancelled: [],
};

const CLOCK_RUNNING: readonly DebatePhase[] = ['student_turn', 'processing', 'ai_turn'];
const ENDED: readonly DebatePhase[] = ['finalizing', 'evaluating', 'report_ready', 'report_failed'];

function refuse(status: number, code: string, detail: string): never {
  return fail(status, code, detail, { error: code, detail });
}

function bump(row: SessionRow, phase: DebatePhase): void {
  if (!TRANSITIONS[row.phase].includes(phase)) {
    refuse(409, 'invalid_transition', `a debate cannot move from ${row.phase} to ${phase}`);
  }
  row.phase = phase;
  row.version += 1;
}

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function speechChunks(text: string, firstMax = 140, maxChars = 300): string[] {
  const chunks: string[] = [];
  let current = '';
  let limit = firstMax;
  for (const sentence of splitSentences(text)) {
    if (!current) current = sentence;
    else if (current.length + 1 + sentence.length <= limit) current = `${current} ${sentence}`;
    else {
      chunks.push(current);
      current = sentence;
      limit = maxChars;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function groupClips(lines: string[], prefix: string): HostClip[] {
  const groups: number[][] = [];
  let current: number[] = [];
  lines.forEach((_, i) => {
    const limit = groups.length === 0 && current.length > 0 ? 0 : 260;
    const candidate = [...current, i].map((j) => lines[j]).join(' ');
    if (current.length > 0 && candidate.length > limit) {
      groups.push(current);
      current = [i];
    } else {
      current.push(i);
    }
  });
  if (current.length > 0) groups.push(current);
  return groups.map((group, n) => {
    const grouped = group.map((j) => lines[j] ?? '');
    return { id: `${prefix}-${n}`, text: grouped.join(' '), lines: grouped };
  });
}

function joinSegments(segments: readonly SegmentRow[]): string {
  return [...segments]
    .sort((a, b) => a.seq - b.seq)
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join(' ');
}

function openTurn(row: SessionRow): TurnRow | null {
  const last = row.turns[row.turns.length - 1];
  return last && last.speaker === 'student' && last.status === 'open' ? last : null;
}

function segmentsOf(row: SessionRow, turnIndex: number): SegmentRow[] {
  return row.segments.filter((s) => s.turn_index === turnIndex);
}

function end(row: SessionRow, reason: DebateEndReason, at: number, now: number): void {
  bump(row, 'finalizing');
  row.endReason = reason;
  row.endedAt = at;
  row.aiTurnExpiresAt = null;
  row.finalizeAfter = reason === 'time_limit' ? Math.max(now, at + GRACE_MS) : now;
}

function openStudentTurn(row: SessionRow, now: number): void {
  if (row.turns.length >= MAX_TURNS) {
    end(row, 'turn_limit', now, now);
    return;
  }
  bump(row, 'student_turn');
  row.turns.push({ index: row.turns.length, speaker: 'student', status: 'open', text: '', chunks: [] });
  row.aiTurnExpiresAt = null;
}

function finalize(row: SessionRow, now: number): void {
  const turn = openTurn(row);
  if (turn) {
    turn.text = joinSegments(segmentsOf(row, turn.index));
    turn.status = turn.text ? (row.endReason === 'time_limit' ? 'cut_off' : 'complete') : 'empty';
  }
  bump(row, 'evaluating');
  row.finalizeAfter = null;
  row.evaluationStartedAt = now;
}

function advance(row: SessionRow, now: number): void {
  if (row.phase === 'ready' || row.phase === 'host_intro') return;
  if (CLOCK_RUNNING.includes(row.phase) && row.deadlineAt !== null && now >= row.deadlineAt) {
    end(row, 'time_limit', row.deadlineAt, now);
  }
  if (row.phase === 'ai_turn' && row.aiTurnExpiresAt !== null && now >= row.aiTurnExpiresAt) {
    openStudentTurn(row, now);
  }
  if (row.phase === 'finalizing' && row.finalizeAfter !== null && now >= row.finalizeAfter) {
    finalize(row, now);
  }
  if (row.phase === 'evaluating' && row.evaluationStartedAt !== null && now - row.evaluationStartedAt >= REPORT_READY_MS) {
    bump(row, 'report_ready');
  }
}

function load(sessionId: string): SessionRow {
  const row = SESSIONS.get(sessionId);
  if (!row) refuse(404, 'session_not_found', 'that debate does not exist');
  advance(row, Date.now());
  return row;
}

function reportStage(row: SessionRow, now: number): string | null {
  if (row.phase === 'report_ready') return 'complete';
  if (row.evaluationStartedAt === null) return null;
  const elapsed = now - row.evaluationStartedAt;
  return REPORT_STAGES.filter(([at]) => elapsed >= at).pop()?.[1] ?? 'queued';
}

function view(row: SessionRow): DebateSession {
  const now = Date.now();
  const remaining =
    row.deadlineAt === null
      ? row.phase === 'ready' || row.phase === 'host_intro'
        ? row.request.duration_s * 1000
        : 0
      : CLOCK_RUNNING.includes(row.phase)
        ? Math.max(0, row.deadlineAt - now)
        : 0;
  const open = openTurn(row);
  const openSegments = open ? segmentsOf(row, open.index) : [];
  const ended = ENDED.includes(row.phase);
  return {
    id: row.id,
    topic: row.topic,
    topic_id: row.topicId,
    category: row.category,
    student_position: row.studentPosition,
    ai_position: row.aiPosition,
    position_assigned_by: row.assignedBy,
    first_speaker: row.request.first_speaker,
    difficulty: row.request.difficulty,
    language: row.request.language,
    duration_s: row.request.duration_s,
    student_context: row.request.student_context ?? '',
    phase: row.phase,
    end_reason: row.endReason,
    version: row.version,
    server_now: new Date(now).toISOString(),
    created_at: new Date(row.createdAt).toISOString(),
    started_at: iso(row.startedAt),
    deadline_at: iso(row.deadlineAt),
    ended_at: iso(row.endedAt),
    remaining_ms: remaining,
    active_turn_index: row.phase === 'student_turn' || row.phase === 'ai_turn' ? row.turns.length - 1 : null,
    turns: row.turns.map((t): DebateTurn => {
      const base = { index: t.index, speaker: t.speaker, status: t.status, text: t.status === 'open' ? joinSegments(openSegments) : t.text };
      if (t.speaker !== 'ai') return base;
      const clips: DebateClip[] = t.chunks.map((text, i) => ({ id: `turn-${t.index}-${i}`, text }));
      return { ...base, clips };
    }),
    open_segments: openSegments.map(({ turn_index, seq, text, duration_ms }) => ({ turn_index, seq, text, duration_ms })),
    pending_error: null,
    host: row.host
      ? {
          language: 'en-IN',
          translated: false,
          opening: row.host.opening,
          closing: ended ? row.host.closing[row.endReason === 'time_limit' ? 'time_limit' : 'manual'] : null,
        }
      : null,
    report_stage: reportStage(row, now),
    report_error: null,
    overall_score: row.phase === 'report_ready' ? buildScriptedReport(reportInput(row)).overall_score : null,
    test_mode: false,
    limits: { max_segment_s: 29.5, max_student_turn_s: 240, final_segment_grace_s: GRACE_MS / 1000 },
  };
}

function reportInput(row: SessionRow): Parameters<typeof buildScriptedReport>[0] {
  return {
    sessionId: row.id,
    topic: row.topic,
    topicId: row.topicId,
    studentPosition: row.studentPosition,
    aiPosition: row.aiPosition,
    assignedBy: row.assignedBy,
    request: row.request,
    actualDurationS:
      row.startedAt !== null && row.endedAt !== null
        ? Math.max(0, Math.min(row.request.duration_s, Math.floor((row.endedAt - row.startedAt) / 1000)))
        : 0,
    endReason: row.endReason ?? 'manual',
    turns: row.turns.map(({ index, speaker, status, text }) => ({ index, speaker, status, text })),
    segments: row.segments,
    minStudentWords: MIN_STUDENT_WORDS,
  };
}

function generateAiTurn(row: SessionRow, now: number): void {
  const studentTurns = row.turns.filter((t) => t.speaker === 'student' && t.text);
  const last = studentTurns[studentTurns.length - 1];
  const text = scriptedAiTurn({
    topicId: row.topicId,
    topic: row.topic,
    aiPosition: row.aiPosition,
    aiTurnNumber: row.turns.filter((t) => t.speaker === 'ai').length,
    lastStudentSentence: last ? (splitSentences(last.text)[0] ?? '') : '',
  });
  const chunks = speechChunks(text);
  row.turns.push({ index: row.turns.length, speaker: 'ai', status: 'complete', text, chunks });
  bump(row, 'ai_turn');
  row.aiTurnExpiresAt = now + (wordCount(text) / 2.5) * 1000 + 2000 * chunks.length + AI_PLAYBACK_GRACE_MS;
}

function acceptingTurn(row: SessionRow, turnIndex: number, now: number): TurnRow {
  const turn = openTurn(row);
  const inGrace = row.phase === 'finalizing' && row.endReason === 'time_limit' && row.finalizeAfter !== null && now < row.finalizeAfter;
  if (turn && turn.index === turnIndex && (row.phase === 'student_turn' || inGrace)) return turn;
  if (ENDED.includes(row.phase) || row.phase === 'cancelled') refuse(409, 'debate_over', 'the debate has ended');
  return refuse(409, 'turn_not_allowed', 'it is not your turn to speak');
}

function storeSegment(sessionId: string, turnIndex: number, seq: number, text: string, durationMs: number, metrics: SegmentMetrics): DebateSegment {
  const row = load(sessionId);
  const now = Date.now();
  acceptingTurn(row, turnIndex, now);
  const existing = row.segments.find((s) => s.turn_index === turnIndex && s.seq === seq);
  const segment = existing ?? { turn_index: turnIndex, seq, text, duration_ms: durationMs, ...metrics };
  if (!existing) row.segments.push(segment);
  return { turn_index: segment.turn_index, seq: segment.seq, text: segment.text, duration_ms: segment.duration_ms };
}

export const debateHealth: DebateHealth = {
  status: 'ok',
  service: 'debate-room-engine',
  version: 'fixture',
  durable_backend: 'memory',
  auth_mode: 'demo',
  providers: { stt: 'fixture', tts: 'browser', llm: 'fixture', knowledge: 'fixture' },
  ready: true,
  test_mode: false,
  max_duration_s: 600,
};

export const debateCatalog: DebateCatalog = DEBATE_CATALOG;

export function ownsSession(sessionId: string): boolean {
  return SESSIONS.has(sessionId);
}

export function createSession(request: CreateDebateRequest): DebateSession {
  const preset = request.topic_id
    ? DEBATE_CATALOG.categories.flatMap((c) => c.topics.map((t) => ({ ...t, category: c.id }))).find((t) => t.id === request.topic_id)
    : undefined;
  if (request.topic_id && !preset) refuse(422, 'invalid_request', 'that preset topic does not exist');
  const topic = preset ? preset.text : (request.topic ?? '').trim();
  if (!preset && topic.length < DEBATE_CATALOG.limits.topic_min_chars) {
    refuse(422, 'invalid_request', `a topic needs at least ${DEBATE_CATALOG.limits.topic_min_chars} characters`);
  }
  if (!DEBATE_CATALOG.durations.some((d) => d.seconds === request.duration_s)) {
    refuse(422, 'invalid_request', 'duration must be one of [180, 300, 420, 600] seconds (ten minutes at most)');
  }
  const studentPosition: DebatePosition =
    request.position === 'AUTO' ? (Math.random() < 0.5 ? 'FOR' : 'AGAINST') : request.position;
  sequence += 1;
  const row: SessionRow = {
    id: `deb_fixture${String(sequence).padStart(4, '0')}`,
    request,
    topic,
    topicId: preset ? preset.id : null,
    category: preset ? preset.category : null,
    studentPosition,
    aiPosition: studentPosition === 'FOR' ? 'AGAINST' : 'FOR',
    assignedBy: request.position === 'AUTO' ? 'system' : 'student',
    phase: 'ready',
    version: 1,
    createdAt: Date.now(),
    startedAt: null,
    deadlineAt: null,
    endedAt: null,
    endReason: null,
    finalizeAfter: null,
    evaluationStartedAt: null,
    aiTurnExpiresAt: null,
    turns: [],
    segments: [],
    host: null,
    studentLineCursor: 0,
  };
  SESSIONS.set(row.id, row);
  return view(row);
}

export function getSession(sessionId: string): DebateSession {
  return view(load(sessionId));
}

export function cancelSession(sessionId: string): DebateSession {
  const row = load(sessionId);
  if (row.phase !== 'cancelled') {
    if (row.phase !== 'ready' && row.phase !== 'host_intro') {
      refuse(409, 'invalid_transition', 'a debate that has started is ended, not cancelled');
    }
    bump(row, 'cancelled');
    row.endReason = 'cancelled';
    row.endedAt = Date.now();
  }
  return view(row);
}

export function startIntro(sessionId: string): DebateSession {
  const row = load(sessionId);
  if (row.phase !== 'ready') {
    if (row.host) return view(row);
    refuse(409, 'invalid_transition', `a debate cannot start its introduction from ${row.phase}`);
  }
  row.host = {
    opening: groupClips(
      hostOpeningLines({
        topic: row.topic,
        studentPosition: row.studentPosition,
        aiPosition: row.aiPosition,
        firstSpeaker: row.request.first_speaker,
        durationS: row.request.duration_s,
        assignedBySystem: row.assignedBy === 'system',
      }),
      'intro',
    ),
    closing: {
      time_limit: groupClips(hostClosingLines('time_limit'), 'closing-time_limit'),
      manual: groupClips(hostClosingLines('manual'), 'closing-manual'),
    },
  };
  bump(row, 'host_intro');
  return view(row);
}

export function begin(sessionId: string): DebateSession {
  const row = load(sessionId);
  const now = Date.now();
  if (CLOCK_RUNNING.includes(row.phase) || ENDED.includes(row.phase)) return view(row);
  if (row.phase !== 'host_intro') refuse(409, 'invalid_transition', `a debate cannot begin from ${row.phase}`);
  row.startedAt = now;
  row.deadlineAt = now + row.request.duration_s * 1000;
  if (row.request.first_speaker === 'student') {
    openStudentTurn(row, now);
    return view(row);
  }
  bump(row, 'processing');
  generateAiTurn(row, now);
  return view(row);
}

export function addRecordedSegment(sessionId: string, turnIndex: number, seq: number, durationMs: number, metrics: SegmentMetrics): DebateSegment {
  const row = load(sessionId);
  const text = scriptedStudentLine(row.topicId, row.studentPosition, row.studentLineCursor);
  if (!row.segments.some((s) => s.turn_index === turnIndex && s.seq === seq)) row.studentLineCursor += 1;
  return storeSegment(sessionId, turnIndex, seq, text, durationMs, metrics);
}

export function addTypedSegment(sessionId: string, turnIndex: number, seq: number, text: string): DebateSegment {
  const clean = text.trim();
  if (!clean) refuse(422, 'empty_turn', 'we did not catch any words — try speaking again');
  const durationMs = Math.round((wordCount(clean) / 2.5) * 1000);
  return storeSegment(sessionId, turnIndex, seq, clean, durationMs, {
    voiced_ms: 0,
    pause_before_ms: 0,
    long_pauses: 0,
    longest_pause_ms: 0,
  });
}

export function finishTurn(sessionId: string, turnIndex: number, seqs: readonly number[]): DebateSession {
  const row = load(sessionId);
  const now = Date.now();
  if (ENDED.includes(row.phase) || row.phase === 'cancelled') refuse(409, 'debate_over', 'the debate has ended');
  if (row.phase === 'ai_turn' && turnIndex < row.turns.length) return view(row);
  if (row.phase !== 'student_turn') refuse(409, 'turn_not_allowed', 'it is not your turn');
  const turn = openTurn(row);
  if (!turn || turn.index !== turnIndex) refuse(409, 'turn_not_allowed', 'that is not the current turn');
  const segments = segmentsOf(row, turnIndex);
  if (seqs.some((q) => !segments.some((s) => s.seq === q))) {
    refuse(409, 'segments_pending', 'part of your turn is still being transcribed');
  }
  const text = joinSegments(seqs.length === 0 ? segments : segments.filter((s) => seqs.includes(s.seq)));
  if (!text) refuse(422, 'empty_turn', 'we did not catch any words — try speaking again');
  turn.text = text;
  turn.status = 'complete';
  bump(row, 'processing');
  generateAiTurn(row, now);
  return view(row);
}

export function ackAiTurn(sessionId: string, turnIndex: number): DebateSession {
  const row = load(sessionId);
  const now = Date.now();
  if (row.phase === 'ai_turn' && row.turns.length - 1 === turnIndex) openStudentTurn(row, now);
  else if (!(ENDED.includes(row.phase) || (row.phase === 'student_turn' && row.turns.length - 2 === turnIndex))) {
    refuse(409, 'turn_not_allowed', 'that is not the turn being played');
  }
  return view(row);
}

export function retryAiTurn(sessionId: string): DebateSession {
  return view(load(sessionId));
}

export function endDebate(sessionId: string, reason: 'manual' | 'time_limit'): DebateSession {
  const row = load(sessionId);
  const now = Date.now();
  if (ENDED.includes(row.phase) || row.phase === 'cancelled') return view(row);
  if (row.phase === 'ready') refuse(409, 'invalid_transition', 'this debate has not started — cancel it instead');
  if (reason === 'time_limit') {
    if (row.deadlineAt === null || now < row.deadlineAt - 1500) return view(row);
    end(row, 'time_limit', Math.min(now, row.deadlineAt), now);
  } else {
    end(row, 'manual', now, now);
  }
  advance(row, now);
  return view(row);
}

export function getReport(sessionId: string): DebateReportEnvelope {
  const row = load(sessionId);
  const now = Date.now();
  if (row.phase === 'cancelled') refuse(409, 'report_not_ready', 'this debate was cancelled before it began');
  if (!ENDED.includes(row.phase)) refuse(409, 'report_not_ready', 'the debate is still in progress');
  const status = row.phase === 'finalizing' ? 'finalizing' : row.phase === 'evaluating' ? 'running' : row.phase === 'report_ready' ? 'ready' : 'failed';
  return {
    session_id: row.id,
    phase: row.phase,
    status,
    stage: reportStage(row, now),
    error: null,
    report: row.phase === 'report_ready' ? buildScriptedReport(reportInput(row)) : null,
    server_now: new Date(now).toISOString(),
  };
}

export function retryReport(sessionId: string): DebateReportEnvelope {
  return getReport(sessionId);
}
