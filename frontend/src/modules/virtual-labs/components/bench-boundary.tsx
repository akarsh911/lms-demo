'use client';

import * as React from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { TriangleAlert } from 'lucide-react';

import { dropSession, readSession } from '@labs/lib/session-store';

/**
 * WHEN A BENCH BREAKS.
 *
 * A practical is forty minutes of a student's work inside one React tree, and
 * without a boundary any thrown error in any part of it — a drawing, a reducer,
 * a panel — unmounts the lot and leaves a blank page. Blank is the worst
 * possible answer here, because the work is NOT gone: it is on this machine,
 * saved a second ago, and the student has no way of knowing that.
 *
 * So this catches, and then does the two things a blank page cannot. It says
 * plainly whether the work is safe, having actually looked; and it offers the
 * two ways out in the right order.
 *
 * THE ORDER MATTERS, and it changes. The first failure is treated as bad luck:
 * "try again" keeps the saved bench and remounts, and most transient faults end
 * there. A SECOND failure after a reload is not bad luck — the overwhelmingly
 * likely cause is the saved state itself, which will go on reproducing the
 * crash every time it is restored. At that point the honest recommendation is
 * to start the practical again, and the button order says so. Offering "try
 * again" first for ever would be a loop with a button on it.
 *
 * Discarding is never automatic. A student's work is not this component's to
 * throw away on a guess, however good the guess.
 */

interface Props {
  /** `BenchMeta.id` — which saved session this is about. */
  bench: string;
  title: string;
  onLeave?: () => void;
  children: React.ReactNode;
}

interface State {
  failed: boolean;
  /** How many times this bench has thrown since the boundary was mounted. */
  failures: number;
  /** Bumped to remount the subtree, which is what "try again" means. */
  attempt: number;
}

export class BenchBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { failed: false, failures: 0, attempt: 0 };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    // Counted here rather than in the derived state, which React may call more
    // than once for a single error.
    this.setState((s) => ({ failures: s.failures + 1 }));
    // The one place a bench error is visible at all. Left as an error on
    // purpose: it is what a developer opening the console needs to see, and
    // swallowing it would make this boundary a way of hiding faults.
    console.error(`[lab bench: ${this.props.bench}]`, error);
  }

  private retry = (): void => {
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  private startFresh = (): void => {
    dropSession(this.props.bench);
    this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }));
  };

  override render(): React.ReactNode {
    if (this.state.failed) {
      return (
        <BenchFailure
          bench={this.props.bench}
          title={this.props.title}
          repeated={this.state.failures > 1}
          onRetry={this.retry}
          onStartFresh={this.startFresh}
          onLeave={this.props.onLeave}
        />
      );
    }
    return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
  }
}

function BenchFailure({
  bench,
  title,
  repeated,
  onRetry,
  onStartFresh,
  onLeave,
}: {
  bench: string;
  title: string;
  repeated: boolean;
  onRetry: () => void;
  onStartFresh: () => void;
  onLeave?: () => void;
}): React.ReactElement {
  const theme = useTheme();
  // Looked up rather than assumed: telling a student their work is safe when it
  // is not would be worse than saying nothing at all.
  const [saved] = React.useState(() => readSession(bench));

  const retry = (
    <Button variant={repeated ? 'outlined' : 'contained'} onClick={onRetry}>
      {saved ? 'Reopen where I left off' : 'Try again'}
    </Button>
  );
  const fresh = (
    <Button variant={repeated ? 'contained' : 'outlined'} onClick={onStartFresh}>
      Start this practical again
    </Button>
  );

  return (
    <Card sx={{ p: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <TriangleAlert size={18} color={theme.hues.amber} aria-hidden />
        <Typography component="h2" sx={{ fontWeight: 800, fontSize: theme.band.type.h3, color: theme.brand.ink }}>
          This bench stopped
        </Typography>
      </Box>

      <Typography sx={{ color: theme.brand.text, maxWidth: 560 }}>
        Something went wrong inside <b>{title}</b> and it had to be taken down. Nothing you did caused
        it, and nothing has been reported to your teacher.
      </Typography>

      <Typography sx={{ color: theme.brand.sub, maxWidth: 560, fontSize: theme.band.type.base - 1 }}>
        {saved
          ? `Your work is still here — it was saved at step ${Math.min(saved.step + 1, saved.steps)} of ${saved.steps}, on bench #${saved.seed ?? '—'}.`
          : 'There was no saved bench to keep, so this one starts over.'}
      </Typography>

      {repeated ? (
        <Typography sx={{ color: theme.brand.sub, maxWidth: 560, fontSize: theme.band.type.base - 1 }}>
          It has now stopped twice, which usually means the saved bench itself is the problem. Starting
          the practical again will clear it. You will lose this attempt, and it is the thing most likely
          to work.
        </Typography>
      ) : null}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
        {repeated ? (
          <>
            {fresh}
            {retry}
          </>
        ) : (
          <>
            {retry}
            {fresh}
          </>
        )}
        {onLeave ? (
          <Button variant="text" onClick={onLeave} sx={{ color: theme.brand.sub }}>
            Back to the practicals
          </Button>
        ) : null}
      </Box>
    </Card>
  );
}
