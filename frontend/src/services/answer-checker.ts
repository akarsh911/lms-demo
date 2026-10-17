import { config } from '@/config';
import type { ServiceName } from '@/constants/services';
import * as checker from '@/fixtures/answer-checker';
import * as paperFixtures from '@/fixtures/answer-checker-paper';
import { reseedCheckerFixtures, seedCheckerFixtures } from '@/fixtures/answer-checker-seed';
import * as sessions from '@/fixtures/answer-checker-sessions';
import { exportZip } from '@/fixtures/answer-checker-zip';
import { LIVE_DEMO_PAPER_IDS } from '@/fixtures/data/answer-checker-demo';
import { demoPaperArtefacts, demoPaperFile } from '@/fixtures/paper-files';
import { fixtureSetterPaper } from '@/fixtures/papers';
import type {
  BookletRef,
  BookletResult,
  CaptureAdded,
  CaptureFinished,
  CaptureSession,
  CaptureSessionDetail,
  CheckerExam,
  CheckerExamDetail,
  CheckerExamIn,
  CheckerExamSummary,
  CheckerHealth,
  CheckerJob,
  ClassResults,
  DocumentsSaved,
  IdentityIn,
  MarkedBooklet,
  OmrAnswerKey,
  OmrSheetRead,
  PaperArtefacts,
  PresetStrictness,
  QuestionEdit,
  RemarkResult,
  RubricWithAudit,
  TypedSheet,
} from '@/types/answer-checker';
import type { Paper, PaperSummary } from '@/types/papersetter';
import type { EnrichedPassage } from '@/types/retrieval';

import { ApiError, createServiceApi, papersApi, serviceUrl } from './api';
import { dev, fixtureServed, liveOrFixture, liveUnderBypass } from './dev-bypass';
import { omrService } from './omr';
import { paperService } from './papersetter';
import { retrievalService } from './retrieval';

const CHECKER: ServiceName = 'answerchecker';
const SETTER: ServiceName = 'papersetter';
const REFERENCES_PER_QUESTION = 2;
const SEEDED_BACKENDS: readonly ServiceName[] = ['gapanalyzer', 'lessonplanner'];

function skipDisabledReset(cause: unknown): null {
  if (cause instanceof ApiError && cause.status === 404 && cause.code === 'demo_reset_disabled') return null;
  throw cause;
}

const checkerApi = createServiceApi(CHECKER);

if (fixtureServed(CHECKER)) seedCheckerFixtures();

function detailOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => (item as { msg?: unknown }).msg).filter((msg) => typeof msg === 'string').join('; ') || null;
  return null;
}

async function explained<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (cause) {
    const detail = cause instanceof ApiError ? detailOf(cause.details) : null;
    if (cause instanceof ApiError && detail) throw new ApiError(cause.status, cause.code, detail, cause.details);
    throw cause;
  }
}

async function send(service: ServiceName, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(serviceUrl(service, path), { credentials: 'same-origin', ...init });
  if (response.ok) return response;
  const body: unknown = await response.json().catch(() => null);
  const message = detailOf(body) ?? `Request failed with status ${response.status}`;
  throw new ApiError(response.status, 'request_failed', message, body);
}

const postForm = async <T>(path: string, form: FormData): Promise<T> =>
  (await (await send(CHECKER, path, { method: 'POST', body: form })).json()) as T;

const checkerCall = <T>(name: string, live: () => Promise<T>, fixture: () => T): Promise<T> =>
  liveOrFixture(CHECKER, name, () => explained(live()), () => dev(fixture));

const exam = (examId: string, rest = ''): string => `exams/${encodeURIComponent(examId)}${rest}`;
const booklet = (examId: string, bookletId: string, rest = ''): string =>
  exam(examId, `/booklets/${encodeURIComponent(bookletId)}${rest}`);

