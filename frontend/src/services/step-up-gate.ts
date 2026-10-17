export type StepUpHandler = () => Promise<boolean>;

let handler: StepUpHandler | null = null;
let inFlight: Promise<boolean> | null = null;

export function registerStepUpHandler(next: StepUpHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export function requestStepUp(): Promise<boolean> {
  if (!handler) return Promise.resolve(false);
  if (!inFlight) {
    inFlight = handler().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

export async function withStepUpRetry<T extends { status: string }>(run: () => Promise<T>): Promise<T> {
  const first = await run();
  if (first.status !== 'step_up_required') return first;
  return (await requestStepUp()) ? run() : first;
}
