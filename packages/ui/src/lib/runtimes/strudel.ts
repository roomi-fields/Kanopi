import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';

interface StrudelMod {
  initStrudel: (opts?: Record<string, unknown>) => Promise<unknown>;
  evaluate: (code: string, autoplay?: boolean) => Promise<unknown>;
  hush: () => void;
  samples: (url: string | Record<string, unknown>, base?: string) => Promise<unknown>;
}

// Anything listening for "the last Strudel eval failed" — used by CMEditor's
// eval-tracker so we can turn an async runtime error into a red flash.
export type StrudelErrorListener = (err: unknown) => void;
const errorListeners = new Set<StrudelErrorListener>();
export function onStrudelError(cb: StrudelErrorListener): () => void {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}
function emitError(err: unknown) {
  for (const cb of errorListeners) cb(err);
}

export type StrudelStatus = 'idle' | 'loading' | 'ready' | 'error';
let status: StrudelStatus = 'idle';
const statusListeners = new Set<(s: StrudelStatus) => void>();
function setStatus(s: StrudelStatus) {
  status = s;
  for (const cb of statusListeners) cb(s);
}
export function strudelStatus(): StrudelStatus { return status; }
export function onStrudelStatus(cb: (s: StrudelStatus) => void): () => void {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

let mod: StrudelMod | undefined;
let initPromise: Promise<unknown> | undefined;

// Strudel's async errors fire via onEvalError / strudel.log DURING our
// await m.evaluate() — not after. We latch the last one so the adapter's
// evaluate() can throw on exit and the outer .then chain never resolves as ok.
let latchedError: unknown | undefined;

async function ensure(): Promise<StrudelMod> {
  if (!mod) {
    setStatus('loading');
    mod = (await import('@strudel/web')) as unknown as StrudelMod;
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        // Strudel's async errors never reject m.evaluate() — they surface
        // through these callbacks DURING the evaluate await, and through a
        // 'strudel.log' DOM event as a safety net for scheduler ticks.
        await mod!.initStrudel({
          onEvalError: (err: unknown) => {
            latchedError = err;
            emitError(err);
          },
          onError: (err: unknown) => {
            latchedError = err;
            emitError(err);
          }
        } as Record<string, unknown>);
        document.addEventListener('strudel.log', (e) => {
          const detail = (e as CustomEvent).detail as { message?: string; type?: string };
          if (detail?.type === 'error') {
            const err = new Error(detail.message ?? 'strudel error');
            latchedError = err;
            emitError(err);
          }
        });
        await mod!.samples('github:tidalcycles/dirt-samples');
        setStatus('ready');
      } catch (err) {
        setStatus('error');
        throw err;
      }
    })();
  }
  await initPromise;
  return mod;
}

// Per-actor code slots. Strudel evaluates one big program at a time, so we
// keep each actor's source around and recombine as "$: <code>" lines on every
// eval/stop. That lets multiple actors coexist in the same Strudel runtime.
const slots = new Map<string, string>();

function composite(): string {
  return [...slots.values()].map((c) => `$: (${c.trim()})`).join('\n\n');
}

async function flush(m: StrudelMod): Promise<void> {
  if (slots.size === 0) {
    m.hush();
    return;
  }
  await m.evaluate(composite());
}

export const strudelAdapter: RuntimeAdapter = {
  id: 'strudel',
  setBpm(bpm: number, _log: LogPush) {
    // Tidal convention: 1 cycle = 4 beats. CPS = bpm/60/4.
    // We eval a tiny Strudel expression that calls setcps (provided by @strudel/core via makeGlobal).
    if (!mod) return;
    try {
      // eslint-disable-next-line no-new-func
      new Function('bpm', 'setcps(bpm/60/4)')(bpm);
    } catch {
      /* setcps may not be installed yet */
    }
  },
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    // Strudel's evaluate logs parse/runtime errors via its internal logger
    // WITHOUT rejecting — so red flash there would need to sniff console.
    // We do catch syntax errors here via new Function(), after stripping
    // hash-comment lines (Kanopi's auto-generated file headers use `#`).
    const stripped = code.replace(/^\s*#[^\n]*$/gm, '');
    try {
      // eslint-disable-next-line no-new, no-new-func
      new Function(stripped);
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: `parse: ${String(err)}` });
      throw err;
    }

    const m = await ensure();
    const slot = src?.actorId ?? src?.fileId ?? '__scratch__';
    slots.set(slot, code);
    // Strudel swallows runtime errors into its logger, which fires onEvalError
    // DURING the await below. We clear the latch first, then throw after if an
    // error was captured, so the outer .then() chain sees a real rejection.
    latchedError = undefined;
    try {
      await flush(m);
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
      throw err;
    }
    if (latchedError !== undefined) {
      const err = latchedError;
      latchedError = undefined;
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
      throw err instanceof Error ? err : new Error(String(err));
    }
    log({ runtime: 'strudel', level: 'info', msg: `eval ok [${slot}] (${code.length}b)` });
  },
  async stop(src: EvalSource, log: LogPush) {
    try {
      const m = await ensure();
      const slot = src?.actorId ?? src?.fileId;
      if (!slot || slot === '__hush__') {
        slots.clear();
        m.hush();
        log({ runtime: 'strudel', level: 'info', msg: 'hush (all slots)' });
        return;
      }
      slots.delete(slot);
      await flush(m);
      log({ runtime: 'strudel', level: 'info', msg: `stop [${slot}]` });
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
    }
  },
  async dispose() {
    try {
      slots.clear();
      mod?.hush();
    } catch {
      /* ignore */
    }
  }
};

// Tidal files use Strudel as runtime (port JS de TidalCycles)
export const tidalAdapter: RuntimeAdapter = {
  ...strudelAdapter,
  id: 'tidal',
  setBpm: strudelAdapter.setBpm?.bind(strudelAdapter)
};