export const answerCheckerService = {
  fromFixtures: (): boolean => fixtureServed(CHECKER),

  resetDemo: async (): Promise<void> => {
    if (!config.devBypass) throw new ApiError(403, 'forbidden', 'The demo can only be reset under the dev bypass.');
    await omrService.clearSheets(LIVE_DEMO_PAPER_IDS.omr);
    await omrService.reseedDemo();
    if (fixtureServed(CHECKER)) reseedCheckerFixtures();
    for (const service of SEEDED_BACKENDS.filter(liveUnderBypass)) await createServiceApi(service).post<Record<string, number>>('demo/reset').catch(skipDisabledReset);
  },

  health: (signal?: AbortSignal): Promise<CheckerHealth> =>
    checkerCall('health', () => checkerApi.get<CheckerHealth>('health', undefined, signal), checker.health),

  listExams: (signal?: AbortSignal): Promise<CheckerExamSummary[]> =>
    checkerCall('listExams', () => checkerApi.get<CheckerExamSummary[]>('exams', undefined, signal), checker.listExams),

  createExam: (body: CheckerExamIn): Promise<CheckerExam> =>
    checkerCall('createExam', () => checkerApi.post<CheckerExam>('exams', body), () => checker.createExam(body)),

  getExam: (examId: string, signal?: AbortSignal): Promise<CheckerExamDetail> =>
    checkerCall('getExam', () => checkerApi.get<CheckerExamDetail>(exam(examId), undefined, signal), () => checker.getExam(examId)),

  uploadDocuments: (examId: string, source: Paper, paper: Blob | null, key: Blob | null): Promise<DocumentsSaved> =>
    checkerCall(
      'uploadDocuments',
      () => {
        const form = new FormData();
        if (paper) form.append('paper', paper, 'question_paper.pdf');
        if (key) form.append('key', key, 'answer_key.pdf');
        return postForm<DocumentsSaved>(exam(examId, '/documents'), form);
      },
      () => checker.uploadDocuments(examId, { paper: paper !== null, key: key !== null }, source),
    ),

  compileRubric: (examId: string): Promise<CheckerJob> =>
    checkerCall('compileRubric', () => checkerApi.post<CheckerJob>(exam(examId, '/rubric/compile'), {}), () => checker.compileRubric(examId)),

  getRubric: (examId: string, signal?: AbortSignal): Promise<RubricWithAudit> =>
    checkerCall('getRubric', () => checkerApi.get<RubricWithAudit>(exam(examId, '/rubric'), undefined, signal), () => checker.getRubric(examId)),

  approveRubric: (examId: string): Promise<{ approved: boolean; version: number }> =>
    checkerCall('approveRubric', () => checkerApi.post<{ approved: boolean; version: number }>(exam(examId, '/rubric/approve'), {}), () => checker.approveRubric(examId)),

  setStrictness: (examId: string, level: PresetStrictness): Promise<{ default: string }> =>
    checkerCall('setStrictness', () => checkerApi.put<{ default: string }>(exam(examId, '/strictness'), { level }), () => checker.setStrictness(examId, level)),

  uploadScans: (examId: string, files: readonly File[], expectedBooklets: number | null): Promise<CheckerJob> =>
    checkerCall(
      'uploadScans',
      () => {
        const form = new FormData();
        for (const file of files) form.append('files', file, file.name);
        if (expectedBooklets !== null) form.append('expected_booklets', String(expectedBooklets));
        return postForm<CheckerJob>(exam(examId, '/uploads'), form);
      },
      () => checker.uploadScans(examId, files.map((file) => file.name)),
    ),

  startSession: (examId: string): Promise<CaptureSession> =>
    checkerCall('startSession', () => checkerApi.post<CaptureSession>(exam(examId, '/sessions'), { split_spreads: true }), () => sessions.startSession(examId)),

  getSession: (examId: string, sessionId: string, signal?: AbortSignal): Promise<CaptureSessionDetail> =>
    checkerCall(
      'getSession',
      () => checkerApi.get<CaptureSessionDetail>(exam(examId, `/sessions/${encodeURIComponent(sessionId)}`), undefined, signal),
      () => sessions.getSession(examId, sessionId),
    ),

  sendPage: (examId: string, sessionId: string, frame: Blob): Promise<CaptureAdded> =>
    checkerCall(
      'sendPage',
      () => {
        const form = new FormData();
        form.append('frame', frame, 'frame.jpg');
        return postForm<CaptureAdded>(exam(examId, `/sessions/${encodeURIComponent(sessionId)}/pages`), form);
      },
      () => sessions.sessionPage(examId, sessionId),
    ),

  nextStudent: (examId: string, sessionId: string, supplementary: boolean): Promise<CaptureSession> =>
    checkerCall(
      'nextStudent',
      () => checkerApi.post<CaptureSession>(exam(examId, `/sessions/${encodeURIComponent(sessionId)}/next`), { supplementary }),
      () => sessions.sessionNext(examId, sessionId, supplementary),
    ),

  undoPage: (examId: string, sessionId: string): Promise<{ removed: string | null; session: CaptureSession }> =>
    checkerCall(
      'undoPage',
      () => checkerApi.post<{ removed: string | null; session: CaptureSession }>(exam(examId, `/sessions/${encodeURIComponent(sessionId)}/undo`), {}),
      () => sessions.sessionUndo(examId, sessionId),
    ),

  finishSession: (examId: string, sessionId: string): Promise<CaptureFinished> =>
    checkerCall(
      'finishSession',
      () => checkerApi.post<CaptureFinished>(exam(examId, `/sessions/${encodeURIComponent(sessionId)}/finish`), {}),
      () => sessions.finishSession(examId, sessionId),
    ),

  importTyped: (examId: string, sourceLabel: string, sheets: readonly TypedSheet[]): Promise<CheckerJob> =>
    fixtureServed(CHECKER)
      ? dev(() => checker.uploadScans(examId, [sourceLabel], { source: sourceLabel, typedSheets: sheets }))
      : Promise.reject(new ApiError(501, 'not_built', 'The answer-sheet checker reads scanned booklets only; typed answers are marked by the fixture checker or, for MCQ papers, by the OMR service.')),

  listBooklets: (examId: string, signal?: AbortSignal): Promise<BookletRef[]> =>
    checkerCall('listBooklets', () => checkerApi.get<BookletRef[]>(exam(examId, '/booklets'), undefined, signal), () => checker.listBooklets(examId)),

  getBooklet: (examId: string, bookletId: string, signal?: AbortSignal): Promise<MarkedBooklet> =>
    checkerCall(
      'getBooklet',
      () => checkerApi.get<MarkedBooklet>(booklet(examId, bookletId), undefined, signal),
      () => checker.getBooklet(examId, bookletId),
    ),

  setIdentity: (examId: string, bookletId: string, body: IdentityIn): Promise<BookletRef> =>
    checkerCall(
      'setIdentity',
      () => checkerApi.put<BookletRef>(booklet(examId, bookletId, '/identity'), body),
      () => checker.setIdentity(examId, bookletId, body),
    ),

  confirmAll: (examId: string, minConfidence: number): Promise<{ confirmed: number; remaining: number }> =>
    checkerCall(
      'confirmAll',
      () => checkerApi.post<{ confirmed: number; remaining: number }>(exam(examId, '/booklets/confirm-all'), { min_confidence: minConfidence }),
      () => checker.confirmAll(examId, minConfidence),
    ),

  markAll: (examId: string, only: readonly string[] | null): Promise<CheckerJob> =>
    checkerCall('markAll', () => checkerApi.post<CheckerJob>(exam(examId, '/mark'), { only }), () => checker.markAll(examId, only)),

  remark: (examId: string, bookletId: string, strictness: PresetStrictness): Promise<RemarkResult> =>
    checkerCall(
      'remark',
      () => checkerApi.post<RemarkResult>(booklet(examId, bookletId, '/remark'), { strictness }),
      () => checker.remark(examId, bookletId, strictness),
    ),

  editQuestion: (examId: string, bookletId: string, number: string, body: QuestionEdit): Promise<BookletResult> =>
    checkerCall(
      'editQuestion',
      () => checkerApi.put<BookletResult>(booklet(examId, bookletId, `/questions/${encodeURIComponent(number)}`), body),
      () => checker.editQuestion(examId, bookletId, number, body),
    ),

  signOff: (examId: string, bookletId: string): Promise<{ signed_off: string }> =>
    checkerCall('signOff', () => checkerApi.post<{ signed_off: string }>(booklet(examId, bookletId, '/sign-off'), {}), () => checker.signOff(examId, bookletId)),

  results: (examId: string, signal?: AbortSignal): Promise<ClassResults> =>
    checkerCall('results', () => checkerApi.get<ClassResults>(exam(examId, '/results'), undefined, signal), () => checker.results(examId)),

  exportCsv: (examId: string): Promise<string> =>
    checkerCall('exportCsv', async () => (await send(CHECKER, exam(examId, '/export.csv'), { method: 'GET' })).text(), () => checker.exportCsv(examId)),

  job: (jobId: string, signal?: AbortSignal): Promise<CheckerJob> =>
    checkerCall('job', () => checkerApi.get<CheckerJob>(`jobs/${encodeURIComponent(jobId)}`, undefined, signal), () => checker.job(jobId)),

  pageImageUrl: (examId: string, bookletId: string, index: number): string =>
    fixtureServed(CHECKER) ? checker.pageImage(examId, bookletId, index) : serviceUrl(CHECKER, booklet(examId, bookletId, `/pages/${index}`)),

  downloadZip: (examId: string): Promise<Blob> =>
    liveOrFixture(CHECKER, 'downloadZip', async () => (await send(CHECKER, exam(examId, '/export.zip'), { method: 'GET' })).blob(), () => dev(() => exportZip(examId))),

  pdfUrl: (examId: string, bookletId: string): string | null =>
    fixtureServed(CHECKER) ? null : serviceUrl(CHECKER, booklet(examId, bookletId, '/pdf')),
};

