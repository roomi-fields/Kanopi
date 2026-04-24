import type { Runtime } from '../core-mock';

type Level = 'info' | 'warn' | 'error';
type Push = (e: { runtime: Runtime; level: Level; msg: string }) => void;

const RUNTIME_PATTERNS: { re: RegExp; runtime: Runtime }[] = [
  { re: /\[(getTrigger|cyclist|eval|superdough|strudel|scheduler)\]/i, runtime: 'strudel' },
  { re: /\[hydra\]/i, runtime: 'hydra' }
];

function detect(msg: string): Runtime | null {
  for (const { re, runtime } of RUNTIME_PATTERNS) if (re.test(msg)) return runtime;
  return null;
}

let installed = false;

export function installConsoleBridge(push: Push) {
  if (installed) return;
  installed = true;
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };
  // Mercury and Tone.js occasionally log AudioNode instances with circular
  // back-references (_context ↔ _destination), so `JSON.stringify` throws.
  // The throw would bubble up through the library's own try/catch and get
  // mis-reported by the adapter as an engine error, so be defensive.
  const safeStringify = (a: unknown): string => {
    if (typeof a === 'string') return a;
    if (a instanceof Error) return a.message;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  };
  const forward = (level: Level, args: unknown[]) => {
    const msg = args.map(safeStringify).join(' ');
    const runtime = detect(msg);
    if (runtime) push({ runtime, level, msg });
  };
  console.log = (...args: unknown[]) => {
    orig.log(...args);
    forward('info', args);
  };
  console.warn = (...args: unknown[]) => {
    orig.warn(...args);
    forward('warn', args);
  };
  console.error = (...args: unknown[]) => {
    orig.error(...args);
    forward('error', args);
  };
  window.addEventListener('error', (e) => {
    push({ runtime: 'system', level: 'error', msg: `${e.message} @ ${e.filename}:${e.lineno}` });
  });
  window.addEventListener('unhandledrejection', (e) => {
    push({ runtime: 'system', level: 'error', msg: `unhandled: ${String(e.reason)}` });
  });
}
