'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';

import { GuidedTour, TrainerRun, type TourStep } from '@labs/components/guided-tour';
import { CoachMessage, StepStrip } from '@/components/ui';
import { WidgetFrame } from '@/components/widgets/widget-frame';
import { useSubmitLabAttempt } from '@labs/hooks/mutation/use-submit-lab-attempt';
import { useBenchSession } from '@labs/hooks/use-bench-session';
import { useElementSize } from '@/hooks/use-element-width';
import { useInterval } from '@/hooks/use-interval';
import { useStore } from '@/hooks/use-store';
import { scaledForNoViva } from '@labs/lib/marking';
import { formatClock } from '@labs/lib/numbers';
import { parseSeed, randomSeed, siblingSeed } from '@labs/lib/seed';
import { isResumable, probe, shapeOf, shiftClock } from '@labs/lib/session-record';
import { addHistory, dropSession, readSession } from '@labs/lib/session-store';
import { createStore } from '@/lib/store';
import type { LabSessionRecord } from '@labs/lib/session-record';
import type { Message } from '@labs/lib/types';
import type { BenchDefinition, BenchTourContext } from '@labs/types/lab-bench';

import { BenchConsole, type SaveStatus } from './bench-console';
import { LabShell, labShellMode } from './lab-shell';
import { LabHelpMenu, LabStats, PracticalMenu } from './bench-header';
import { ReadingSheet } from './reading-sheet';
import { ResumeOffer } from './resume-offer';
import { useLabFeature } from './lab-features';
import { TeachPanel, TeachToggle, teachTitleFor } from './teach-panel';
import { apparatus } from './apparatus-palette';

/**
 * The workspace every practical runs in.
 *
 * It owns everything that is the same on every bench: the frame and its
 * header, the procedure strip, the apparatus stage, the assistant's line, the
 * console, the clock, the tours and their sandbox, and handing the finished
 * attempt to the labs service. A bench supplies its engine and its stage; see
 * `@labs/types/lab-bench.ts`.
 *
 * Client-only (the widget loads it with `ssr: false`): a bench is seeded at
 * random, remembers a first visit in local storage and drives animation
 * frames, none of which has a server rendering.
 */
const TOUR_SEEN_PREFIX = 'emerge.labs.';

type TourKind = 'controls' | 'build' | 'trainer';

/** Stable identity, so a bench with no demonstrations re-renders nothing. */
const EMPTY_TRAINER: Readonly<Record<number, never>> = {};

interface TourState<S, A> {
  kind: TourKind;
  index: number;
  /** The practical, parked while the tour runs on a sandbox bench. */
  saved: S;
  startedAt: number;
  /**
   * The trainer's script, FROZEN at the moment it started.
   *
   * A demonstration runs on the student's own bench, so it can move the
   * procedure on — and the script is chosen BY procedure step. Left live, a
   * demonstration that completed its step would swap its own remaining steps
   * out from under itself mid-run. Holding the array here means a demonstration
   * is free to carry a step through to the end.
   */
  script?: readonly TourStep<BenchTourContext<S, A>>[];
}

function tourSeen(id: string): boolean {
  try {
    return window.localStorage.getItem(`${TOUR_SEEN_PREFIX}${id}.tourSeen`) === '1';
  } catch {
    return false;
  }
}

function markTourSeen(id: string): void {
  try {
    window.localStorage.setItem(`${TOUR_SEEN_PREFIX}${id}.tourSeen`, '1');
  } catch {
    /* preference only */
  }
}

