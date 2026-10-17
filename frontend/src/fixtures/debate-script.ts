import type { DebatePosition, FactAssessment, FactSource } from '@/types/debate';

export function positionPhrase(position: DebatePosition): string {
  return position === 'FOR' ? 'IN FAVOUR OF' : 'AGAINST';
}

export function hostOpeningLines(input: {
  topic: string;
  studentPosition: DebatePosition;
  aiPosition: DebatePosition;
  firstSpeaker: 'student' | 'ai';
  durationS: number;
  assignedBySystem: boolean;
}): string[] {
  const minutes = Math.floor(input.durationS / 60);
  return [
    'Welcome to the Emerge Debate Room.',
    `Today's motion is: ${input.topic}`,
    `You will be arguing ${positionPhrase(input.studentPosition)} the motion.` +
      (input.assignedBySystem ? ' Your side was assigned for you.' : ''),
    `Your opponent, the AI Debater, will be arguing ${positionPhrase(input.aiPosition)} the motion.`,
    input.firstSpeaker === 'student' ? 'You will speak first.' : 'Your opponent will speak first.',
    'Take turns, respond directly to your opponent, and support your claims with reasons and evidence.',
    `You have up to ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
    'The debate begins now.',
  ];
}

export function hostClosingLines(reason: 'time_limit' | 'manual'): string[] {
  return [
    reason === 'time_limit' ? 'Time is up. The debate has ended.' : 'The debate has ended.',
    'Thank you for participating. Your debate report is now being prepared.',
  ];
}

export interface ScriptedClaim {
  trigger: RegExp;
  claim: string;
  assessment: FactAssessment;
  explanation: string;
  betterFormulation: string;
  confidence: 'high' | 'medium' | 'low';
  sources: FactSource[];
}

interface ShowcaseMotion {
  student: Record<DebatePosition, string[]>;
  ai: Record<DebatePosition, string[]>;
  claims: ScriptedClaim[];
}

const MARS: ShowcaseMotion = {
  student: {
    FOR: [
      'Humans should colonise Mars because a second home protects our species from a single disaster on Earth.',
      'A day on Mars lasts about 24 hours and 37 minutes, so it is the most Earth-like planet we can actually reach.',
      'Um, the research needed to live there, like recycling water and air, also helps people on Earth.',
      'It only takes about three weeks to fly to Mars, so supply missions are realistic.',
      'My opponent says it costs too much, but every great exploration looked expensive before it paid off.',
      'Mars also has water ice at its poles, which settlers could use for drinking water and fuel.',
    ],
    AGAINST: [
      'We should not colonise Mars because we have not yet fixed the problems on our own planet.',
      'Mars has almost no protection from radiation, because it lacks a global magnetic field.',
      'Um, the money for one Mars mission could pay for clean water projects for millions of people.',
      'Every colony in history needed a way back home, and Mars cannot offer that for years.',
      'My opponent talks about a backup planet, but Mars is far more hostile than any desert on Earth.',
    ],
  },
  ai: {
    AGAINST: [
      'You call Mars a backup for humanity, but a backup has to be able to survive on its own. A colony that depends on supply rockets from Earth fails the moment Earth fails. Which disaster on Earth would leave Mars better off than the worst place on Earth?',
      'You lean on the length of the Martian day, but the day is the only thing that is Earth-like. The air is thin carbon dioxide, the surface is soaked in radiation, and nothing grows in the soil without treatment. Why should one similar number outweigh everything that would kill a settler?',
      'Spin-off technology is real, but it is an argument for research, not for colonisation. Water recycling was improved on the International Space Station, in orbit, without anyone living on Mars. If the benefits come from the research, why do we need the colony at all?',
      'You have not answered my question about which disaster Mars would survive. Until you do, the backup argument rests on an assumption, not a reason.',
    ],
    FOR: [
      'You say we should fix Earth first, but that has never been how progress works. Medicine, farming and space research have always run in parallel. Which problem on Earth would actually be solved faster if we stopped exploring?',
      'Radiation is a serious risk, and it is exactly why settlers would live underground or under ice shielding. Engineering problems are solved by working on them. Is your objection that it is hard, or that it is impossible?',
      'You compare a Mars mission to clean water projects, but the two budgets are not one pot. Space agencies spend a tiny share of public money. Can you show that cancelling Mars would actually redirect that money to water?',
    ],
  },
  claims: [
    {
      trigger: /24 hours and 37 minutes/i,
      claim: 'A day on Mars lasts about 24 hours and 37 minutes.',
      assessment: 'mostly_correct',
      explanation:
        'The Mars article gives a sidereal day of 24 hours 37 minutes, but the solar day settlers would live by is slightly longer, at about 24 hours 39 minutes.',
      betterFormulation: 'A solar day on Mars lasts about 24 hours and 39 minutes, only slightly longer than a day on Earth.',
      confidence: 'high',
      sources: [
        {
          title: 'Mars',
          url: 'https://en.wikipedia.org/wiki/Mars',
          publisher: 'Wikipedia',
          quote: 'The length of a Martian sidereal day is 24 hours 37 minutes and 22.66 seconds',
        },
      ],
    },
    {
      trigger: /three weeks to fly to Mars/i,
      claim: 'It takes about three weeks to fly to Mars.',
      assessment: 'incorrect',
      explanation:
        'Crewed and robotic missions using current rockets take many months to reach Mars, not weeks.',
      betterFormulation: 'With current rockets a trip to Mars takes around seven months, which makes regular supply missions hard.',
      confidence: 'high',
      sources: [
        {
          title: 'Exploration of Mars',
          url: 'https://en.wikipedia.org/wiki/Exploration_of_Mars',
          publisher: 'Wikipedia',
          quote: 'missions to Mars take about seven months',
        },
      ],
    },
    {
      trigger: /water ice at its poles/i,
      claim: 'Mars has water ice at its poles.',
      assessment: 'correct',
      explanation: 'Both polar caps of Mars contain water ice.',
      betterFormulation: '',
      confidence: 'high',
      sources: [
        {
          title: 'Mars',
          url: 'https://en.wikipedia.org/wiki/Mars',
          publisher: 'Wikipedia',
          quote: 'Mars has two permanent polar ice caps',
        },
      ],
    },
    {
      trigger: /lacks a global magnetic field/i,
      claim: 'Mars lacks a global magnetic field.',
      assessment: 'correct',
      explanation: 'Mars has no global magnetic field today, only weak local magnetised regions in its crust.',
      betterFormulation: '',
      confidence: 'medium',
      sources: [
        {
          title: 'Magnetic field of Mars',
          url: 'https://en.wikipedia.org/wiki/Magnetic_field_of_Mars',
          publisher: 'Wikipedia',
          quote: 'Mars does not have a global magnetic field',
        },
      ],
    },
  ],
};

const SHOWCASE: Readonly<Record<string, ShowcaseMotion>> = {
  'science-2': MARS,
};

function genericStudent(position: DebatePosition): string[] {
  const stance = position === 'FOR' ? 'support' : 'oppose';
  return [
    `I ${stance} this motion because it is about fairness for the people it affects most.`,
    'My first reason is practical: when people are trusted with a choice, they usually rise to it.',
    'For example, um, schools that tried this saw students take more responsibility, not less.',
    'In one survey, around seventy percent of students said they wanted this change.',
    'My opponent says it is risky, but every change is risky, and doing nothing has a cost too.',
  ];
}

function genericAi(topic: string, position: DebatePosition, turn: number, quote: string): string {
  const side = position === 'FOR' ? 'in favour of' : 'against';
  const opener = quote ? `You said: "${quote}" ` : '';
  const lines = [
    `${opener}That is a claim, not yet a reason. Arguing ${side} the motion, I would ask what happens to the people who are worse off under your plan. Who pays the cost you have not mentioned?`,
    `${opener}A single survey or a few examples do not show that the change works everywhere. Different schools and families start from different places. What evidence would convince you that your side is wrong?`,
    `${opener}You have described the benefits, but not the trade-off. On the question "${topic}", the strongest case weighs both. Which of my points do you think is weakest, and why?`,
  ];
  return lines[turn % lines.length] ?? lines[0] ?? '';
}

export function scriptedStudentLine(topicId: string | null, position: DebatePosition, seq: number): string {
  const lines = (topicId ? SHOWCASE[topicId]?.student[position] : undefined) ?? genericStudent(position);
  return lines[seq % lines.length] ?? '';
}

export function scriptedAiTurn(input: {
  topicId: string | null;
  topic: string;
  aiPosition: DebatePosition;
  aiTurnNumber: number;
  lastStudentSentence: string;
}): string {
  const scripted = input.topicId ? SHOWCASE[input.topicId]?.ai[input.aiPosition] : undefined;
  const line = scripted?.[input.aiTurnNumber];
  if (line) return line;
  return genericAi(input.topic, input.aiPosition, input.aiTurnNumber, input.lastStudentSentence);
}

export function scriptedClaims(topicId: string | null): ScriptedClaim[] {
  return (topicId ? SHOWCASE[topicId]?.claims : undefined) ?? [];
}

export const CATEGORY_SCORES: readonly { key: string; label: string; score: number; rationale: string }[] = [
  { key: 'argument_quality', label: 'Argument Quality', score: 72, rationale: 'Your main claim was clear and you gave it a reason in the same breath.' },
  { key: 'logical_reasoning', label: 'Logical Reasoning', score: 64, rationale: 'Most steps followed, but one argument jumped from an example to a general rule.' },
  { key: 'rebuttal', label: 'Rebuttal Ability', score: 58, rationale: 'You answered the cost objection but left the opponent’s direct question unanswered.' },
  { key: 'evidence', label: 'Evidence & Facts', score: 61, rationale: 'One figure was accurate, but another was well off, as the fact-check shows.' },
  { key: 'relevance', label: 'Relevance', score: 80, rationale: 'Every turn stayed on the motion.' },
  { key: 'clarity', label: 'Clarity', score: 74, rationale: 'Short sentences and plain words made each point easy to follow.' },
  { key: 'structure', label: 'Structure', score: 66, rationale: 'Claims and reasons were there; a closing summary was missing.' },
  { key: 'persuasiveness', label: 'Persuasiveness', score: 69, rationale: 'Your most concrete example was memorable and would land with an audience.' },
  { key: 'listening', label: 'Listening & Responsiveness', score: 55, rationale: 'You responded to the opponent’s topic but not to its specific question.' },
  { key: 'vocabulary', label: 'Vocabulary', score: 70, rationale: 'Precise, topic-specific words helped each point land.' },
  { key: 'delivery', label: 'Confidence & Delivery', score: 68, rationale: 'A steady pace with few hesitations.' },
];

export const SCORE_WEIGHTS: Readonly<Record<string, number>> = {
  argument_quality: 0.16,
  logical_reasoning: 0.14,
  rebuttal: 0.14,
  evidence: 0.12,
  relevance: 0.08,
  clarity: 0.08,
  structure: 0.08,
  persuasiveness: 0.08,
  listening: 0.06,
  vocabulary: 0.03,
  delivery: 0.03,
};

export const PRACTICE_PLAN: readonly string[] = [
  'Answer your opponent’s question in your first sentence before you add a new point.',
  'Check one number before you use it; a wrong figure costs more than no figure.',
  'Close each turn with one sentence that says why your point wins the debate.',
  'Turn one example into evidence by saying how typical it is.',
];
