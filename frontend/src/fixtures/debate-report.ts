import type {
  CreateDebateRequest,
  DebateEndReason,
  DebatePosition,
  DebateReport,
  DeliveryMetrics,
  FactCheck,
  FactCheckItem,
  ReportArgument,
  ReportFallacy,
  ReportPoint,
  SegmentMetrics,
} from '@/types/debate';
import { TYPED_REASON } from '@/types/debate';

import { DEBATE_CATALOG } from './debate-catalog';
import { CATEGORY_SCORES, PRACTICE_PLAN, SCORE_WEIGHTS, scriptedClaims } from './debate-script';

interface ReportTurn {
  index: number;
  speaker: 'student' | 'ai';
  status: 'open' | 'complete' | 'cut_off' | 'empty';
  text: string;
}

interface ReportSegment extends SegmentMetrics {
  turn_index: number;
  seq: number;
  text: string;
  duration_ms: number;
}

export interface ScriptedReportInput {
  sessionId: string;
  topic: string;
  topicId: string | null;
  studentPosition: DebatePosition;
  aiPosition: DebatePosition;
  assignedBy: 'student' | 'system';
  request: CreateDebateRequest;
  actualDurationS: number;
  endReason: DebateEndReason;
  turns: ReportTurn[];
  segments: ReportSegment[];
  minStudentWords: number;
}

const HESITATION = /(?<![\w'])(u+m+|u+h+m*|e+r+m+|e+r+|h+m+|a+h+)(?![\w'])/gi;
const PHRASES: readonly [string, RegExp][] = [
  ['you know', /\byou know\b/gi],
  ['basically', /\bbasically\b/gi],
  ['I mean', /\bi mean\b(?!\s+(that|it|to|what))/gi],
  ['like', /(?:^|,)\s*like\s*,/gi],
];
const GENERALISATION = /\b(every|always|never|everyone|nobody)\b/i;
const NUMERIC = /\b(\d+|percent|seventy|million|billion)\b/i;

const sentencesOf = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const plural = (n: number, word: string): string => `${n} ${word}${n !== 1 ? 's' : ''}`;

function hesitationKey(token: string): string {
  const t = token.toLowerCase();
  if (t.startsWith('u')) return t.includes('m') ? 'um' : 'uh';
  if (t.startsWith('e')) return 'er';
  return t.startsWith('h') ? 'hmm' : 'ah';
}

function paceLabel(wpm: number): 'slow' | 'balanced' | 'fast' {
  if (wpm < 105) return 'slow';
  return wpm > 175 ? 'fast' : 'balanced';
}

function observations(m: DeliveryMetrics): string[] {
  const out: string[] = [];
  if (m.fillers_measured) {
    const hes = Object.values(m.hesitations ?? {}).reduce((a, b) => a + b, 0);
    const phrase = Object.values(m.filler_phrases ?? {}).reduce((a, b) => a + b, 0);
    const kinds = (counts: Record<string, number>): string =>
      Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `“${k}” ×${v}`)
        .join(', ');
    out.push(
      hes
        ? `${plural(hes, 'hesitation sound')} in the transcript (${kinds(m.hesitations ?? {})})`
        : 'No hesitation sounds (um, uh) were picked up in the transcript',
    );
    if (phrase) out.push(`${plural(phrase, 'filler phrase')} (${kinds(m.filler_phrases ?? {})})`);
  }
  out.push(
    m.long_pauses
      ? `${plural(m.long_pauses, 'long pause')} (over 2 seconds) while speaking; the longest was ${m.longest_pause_s ?? 0} s`
      : 'No pauses longer than 2 seconds while speaking',
  );
  if (m.words_per_minute) {
    out.push(`Speaking pace of about ${m.words_per_minute} words per minute${m.pace ? ` — ${m.pace}` : ''}`);
  }
  out.push(`${plural(m.student_turns ?? 0, 'turn')}, averaging ${m.average_turn_words ?? 0} words`);
  return out;
}

