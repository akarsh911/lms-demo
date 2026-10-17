"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";

import { EmergeChip } from "@/components/ui/chip";
import { WidgetError, WidgetLoading } from "@/components/widgets/widget-states";
import { useCreateDebate, useDebateStep } from "@/hooks/mutation/use-debate";
import {
  useDebateCatalog,
  useDebateSession,
  useDebateStatus,
} from "@/hooks/query/use-debate";
import { debateErrorMessage } from "@/lib/debate/failure";
import { debateService } from "@/services/debate";
import type { DebatePhase, DebateSession } from "@/types/debate";

import { DebateClosingStage } from "./debate-closing-stage";
import { DebateModeContext } from "./debate-heading";
import { DebateHostStage } from "./debate-host-stage";
import { DebateLiveStage } from "./debate-live-stage";
import { DebateSetup } from "./debate-setup";

const SETTLED: ReadonlySet<DebatePhase> = new Set(["report_ready", "report_failed", "cancelled"]);

export function DebateRoom({
  grade,
  onLive,
}: {
  grade: number | null;
  onLive?: (live: boolean) => void;
}): React.ReactElement {
  const status = useDebateStatus();
  const ready = status.data?.health.ready === true;
  const scripted = status.data?.scripted;
  const catalog = useDebateCatalog(ready ? scripted : undefined);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const session = useDebateSession(sessionId);
  const create = useCreateDebate();
  const step = useDebateStep((run: () => Promise<DebateSession>) => run());
  const { mutateAsync: runStep, reset: resetStep } = step;
  const phase = session.data?.phase;
  const live = sessionId !== null && (phase === undefined || !SETTLED.has(phase));

  React.useEffect(() => {
    onLive?.(live);
  }, [live, onLive]);

  React.useEffect(() => () => onLive?.(false), [onLive]);

  const act = React.useCallback(
    (run: () => Promise<DebateSession>): Promise<boolean> =>
      runStep(run).then(
        () => true,
        () => false,
      ),
    [runStep],
  );

  const restart = React.useCallback((): void => {
    setSessionId(null);
    create.reset();
    resetStep();
  }, [create, resetStep]);

  const onEnd = React.useCallback(
    (reason: "manual" | "time_limit"): void => {
      if (sessionId) void act(() => debateService.end(sessionId, reason));
    },
    [act, sessionId],
  );

  if (status.isPending) return <WidgetLoading rows={6} />;
  if (status.error) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning" variant="outlined">
          {debateErrorMessage(status.error)}
        </Alert>
        <Stack direction="row">
          <Button onClick={() => void status.refetch()}>Check again</Button>
        </Stack>
      </Stack>
    );
  }
  if (!ready) {
    return (
      <Alert
        severity="warning"
        variant="outlined"
        action={
          <Button size="small" onClick={() => void status.refetch()}>
            Check again
          </Button>
        }
      >
        The debate engine is running but not ready: its speech and language
        provider has no key or the key was rejected. The room will not start a
        pretend debate.
      </Alert>
    );
  }

  const mode = status.data.health.test_mode
    ? {
        label: "Test mode",
        hint: "The engine runs stub providers: transcripts and replies are placeholders.",
      }
    : status.data.scripted
      ? {
          label: "Demo mode",
          hint: "Scripted opponent and report on this device. Nothing is sent to the engine.",
        }
      : null;
  const chip = mode ? (
    <Tooltip title={mode.hint}>
      <span tabIndex={0}>
        <EmergeChip label={mode.label} tone="blue" dot />
      </span>
    </Tooltip>
  ) : null;

  return (
    <DebateModeContext.Provider value={chip}>
      <Stack spacing={1}>
        {sessionId === null ? (
          catalog.isPending ? (
            <WidgetLoading rows={6} />
          ) : catalog.error ? (
            <WidgetError
              error={catalog.error}
              onRetry={() => void catalog.refetch()}
            />
          ) : (
            <DebateSetup
              key={grade ?? 'any'}
              grade={grade}
              catalog={catalog.data}
              creating={create.isPending}
              error={create.error}
              onCreate={(request) =>
                create.mutate(
                  { request, scripted: status.data.scripted },
                  { onSuccess: (created) => setSessionId(created.id) },
                )
              }
            />
          )
        ) : session.data ? (
          <Stack spacing={2}>
            {session.error ? (
              <Alert severity="warning" variant="outlined">
                Lost contact with the engine. Retrying; the server keeps the
                clock.
              </Alert>
            ) : null}
            <DebateStage
              session={session.data}
              busy={step.isPending}
              error={step.error}
              act={act}
              onEnd={onEnd}
              onRestart={restart}
            />
          </Stack>
        ) : session.isPending ? (
          <WidgetLoading rows={6} />
        ) : (
          <Stack spacing={2}>
            <Alert severity="warning" variant="outlined">
              {debateErrorMessage(session.error)}
            </Alert>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => void session.refetch()}>Retry</Button>
              <Button onClick={restart}>Start over</Button>
            </Stack>
          </Stack>
        )}
      </Stack>
    </DebateModeContext.Provider>
  );
}

function DebateStage({
  session,
  busy,
  error,
  act,
  onEnd,
  onRestart,
}: {
  session: DebateSession;
  busy: boolean;
  error: unknown;
  act: (run: () => Promise<DebateSession>) => Promise<boolean>;
  onEnd: (reason: "manual" | "time_limit") => void;
  onRestart: () => void;
}): React.ReactElement {
  const id = session.id;
  switch (session.phase) {
    case "ready":
    case "host_intro":
      return (
        <DebateHostStage
          session={session}
          busy={busy}
          error={error}
          onIntro={() => void act(() => debateService.intro(id))}
          onBegin={() => void act(() => debateService.begin(id))}
          onCancel={() =>
            void act(() => debateService.cancel(id)).then(
              (ok) => ok && onRestart(),
            )
          }
        />
      );
    case "student_turn":
    case "processing":
    case "ai_turn":
      return (
        <DebateLiveStage
          session={session}
          busy={busy}
          error={error}
          onFinishTurn={(turn, seqs) =>
            act(() => debateService.finishTurn(id, turn, seqs))
          }
          onPlayed={(turn) =>
            void act(() => debateService.aiTurnPlayed(id, turn))
          }
          onRetryAi={() => void act(() => debateService.retryAiTurn(id))}
          onEnd={onEnd}
        />
      );
    case "finalizing":
    case "evaluating":
    case "report_ready":
    case "report_failed":
      return <DebateClosingStage session={session} onRestart={onRestart} />;
    case "cancelled":
      return (
        <Stack spacing={2}>
          <Alert severity="info" variant="outlined">
            This debate was{" "}
            {session.end_reason === "abandoned"
              ? "left unstarted for too long and closed"
              : "cancelled"}
            .
          </Alert>
          <Stack direction="row">
            <Button variant="contained" onClick={onRestart}>
              Start another debate
            </Button>
          </Stack>
        </Stack>
      );
    default: {
      const unhandled: never = session.phase;
      return unhandled;
    }
  }
}
