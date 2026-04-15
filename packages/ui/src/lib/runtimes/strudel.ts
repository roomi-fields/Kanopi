import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';

interface StrudelMod {
  initStrudel: (opts?: Record<string, unknown>) => Promise<unknown>;
  evaluate: (code: string, autoplay?: boolean) => Promise<unknown>;
  hush: () => void;
  samples: (url: string | Record<string, unknown>, base?: string) => Promise<unknown>;
}

let mod: StrudelMod | undefined;
let initPromise: Promise<unknown> | undefined;

async function ensure(): Promise<StrudelMod> {
  if (!mod) {
    mod = (await import('@strudel/web')) as unknown as StrudelMod;
  }
  if (!initPromise) {
    initPromise = (async () => {
      await mod!.initStrudel();
      // Load the standard TidalCycles "dirt" samples so bd/cp/hh/... work out of the box.
      await mod!.samples('github:tidalcycles/dirt-samples');
    })();
  }
  await initPromise;
  return mod;
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
  async evaluate(code: string, _src: EvalSource, log: LogPush) {
    try {
      const m = await ensure();
      await m.evaluate(code);
      log({ runtime: 'strudel', level: 'info', msg: `eval ok (${code.length}b)` });
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
    }
  },
  async stop(_src: EvalSource, log: LogPush) {
    try {
      const m = await ensure();
      m.hush();
      log({ runtime: 'strudel', level: 'info', msg: 'hush' });
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
    }
  },
  async dispose() {
    try {
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