function deliveryMetrics(language: string, turns: ReportTurn[], segments: ReportSegment[]): DeliveryMetrics {
  const student = turns.filter((t) => t.speaker === 'student' && t.text.trim());
  if (student.length === 0) return { measured: false, reason: 'no_student_speech' };
  if (segments.every((s) => !s.text.trim() || s.voiced_ms === 0)) return { measured: false, reason: TYPED_REASON };
  const total = student.reduce((acc, t) => acc + words(t.text), 0);
  const speakingMs = segments.filter((s) => s.text.trim()).reduce((acc, s) => acc + s.duration_ms, 0);
  const longPauses = segments.reduce((acc, s) => acc + s.long_pauses, 0);
  const longestMs = segments.reduce((acc, s) => Math.max(acc, s.longest_pause_ms), 0);
  const minutes = speakingMs / 60000;
  const wpm = minutes >= 0.1 ? Math.round(total / minutes) : null;
  const english = language === 'en-IN';
  const metrics: DeliveryMetrics = {
    measured: true,
    language,
    student_turns: student.length,
    word_count: total,
    average_turn_words: Math.round(total / student.length),
    short_turns: student.filter((t) => words(t.text) < 12).length,
    speaking_time_s: Math.round(speakingMs / 100) / 10,
    words_per_minute: wpm,
    pace: wpm !== null && english ? paceLabel(wpm) : null,
    long_pauses: longPauses,
    longest_pause_s: Math.round(longestMs / 100) / 10,
    fillers_measured: english,
    interruptions: null,
    interruptions_note: 'Not measured: the room locks turns, so interruptions cannot occur.',
    sources: ['browser voice-activity detection', 'speech transcript'],
  };
  if (english) {
    const text = student.map((t) => t.text).join(' ');
    const hesitations: Record<string, number> = {};
    for (const match of text.matchAll(HESITATION)) {
      const key = hesitationKey(match[1] ?? '');
      hesitations[key] = (hesitations[key] ?? 0) + 1;
    }
    const phrases: Record<string, number> = {};
    for (const [label, pattern] of PHRASES) {
      const n = [...text.matchAll(pattern)].length;
      if (n) phrases[label] = n;
    }
    const fillers = Object.values(hesitations).reduce((a, b) => a + b, 0) + Object.values(phrases).reduce((a, b) => a + b, 0);
    Object.assign(metrics, {
      hesitations,
      filler_phrases: phrases,
      filler_total: fillers,
      fillers_per_100_words: total ? Math.round((1000 * fillers) / total) / 10 : 0,
      possible_restarts: 0,
      filler_note: 'Counted from the transcript; speech recognition can miss some hesitations.',
    });
  }
  metrics.observed = observations(metrics);
  return metrics;
}

interface Said {
  turn: number;
  sentence: string;
}

function factCheck(topicId: string | null, said: Said[]): FactCheck {
  const items: FactCheckItem[] = [];
  const claims = scriptedClaims(topicId);
  for (const { turn, sentence } of said) {
    const scripted = claims.find((c) => c.trigger.test(sentence));
    if (scripted) {
      items.push({
        turn,
        quote: sentence,
        claim: scripted.claim,
        assessment: scripted.assessment,
        explanation: scripted.explanation,
        better_formulation: scripted.betterFormulation,
        confidence: scripted.confidence,
        sources: scripted.sources,
        verified: true,
        reason: null,
      });
    } else if (NUMERIC.test(sentence)) {
      items.push({
        turn,
        quote: sentence,
        claim: sentence,
        assessment: 'unverified',
        explanation: 'The sources we checked did not clearly confirm or contradict this claim.',
        better_formulation: '',
        confidence: 'low',
        sources: [],
        verified: false,
        reason: 'sources_inconclusive',
      });
    }
    if (items.length >= 6) break;
  }
  return { status: items.length ? 'complete' : 'no_claims', source: 'wikipedia', items };
}

function point(title: string, detail: string, said?: Said): ReportPoint {
  return { title, detail, turn: said?.turn ?? null, quote: said?.sentence ?? null };
}

