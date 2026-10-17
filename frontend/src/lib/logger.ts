type Level = 'debug' | 'info' | 'warn' | 'error';

const enabled: Record<Level, boolean> = {
  debug: process.env.NODE_ENV !== 'production',
  info: true,
  warn: true,
  error: true,
};

function emit(level: Level, message: string, meta?: unknown): void {
  if (!enabled[level]) return;
  const line = `[emerge] ${message}`;
  if (meta === undefined) console[level](line);
  else console[level](line, meta);
}

export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