const papersServedFromFixtures = (): boolean => fixtureServed(SETTER);

const setLocally = (paperId: string): boolean =>
  papersServedFromFixtures() || fixtureSetterPaper(paperId) !== undefined || (config.devBypass && paperFixtures.extraSetterPaper(paperId) !== undefined);

export const checkingPaperService = {
  listPapers: async (signal?: AbortSignal): Promise<PaperSummary[]> => {
    const papers = await paperService.listPapers(signal);
    if (!config.devBypass) return papers;
    const listed = new Set(papers.map((paper) => paper.paper_id));
    return [...papers, ...paperFixtures.extraSetterPapers().filter((paper) => !listed.has(paper.paper_id))];
  },

  getPaper: (paperId: string, signal?: AbortSignal): Promise<Paper> => {
    const extra = config.devBypass ? paperFixtures.extraSetterPaper(paperId) : undefined;
    return extra ? dev(() => extra) : paperService.getPaper(paperId, signal);
  },

  artefacts: (paperId: string, signal?: AbortSignal): Promise<PaperArtefacts> => {
    const demo = demoPaperArtefacts(paperId);
    if (demo) return dev(() => demo);
    return setLocally(paperId)
      ? dev(() => paperFixtures.paperArtefacts(paperId))
      : liveOrFixture(
      SETTER,
      'paperArtefacts',
      () => papersApi.get<PaperArtefacts>(`api/v1/papers/${encodeURIComponent(paperId)}`, undefined, signal),
      () => dev(() => paperFixtures.paperArtefacts(paperId)),
    );
  },

  artefactFile: (paperId: string, name: string): Promise<Blob> =>
    demoPaperFile(paperId, name) ??
    (setLocally(paperId)
      ? dev(() => new Blob([`${paperId}/${name}`], { type: 'application/pdf' }))
      : liveOrFixture(
      SETTER,
      'paperArtefactFile',
      async () => (await send(SETTER, `api/v1/papers/${encodeURIComponent(paperId)}/files/${encodeURIComponent(name)}`, { method: 'GET' })).blob(),
      () => dev(() => new Blob([`${paperId}/${name}`], { type: 'application/pdf' })),
    )),

  answerKey: (paper: Paper): Promise<{ key: OmrAnswerKey; generated: boolean }> =>
    config.devBypass
      ? dev(() => paperFixtures.objectiveKey(paper))
      : Promise.reject(new ApiError(501, 'not_built', 'The paper setter does not release its answer key, so bubble sheets cannot be scored here yet.')),

  sampleBubbleSheets: (paper: Paper, klass: string): Promise<OmrSheetRead[]> =>
    config.devBypass
      ? dev(() => paperFixtures.bubbleSheets(paper, klass), 600)
      : Promise.reject(new ApiError(501, 'not_built', 'Sample readings exist only under the dev bypass. Upload scanned sheets or enter the bubbles by hand.')),

  references: async (paper: Paper, n: number, text: string, signal?: AbortSignal): Promise<EnrichedPassage[]> => {
    const fixture = fixtureServed('retrieval') ? paperFixtures.referencePassages(paper.paper_id, n) : null;
    if (fixture) return dev(() => fixture);
    const grade = Number.parseInt(paper.class_id ?? '', 10);
    if (!paper.subject || !Number.isFinite(grade)) return [];
    const { books } = await retrievalService.books(paper.subject, grade, signal);
    const book = books[0];
    if (!book) return [];
    const scoped = await retrievalService.scoped(
      { document_ids: [book.id], query: text, top_k: REFERENCES_PER_QUESTION, extraction_sources: ['pdf'] },
      signal,
    );
    return scoped.passages;
  },
};
