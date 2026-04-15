import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';

interface StrudelMod {
  initStrudel: (opts?: Record<string, unknown>) => Promise<unknown>;
  evaluate: (code: string, autoplay?: boolean) => Promise<unknown>;
  hush: () => void;
  samples: (url: string | Record<string, unknown>, base?: string) => Promise<unknown>;
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

async function ensure(): Promise<StrudelMod> {
  if (!mod) {
    setStatus('loading');
    mod = (await import('@strudel/web')) as unknown as StrudelMod;
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        await mod!.initStrudel();
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
    try {
      const m = await ensure();
      const slot = src?.actorId ?? src?.fileId ?? '__scratch__';
      slots.set(slot, code);
      await flush(m);
      log({ runtime: 'strudel', level: 'info', msg: `eval ok [${slot}] (${code.length}b)` });
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
    }
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
