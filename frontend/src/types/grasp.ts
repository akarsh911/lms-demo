export type AnswerMode = 'typed' | 'sheet' | 'either';

export type Band = 'understood' | 'not_written' | 'not_learnt' | 'unclear';

export type AttemptStage = 'answering' | 'checking' | 'done';

export interface GraspQuestion {
  readonly id: string;
  readonly number: number;
  readonly text: string;
  readonly marks: number;
}

export interface StudentAnswer {
  readonly questionId: string;
  readonly text: string;
}

/** One readback question as the server keeps it: the answer index never leaves the server before scoring. */
export interface ReadbackItem {
  readonly id: string;
  readonly questionId: string;
  readonly kind: 'fast' | 'slow';
  readonly prompt: string;
  readonly options: readonly string[];
  readonly answer: number;
  /** The line of the student's own answer the item was built from. */
  readonly source: string;
  readonly topic: string;
}

/** What the student's phone receives. */
export interface ReadbackPrompt {
  readonly id: string;
  readonly kind: 'fast' | 'slow';
  readonly prompt: string;
  readonly options: readonly string[];
  /** Null for the untimed question. */
  readonly seconds: number | null;
}

export interface ReadbackResponse {
  readonly itemId: string;
  /** Null when the clock ran out. */
  readonly choice: number | null;
  readonly ms: number;
}

export interface Verdict {
  readonly band: Band;
  readonly fastCorrect: number;
  readonly fastTotal: number;
  readonly slowOk: boolean;
  readonly medianMs: number | null;
  readonly timeouts: number;
}

export interface GraspAttempt {
  readonly id: string;
  readonly name: string;
  readonly roll: string;
  readonly stage: AttemptStage;
  readonly joinedAt: string;
  readonly submittedAt: string | null;
  readonly via: 'typed' | 'sheet';
  readonly sheetNames: readonly string[];
  readonly answers: readonly StudentAnswer[];
  readonly items: readonly ReadbackItem[];
  readonly responses: readonly ReadbackResponse[];
  readonly verdict: Verdict | null;
}

export interface GraspCheckSettings {
  readonly title: string;
  readonly subject: string;
  readonly section: string;
  readonly answerMode: AnswerMode;
  readonly checkCount: 3 | 4;
  readonly seconds: number;
  readonly questions: readonly GraspQuestion[];
  /** The question-bank set the questions came from, which carries ready readback material. */
  readonly setId: string | null;
}

export interface GraspCheck extends GraspCheckSettings {
  readonly id: string;
  readonly code: string;
  readonly teacher: string;
  readonly createdAt: string;
  readonly status: 'live' | 'closed';
  readonly attempts: readonly GraspAttempt[];
}

export type BandCounts = Readonly<Record<Band, number>>;

export interface GraspCheckSummary {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly subject: string;
  readonly section: string;
  readonly teacher: string;
  readonly createdAt: string;
  readonly status: 'live' | 'closed';
  readonly questionCount: number;
  readonly joined: number;
  readonly finished: number;
  readonly bands: BandCounts;
}

/** The join page's view of a check: no answers, no other students. */
export interface GraspJoinView {
  readonly code: string;
  readonly title: string;
  readonly subject: string;
  readonly section: string;
  readonly teacher: string;
  readonly status: 'live' | 'closed';
  readonly answerMode: AnswerMode;
  readonly checkCount: number;
  readonly seconds: number;
  readonly questions: readonly GraspQuestion[];
  /** Sample answer sheets for this homework, so a demo phone has something to photograph. */
  readonly sampleSheets: readonly { readonly file: string; readonly label: string }[];
}

export interface BankSet {
  readonly id: string;
  readonly title: string;
  readonly subject: string;
  readonly grade: string;
  readonly kind: 'prose' | 'problem-set';
  readonly questions: readonly GraspQuestion[];
}

export interface SheetReading {
  readonly answers: readonly StudentAnswer[];
  /** False when the sheet was not one the demo reader knows and a stand-in transcript was used. */
  readonly recognised: boolean;
}

export interface PaperReading {
  readonly setId: string | null;
  readonly title: string;
  readonly subject: string;
  readonly questions: readonly GraspQuestion[];
}

export interface SampleFile {
  readonly file: string;
  readonly label: string;
  readonly kind: 'paper' | 'sheet';
  readonly setId: string;
}