export function BenchWorkspace<S, A>({
  definition,
  onChoosePractical,
}: {
  definition: BenchDefinition<S, A>;
  /** Switch to another practical, or back to the list with `null`. */
  onChoosePractical?: (id: string | null) => void;
}): React.ReactElement {
  const { engine, ui } = definition;
  const params = useSearchParams();

  const sandboxMessage = (kind: TourKind): Message => ({
    tone: 'info',
    text:
      kind === 'trainer'
        ? 'Watch — nothing here is marked, and the bench goes back exactly as you left it.'
        : `${kind === 'build' ? 'Guided build' : 'Tutorial'} running — nothing you do now is marked. Your practical is paused and will be exactly as you left it.`,
  });

  // Read before the store is built: an administrator who has switched the
  // tutorial off must not get one opened on the first render and closed on the
  // second. The provider above does not mount this component until it knows.
  const hasTutorial = useLabFeature('tutorial');
  const hasGuidedBuild = useLabFeature('guidedBuild');
  // Fixed when a bench is built, never read later: the reducer marks each viva
  // answer against the paper the student was shown, so the paper cannot be
  // allowed to change underneath a half-finished viva.
  const vivaShuffled = useLabFeature('vivaShuffle');
  // The teaching layer. `teachable` false means it is not built at all, which is
  // what an administrator switching `teach` off has to mean.
  const hasTeach = useLabFeature('teach');
  const hasViva = useLabFeature('viva');
  const hasTrainer = useLabFeature('trainer');
  // Whether a finished attempt is handed to the service at all.
  const postsAttempt = useLabFeature('attemptPost');
  const [teachOpen, setTeachOpen] = React.useState(false);
  /** The panel moved out of the console and into the reading sheet. */
  const [teachExpanded, setTeachExpanded] = React.useState(false);
  const initOptions = React.useMemo(() => ({ vivaShuffled }), [vivaShuffled]);

  const [init] = React.useState(() => {
    const at = Date.now();
    const practical = engine.init(parseSeed(params.get('bench')) ?? randomSeed(), at, undefined, initOptions);
    // Taken from a FRESH bench, here, once. It is what a saved state is checked
    // against before it is allowed anywhere near the reducer — and comparing
    // fresh against fresh is the only comparison that stays stable while a
    // student works. See `@labs/lib/session-record.ts`.
    const shape = shapeOf(practical);
    const wanted = hasTutorial && (params.has('tutorial') || !tourSeen(engine.meta.id));
    if (!wanted || !ui.tours) return { store: createStore(engine.reducer, practical), tour: null, shape };
    return {
      shape,
      // The tour runs on a sandbox bench, so the practical is untouched and
      // its clock has not started.
      store: createStore(
        engine.reducer,
        engine.init(seedOf(practical) ?? randomSeed(), at, sandboxMessage('controls'), initOptions),
      ),
      tour: { kind: 'controls' as TourKind, index: 0, saved: practical, startedAt: at },
    };
  });

  const { store, shape } = init;
  const { dispatch } = store;
  const state = useStore(store);
  const [tour, setTour] = React.useState<TourState<S, A> | null>(init.tour);
  const submit = useSubmitLabAttempt();
  const now = React.useCallback(() => Date.now(), []);
  // Built only when the flag allows it AND the bench has something to say yet.
  const teachable = hasTeach && (Boolean(ui.Teach) || Boolean(ui.teachToggle)) && (ui.showTeach?.(state) ?? true);
  // A bench that draws its teaching layer into the apparatus owns the switch;
  // everything else lets the workspace hold it.
  const teachIsOpen = ui.teachOpen ? ui.teachOpen(state) : teachOpen;
  const toggleTeach = (): void => {
    if (ui.teachToggle) dispatch(ui.teachToggle(!teachIsOpen));
    else setTeachOpen((v) => !v);
  };

  // How much room the workspace has decides the shape of everything below.
  const [measureShell, shell] = useElementSize();
  const mode = labShellMode(shell?.width ?? null);

  // The bench's own clock, if it has one.
  const ticker = engine.tick;
  useInterval(() => {
    if (ticker) dispatch(ticker(0.1, Date.now()));
  }, 100, Boolean(ticker));

  // --- attempt hand-off -----------------------------------------------------
  // Header figures always come from the PRACTICAL, never the tour's sandbox: a
  // tutorial must not look as though it is being scored.
  const shown = tour ? tour.saved : state;

  const submitAttempt = (finished: S): void => {
    if (!postsAttempt) return;
    submit.mutate({ bench: engine.meta.id, record: engine.attempt(finished) });
  };

  /**
   * The student's own copy of a finished practical.
   *
   * Written whatever the service does, and deliberately not conditional on
   * `postsAttempt`: the posted attempt is the SCHOOL's record, and a student
   * whose school has switched posting off still did the practical and should
   * still be able to look back at it. Marks are rescaled here exactly as the
   * result card rescales them, so the history cannot report a different score
   * from the one the student was shown.
   */
  const recordFinish = (finished: S): void => {
    const scoreOf = engine.score(finished);
    const { parts, scale } = scaledForNoViva(
      engine.marks.map((m) => ({ key: m.key, max: m.max, basis: m.basis })),
      hasViva,
    );
    const labels = new Map(engine.marks.map((m) => [m.key, m.label]));
    const seed = seedOf(finished);
    const at = Date.now();
    addHistory({
      id: `${engine.meta.id}-${seed ?? 0}-${at}`,
      bench: engine.meta.id,
      title: engine.meta.title,
      subtitle: engine.meta.subtitle,
      seed,
      finishedAt: at,
      elapsedMs: elapsedOf(finished, at),
      score: +parts.reduce((a, m) => a + (scoreOf[m.key] ?? 0) * scale, 0).toFixed(2),
      max: +parts.reduce((a, m) => a + m.max, 0).toFixed(2),
      summary: engine.summary(finished),
      parts: parts.map((m) => ({
        label: labels.get(m.key) ?? m.key,
        earned: +((scoreOf[m.key] ?? 0) * scale).toFixed(2),
        max: +m.max.toFixed(2),
      })),
    });
  };

  /**
   * Finished for the purposes of the workspace. With the viva removed there is
   * nothing to ask after the conclusion, so arriving at what would have been
   * the viva step ends the practical.
   */
  const isFinished = (s: S): boolean =>
    engine.done(s) || (!hasViva && engine.step(s) >= engine.steps.length - 1);

  const save: SaveStatus = submit.isPending
    ? { state: 'saving' }
    : submit.isSuccess
      ? { state: 'saved' }
      : submit.isError
        ? { state: 'error', retry: () => submit.mutate(submit.variables!) }
        : { state: 'idle' };

  /** Dispatch, and post the attempt the moment this action completed the practical. */
  const dispatchAndWatch = React.useCallback(
    (action: A): S => {
      const before = isFinished(store.getState());
      const next = dispatch(action);
      if (!tour && !before && isFinished(next)) {
        submitAttempt(next);
        recordFinish(next);
      }
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatch, store, tour],
  );

  // --- keeping the bench ----------------------------------------------------
  /**
   * An unfinished bench found on this machine, waiting to be offered back.
   *
   * Read once, during the first render, and only OFFERED — never applied. A
   * student who followed a link to a particular bench, or who means to start
   * again, must not be dropped into an old attempt because the browser
   * remembered one. All three gates in `session-record.ts` have to pass first,
   * the last of them by running the engine's own accessors over the stored
   * state and catching anything they throw.
   */
  const [offer, setOffer] = React.useState<LabSessionRecord | null>(() => {
    const record = readSession(engine.meta.id);
    if (!record || record.shape !== shape || !isResumable(record)) return null;
    return probe(engine, record.state) ? record : null;
  });

  useBenchSession({
    engine,
    // Always the practical. A tour and the trainer run on a sandbox copy, and
    // saving that would resume the student into the middle of a rehearsal.
    state: shown,
    shape,
    seed: seedOf(shown),
    startedAt: clockOf(shown).t0,
    endedAt: clockOf(shown).tEnd,
    done: isFinished(shown),
    // A tour cannot change the practical, so there is nothing new to write
    // while one holds the bench.
    enabled: tour === null,
  });

  const resume = (record: LabSessionRecord): void => {
    if (!probe(engine, record.state)) {
      dropSession(engine.meta.id);
      setOffer(null);
      return;
    }
    // The clock measures time AT THE BENCH, so the hours the tab was closed are
    // given back rather than charged to the student.
    store.replace(shiftClock(record.state as S, Date.now() - record.savedAt));
    submit.reset();
    setTour(null);
    setOffer(null);
  };

  // --- restarting -----------------------------------------------------------
  const restart = (seed: number): void => {
    if (tour) return;
    store.replace(engine.init(seed, Date.now(), undefined, initOptions));
    submit.reset();
    // A fresh bench is the one act that genuinely discards the old one, so the
    // saved session goes with it. Left behind, it would offer on the next visit
    // to resume a practical the student has already chosen to abandon.
    dropSession(engine.meta.id);
    setOffer(null);
  };

  // --- the URL remembers which bench, so a teacher can reproduce it ---------
  const practicalSeed = seedOf(tour ? tour.saved : state);
  React.useEffect(() => {
    if (practicalSeed === null) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('bench') === String(practicalSeed)) return;
    url.searchParams.set('bench', String(practicalSeed));
    url.searchParams.delete('tutorial');
    window.history.replaceState(window.history.state, '', url);
  }, [practicalSeed]);

  // --- tours ----------------------------------------------------------------
  const [stageEl, setStageEl] = React.useState<Element | null>(null);
  const [bodyEl, setBodyEl] = React.useState<HTMLElement | null>(null);
  const frameEl = bodyEl?.closest('[data-widget-frame]') ?? null;
  const container = frameEl instanceof HTMLElement ? frameEl : undefined;

  const tourCtx = React.useMemo<BenchTourContext<S, A>>(
    () => ({
      state,
      dispatch,
      now,
      stage: () => stageEl,
      find: (name) => frameEl?.querySelector(`[data-tour="${name}"]`) ?? null,
    }),
    [state, dispatch, now, stageEl, frameEl],
  );

  const tourSets = React.useMemo(
    () => ui.tours?.({ ...tourCtx }) ?? {},
    // The step list only depends on where things ARE, not on the live state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ui, stageEl, frameEl],
  );

  /**
   * The trainer's demonstrations, keyed by procedure step. Recomputed as the
   * step changes — unlike a tour, which is the same walk whatever the student
   * has done, this one is about the step they are standing on.
   */
  const procedureStep = engine.step(state);
  // Called at the TOP LEVEL, never inside a memo: `useTrainer` is a hook (every
  // bench reads the `teach` flag inside it to leave out cards that demonstrate
  // a layer that is switched off). `ui` belongs to the definition and the
  // workspace is keyed by practical, so whether this bench has one never
  // changes for the life of the mount.
  const trainerSets = ui.useTrainer?.({ ...tourCtx }) ?? EMPTY_TRAINER;
  const trainerSteps = trainerSets[procedureStep] ?? [];

  const steps =
    (tour
      ? tour.kind === 'trainer'
        ? (tour.script ?? trainerSteps)
        : tourSets[tour.kind]
      : undefined) ?? [];
  const tourStep = tour ? steps[tour.index] : undefined;

  /**
   * Whether "Show me this step" is offered right now. Guarded at the RENDER,
   * not the handler: with the flag off the button is never drawn, so a student
   * cannot tell the trainer exists.
   */
  const canTrain = hasTrainer && !tour && !engine.done(state) && trainerSteps.length > 0;

  const startTour = (kind: TourKind, from: S = store.getState()): void => {
    const at = Date.now();
    if (kind === 'trainer') {
      // Demonstrated on the student's OWN bench — "what do I do here" cannot be
      // answered on somebody else's apparatus. `from` is the snapshot: the
      // state is immutable, so holding the reference IS the copy, and exiting
      // puts it back exactly.
      setTour({ kind, index: 0, saved: from, startedAt: at, script: trainerSteps });
      return;
    }
    const fromSeed = seedOf(from);
    const seed = kind === 'build' && fromSeed !== null ? siblingSeed(fromSeed) : (fromSeed ?? randomSeed());
    store.replace(engine.init(seed, at, sandboxMessage(kind), initOptions));
    setTour({ kind, index: 0, saved: from, startedAt: at });
  };

  const exitTour = (then?: TourKind): void => {
    if (!tour) return;
    markTourSeen(engine.meta.id);
    const at = Date.now();
    const resumed = resumeClock(tour.saved, at - tour.startedAt);
    if (then) {
      startTour(then, resumed);
      return;
    }
    store.replace(resumed);
    setTour(null);
  };

  const onTourIndex = React.useCallback((index: number) => setTour((t) => (t ? { ...t, index } : t)), []);
  const keepClear = React.useCallback(() => stageEl?.getBoundingClientRect() ?? null, [stageEl]);

  // --- layout ---------------------------------------------------------------
  // An Aside is drawn to a width and takes the height that follows, so this is
  // really a height budget. The console must also hold the task, the tab strip
  // and enough notebook to be worth reading; on a short laptop screen the
  // close-up is the only one of those that can give, so it gives first.
  const shellHeight = shell?.height ?? 0;
  const asideWidth = shellHeight >= 780 ? 320 : shellHeight >= 700 ? 250 : shellHeight >= 620 ? 200 : 170;
  // Shown in BOTH layouts. It is where a bench docks the thing being judged by
  // eye — a magnified dial, a colour chart, a screen — beside the box its
  // reading is typed into, and that pairing matters most on a small screen, not
  // least. Stacked, the console sits under the apparatus and it rides with it.
  const showAside = Boolean(ui.Aside) && (ui.showAside?.(state) ?? true);

  const view = { state, dispatch: dispatchAndWatch, now };
  const highlights = ui.highlightsFor?.(tourStep, state) ?? [];
  const Provider = ui.Provider ?? PassThrough;

  return (
    <WidgetFrame
      title={engine.meta.title}
      eyebrow={`CBSE ${engine.meta.cbse} · ${engine.meta.subject} · ${engine.meta.subtitle}`}
      bodySx={{ backgroundColor: (t) => t.brand.canvas }}
      actions={
        <>
          {onChoosePractical ? (
            <PracticalMenu current={engine.meta.id} onChoose={onChoosePractical} container={container} />
          ) : null}
          <LabStats
            score={engine.score(shown).total}
            mistakes={engine.log?.(shown).length ?? 0}
            time={<BenchClock state={shown} paused={tour !== null} done={engine.done(shown)} />}
            bench={seedOf(shown) ?? 0}
          />
          <LabHelpMenu
            onTutorial={hasTutorial ? () => startTour('controls') : undefined}
            onGuidedBuild={
              hasGuidedBuild && tourSets.build ? () => startTour('build') : undefined
            }
            onNewBench={() => restart(randomSeed())}
            newBenchHint={engine.meta.newBenchHint}
            disabled={tour !== null}
            hasProgress={engine.step(state) > 0}
            container={container}
          />
        </>
      }
    >
      <Provider {...view}>
      <LabShell
        mode={mode}
        width={shell?.width ?? null}
        measureRef={(el) => {
          measureShell(el);
          setBodyEl(el);
        }}
        emphasis={
          // The console widens for reading as well as for the viva and the
          // result. An explanation set in a 380px column is a tube, and the
          // bench has nothing happening in it while a student is reading about
          // it — so the pixels are worth more on this side for as long as the
          // panel is open, and go straight back when it shuts.
          // An INSTRUMENT panel is excluded on purpose. On the glass slab the
          // panel measures a ray drawn on the bench, so taking pixels from the
          // bench to widen it shrinks the very thing being measured — which is
          // the exact complaint that opening the light path used to produce.
          isFinished(state) ||
          engine.step(state) >= engine.steps.length - 1 ||
          (teachable && teachIsOpen && Boolean(ui.Teach) && !ui.teachIsInstrument)
            ? 'console'
            : 'bench'
        }
        steps={
          <>
            {offer && !tour ? (
              <ResumeOffer
                record={offer}
                onResume={() => resume(offer)}
                onDismiss={() => {
                  // "Start fresh" keeps the bench already on screen, so the old
                  // attempt is genuinely finished with and goes now — otherwise
                  // the dock would go on offering what has just been declined.
                  dropSession(engine.meta.id);
                  setOffer(null);
                }}
              />
            ) : null}
            <StepStrip
              steps={hasViva ? engine.steps : engine.steps.slice(0, -1)}
              current={isFinished(shown) ? engine.steps.length : engine.step(shown)}
              container={container}
            />
          </>
        }
        stage={
          <Card
            sx={{
              width: '100%',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <ui.Stage
              {...view}
              onStageElement={setStageEl}
              compact={mode === 'stacked' || (shell?.width ?? 0) < 1100}
              highlights={highlights}
            />
            {ui.Controls ? <ui.Controls {...view} /> : null}
            {/* The bench bar's teaching switch sits with the apparatus it
                explains, not in the console: it is about what is on the bench. */}
            {teachable ? (
              <Box
                sx={{
                  display: 'flex',
                  px: 1.5,
                  py: 1,
                  backgroundColor: apparatus.benchEdge,
                  borderTop: (t) => `1px solid ${t.brand.line}`,
                }}
              >
                <TeachToggle
                  open={teachIsOpen}
                  onToggle={toggleTeach}
                  label={ui.teachLabel ?? "What's happening"}
                />
              </Box>
            ) : null}
          </Card>
        }
        coach={
          <Card sx={{ p: 1.5 }}>
            <CoachMessage
              who="Lab assistant"
              tone={engine.message(state).tone}
              text={engine.message(state).text}
            />
          </Card>
        }
        console={
          <Box data-tour="console" sx={{ display: 'flex', width: '100%', minHeight: 0 }}>
            <BenchConsole
              definition={definition}
              state={state}
              dispatch={dispatchAndWatch}
              now={now}
              scroll={mode === 'split'}
              container={container}
              save={save}
              aside={showAside && ui.Aside ? <ui.Aside {...view} maxWidth={asideWidth} /> : null}
              /* The explanation reads in the CONSOLE, where reading happens.
                 Under the bench it displaced the apparatus: the drawing scales
                 to fit, so every pixel the panel took shrank the whole bench,
                 and on glass-slab opening the light path halved it. The switch
                 stays on the bench bar, because that is where the thing it
                 explains is. */
              teach={
                teachable && teachIsOpen && ui.Teach && !teachExpanded ? (
                  <TeachPanel
                    title={teachTitleFor(ui.teachLabel)}
                    revealed={engine.done(state)}
                    onExpand={ui.teachIsInstrument ? undefined : () => setTeachExpanded(true)}
                  >
                    <ui.Teach {...view} revealed={engine.done(state)} />
                  </TeachPanel>
                ) : null
              }
              onNewBench={() => restart(randomSeed())}
              onRepeatBench={() => restart(seedOf(state) ?? randomSeed())}
              onTrainer={canTrain ? () => startTour('trainer') : undefined}
            />
          </Box>
        }
      />
        {/*
          The SAME panel, in a room the right size for it. Rendered inside the
          Provider because a bench's teaching layer may read the bench's own
          context, and moved rather than copied — there is one panel, and it is
          either in the console or in the sheet.
        */}
        {teachable && ui.Teach && !ui.teachIsInstrument ? (
          <ReadingSheet
            open={teachExpanded && teachIsOpen}
            title={teachTitleFor(ui.teachLabel)}
            subtitle="A teaching aid — none of this is marked, and none of it is your readings."
            container={container}
            onClose={() => setTeachExpanded(false)}
          >
            <ui.Teach {...view} revealed={engine.done(state)} />
          </ReadingSheet>
        ) : null}
      </Provider>

      {/* A demonstration PLAYS ITSELF — pointer, press, commentary, Stop — and
          is a different thing from a tour, which is read at the student's own
          pace. Same authored steps, different runner. */}
      {tour?.kind === 'trainer' && steps.length ? (
        <TrainerRun
          steps={steps as readonly TourStep<BenchTourContext<S, A>>[]}
          ctx={tourCtx}
          onStop={() => exitTour()}
          keepClear={keepClear}
        />
      ) : null}

      {tour && tour.kind !== 'trainer' && steps.length ? (
        <GuidedTour
          label={tour.kind === 'build' ? 'Guided build' : 'Tutorial'}
          steps={steps as readonly TourStep<BenchTourContext<S, A>>[]}
          index={tour.index}
          ctx={tourCtx}
          onIndexChange={onTourIndex}
          onExit={() => exitTour()}
          notice={ui.tourNotice?.(state) ?? null}
          keepClear={keepClear}
          finishLabel="Start the practical"
          finishActions={
            tour.kind === 'controls' && tourSets.build ? (
              <Button variant="outlined" size="small" color="inherit" onClick={() => exitTour('build')}>
                Guided build
              </Button>
            ) : null
          }
        />
      ) : null}
    </WidgetFrame>
  );
}

/** A bench with nothing to share between its halves needs no provider. */
function PassThrough({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>;
}

/**
 * Every bench's state carries `seed` and `t0`; they are the two things the
 * workspace needs from a state it otherwise treats as opaque.
 */
interface BenchStateShape {
  seed?: number;
  t0?: number;
  tEnd?: number;
  seedOf?: () => number;
}

function seedOf<S>(state: S): number | null {
  const seed = (state as BenchStateShape)?.seed;
  return typeof seed === 'number' ? seed : null;
}

/**
 * The bench's clock as its two raw timestamps.
 *
 * Handed on rather than subtracted here, because the two callers want it at
 * different moments: a record is written long after the render that produced
 * it, so it does its own subtraction against the time it is actually saved.
 */
function clockOf<S>(state: S): { t0: number | null; tEnd: number | null } {
  const s = state as BenchStateShape;
  return {
    t0: typeof s?.t0 === 'number' ? s.t0 : null,
    // Benches carry `tEnd: 0` while they are still running rather than leaving
    // it out, so "is a number" is not the question — a zero here would date the
    // end of the practical to 1970 and make every clock read nothing at all.
    tEnd: typeof s?.tEnd === 'number' && s.tEnd > 0 ? s.tEnd : null,
  };
}

/** Time on the bench at `at`, in milliseconds. */
function elapsedOf<S>(state: S, at: number): number {
  const { t0, tEnd } = clockOf(state);
  return t0 === null ? 0 : Math.max(0, (tEnd ?? at) - t0);
}

/** Give back the time a tour borrowed, so a paused clock resumes where it was. */
function resumeClock<S>(state: S, pausedMs: number): S {
  const s = state as BenchStateShape;
  if (typeof s?.t0 !== 'number' || s.tEnd) return state;
  return { ...state, t0: s.t0 + pausedMs };
}

/**
 * Time on the bench. Its own tick, twice a second, so the whole workspace does
 * not re-render to move a clock.
 */
function BenchClock<S>({
  state,
  paused,
  done,
}: {
  state: S;
  paused: boolean;
  done: boolean;
}): React.ReactElement {
  const [at, setAt] = React.useState(() => Date.now());
  useInterval(() => setAt(Date.now()), 500, !paused && !done);
  const s = state as BenchStateShape;
  const start = s?.t0 ?? at;
  const end = done && s?.tEnd ? s.tEnd : at;
  return <>{formatClock(Math.max(0, end - start))}</>;
}