function argument(said: Said | undefined, fields: Omit<ReportArgument, 'turn' | 'quote'>): ReportArgument | null {
  return said ? { turn: said.turn, quote: said.sentence, ...fields } : null;
}

function nextTopic(topic: string): string {
  const all = DEBATE_CATALOG.categories.flatMap((c) => c.topics.map((t) => ({ text: t.text, category: c.id })));
  const current = all.find((t) => t.text === topic)?.category ?? null;
  const candidates = all.filter((t) => t.category !== current && t.text !== topic);
  return candidates[topic.length % Math.max(1, candidates.length)]?.text ?? topic;
}

export function buildScriptedReport(input: ScriptedReportInput): DebateReport {
  const spoken = input.turns.filter((t) => t.text.trim());
  const student = spoken.filter((t) => t.speaker === 'student');
  const studentWords = student.reduce((acc, t) => acc + words(t.text), 0);
  const delivery = deliveryMetrics(input.request.language, input.turns, input.segments);
  const difficulty = DEBATE_CATALOG.difficulties.find((d) => d.id === input.request.difficulty);
  const language = DEBATE_CATALOG.languages.find((l) => l.code === input.request.language);

  const base = {
    session_id: input.sessionId,
    topic: input.topic,
    student_position: input.studentPosition,
    ai_position: input.aiPosition,
    position_assigned_by: input.assignedBy,
    first_speaker: input.request.first_speaker,
    difficulty: input.request.difficulty,
    difficulty_label: difficulty?.label ?? input.request.difficulty,
    language: input.request.language,
    language_name: language?.name ?? input.request.language,
    configured_duration_s: input.request.duration_s,
    actual_duration_s: input.actualDurationS,
    end_reason: input.endReason,
    turn_count: spoken.length,
    student_turns: student.length,
    ai_turns: spoken.length - student.length,
    student_words: studentWords,
    transcript: spoken.map(({ index, speaker, text, status }) => ({ index, speaker, text, status })),
    generated_by: { llm: 'fixture', knowledge: 'fixture' },
    generated_at: new Date().toISOString(),
  };

  if (studentWords < input.minStudentWords) {
    return {
      ...base,
      insufficient: true,
      insufficient_reason:
        'Not enough was said to evaluate this debate fairly' +
        (student.length === 0 ? ' — no arguments were recorded.' : ` — ${plural(studentWords, 'word')} were recorded.`),
      overall_score: null,
      categories: [],
      summary: '',
      strengths: [],
      weaknesses: [],
      fact_check: { status: 'skipped', source: 'wikipedia', items: [] },
      fallacies: [],
      best_argument: null,
      weakest_argument: null,
      ai_strongest_counterargument: null,
      improved_arguments: [],
      structure: null,
      delivery: { metrics: delivery, observed: delivery.observed ?? [], interpretation: '', suggestion: '' },
      practice_plan: [
        'Speak for at least 30 seconds in each turn so there is an argument to respond to.',
        'Open with your main claim in one sentence, then give one reason and one example.',
        'When your opponent asks a question, answer it directly before making a new point.',
      ],
      next_challenge: { topic: input.topic, duration_minutes: 3, focus: 'Building one complete argument: claim, reason, example' },
    };
  }

  const said: Said[] = student.flatMap((t) => sentencesOf(t.text).map((sentence) => ({ turn: t.index, sentence })));
  const byLength = [...said].sort((a, b) => words(b.sentence) - words(a.sentence));
  const aiSaid: Said[] = spoken
    .filter((t) => t.speaker === 'ai')
    .flatMap((t) => sentencesOf(t.text).map((sentence) => ({ turn: t.index, sentence })));
  const generalisation = said.find((s) => GENERALISATION.test(s.sentence));
  const fallacies: ReportFallacy[] = generalisation
    ? [
        {
          type: 'hasty_generalization',
          label: 'Hasty generalization',
          turn: generalisation.turn,
          quote: generalisation.sentence,
          why_weak: 'A sweeping word like "every" or "always" claims more than one example can show, and an opponent only needs one counter-example.',
          how_to_improve: 'Narrow the claim to what you can support: "most", "often", or "in the cases I know of".',
          confidence: 'medium',
        },
      ]
    : [];
  const facts = factCheck(input.topicId, said);
  const wrong = facts.items.find((item) => item.assessment === 'incorrect' || item.assessment === 'partially_correct');
  const overall = Math.round(CATEGORY_SCORES.reduce((acc, c) => acc + c.score * (SCORE_WEIGHTS[c.key] ?? 0), 0));
  const best = byLength[0];
  const weakest = byLength[byLength.length - 1];
  const replied = student.length >= 2;

  return {
    ...base,
    insufficient: false,
    insufficient_reason: null,
    summary: `You argued ${input.studentPosition === 'FOR' ? 'for' : 'against'} the motion with a clear main claim and kept every turn on topic. Your strongest moments came when you gave a reason in the same sentence as the claim. ${
      replied
        ? 'The biggest gap was listening: your opponent asked direct questions, and the next turn moved on instead of answering them.'
        : 'With one turn there was no reply to answer yet; in a longer debate, take on your opponent’s strongest point before adding your own.'
    }`,
    overall_score: overall,
    categories: CATEGORY_SCORES.map((c) => ({ ...c })),
    strengths: [
      point('A clear main claim', 'You stated your position in your first sentence, so the judge never had to guess your side.', said[0]),
      point('Stayed on the motion', 'Every turn connected back to the question being debated.', said[1]),
    ],
    weaknesses: [
      replied
        ? point('Questions left unanswered', 'Your opponent asked you a direct question and your next turn did not answer it, which lets the point stand.', undefined)
        : point('Go beyond one turn', 'A single turn shows your case but not how it stands up to a reply; a longer debate lets you answer the other side.', undefined),
      wrong
        ? point('Evidence needs checking', 'One of your facts did not hold up; a single wrong figure makes listeners doubt the rest.', { turn: wrong.turn, sentence: wrong.quote })
        : point('Support your claims', 'Most of your points were assertions; one example or figure would have made them evidence.', undefined),
    ],
    fallacies,
    best_argument: argument(best, { why_it_worked: 'It joins a claim to a reason and says why it matters, which is the complete shape of an argument.' }),
    weakest_argument: argument(weakest !== best ? weakest : undefined, {
      why_weak: 'It asserts a conclusion without showing the step that leads to it.',
      what_was_missing: 'A reason or an example that makes the claim more than an opinion.',
      how_to_improve: 'Add "because" and one concrete example.',
    }),
    ai_strongest_counterargument: argument(aiSaid[0], {
      why_strong: 'It accepted your premise and then showed that your conclusion does not follow from it.',
      how_you_could_have_responded: 'Answer the question directly, then show why your point survives the objection.',
    }),
    improved_arguments: best
      ? [
          {
            turn: best.turn,
            original: best.sentence,
            stronger_version: `${best.sentence.replace(/[.!?]$/, '')}, and here is why that outweighs the cost my opponent raised: the risk of doing nothing is permanent, while the cost is temporary.`,
            what_changed: 'It weighs your point against the opponent’s strongest objection instead of leaving the comparison to the listener.',
          },
        ]
      : [],
    structure: {
      made_clear_claims: true,
      gave_reasons: true,
      used_evidence_or_examples: said.some((s) => NUMERIC.test(s.sentence) || /example|for instance/i.test(s.sentence)),
      drew_conclusions: false,
      note: 'Each turn opened well but stopped without a closing line tying it back to the motion.',
    },
    fact_check: facts,
    delivery: {
      metrics: delivery,
      observed: delivery.observed ?? [],
      interpretation: delivery.measured ? 'The measured pace and few long pauses suggest a delivery that is easy to follow.' : '',
      suggestion: delivery.measured ? 'Pause for a beat after your main claim so it lands before you give the reason.' : '',
    },
    practice_plan: [...PRACTICE_PLAN],
    next_challenge: { topic: nextTopic(input.topic), duration_minutes: 5, focus: 'Rebuttal: answer the question first, then attack' },
  };
}
