import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(fileURLToPath(new URL('../../../src/', import.meta.url)));
const STUBS = { 'server-only': 'data:text/javascript,export {}' };

function candidate(base) {
  for (const file of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(file) && statSync(file).isFile()) return pathToFileURL(file).href;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: STUBS[specifier], shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const url = candidate(path.join(SRC, specifier.slice(2)));
    if (url) return { url, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const url = candidate(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (url) return { url, shortCircuit: true };
  }
  return next(specifier, context);
}
