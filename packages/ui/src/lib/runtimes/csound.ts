import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

/**
 * Minimal surface of `@csound/browser`'s CsoundObj that this adapter
 * consumes. Upstream ships a much richer API (channels, tables, fs,
 * UGEN plugins) that v1 Kanopi doesn't wire — keep the type narrow so
 * the opt-in contract is explicit.
 */
type CsoundInstance = {
  start: () => Promise<number>;
  stop: () => Promise<undefined>;
  reset: () => Promise<number>;
  destroy: () => Promise<undefined>;
  /** `compileCSD(text, 1)` compiles a CSD from an in-memory string (mode=1). */
  compileCSD: (pathOrText: string, mode?: number) => Promise<number>;
  evalCode: (orc: string) => Promise<number>;
  readScore: (score: string) => Promise<undefined>;
  on: (event: string, listener: (arg: unknown) => void) => unknown;
};

let instance: CsoundInstance | undefined;
let started = false;

const adapterEvents: EventBus = createEventBus();

function emitLifecycle(name: 'eval' | 'stop', fileId: string) {
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'trigger',
    runtime: 'csound',
    source: fileId,
    t: performance.now(),
    name
  });
}

async function ensure(log: LogPush): Promise<boolean> {
  if (!instance) {
    const mod = (await import('@csound/browser')) as unknown as {
      Csound: (params?: { useWorker?: boolean; useSAB?: boolean }) => Promise<CsoundInstance | undefined>;
    };
    // useWorker:false sidesteps SharedArrayBuffer → no COOP/COEP header
    // requirement. Single-thread AudioWorklet path is well-supported and
    // fast enough for live coding iteration. Switch to true only if a
    // performance need materialises (and add the headers then).
    const cs = await mod.Csound({ useWorker: false });
    if (!cs) {
      log({ runtime: 'csound', level: 'error', msg: 'engine failed to initialise' });
      return false;
    }
    instance = cs;
    instance.on('message', (raw) => {
      const msg = String(raw).trim();
      if (!msg) return;
      // Csound routes parse errors, runtime prints, and performance info
      // through the same stream. Heuristic: line contains "error" →
      // level:error ; otherwise info. Good enough for v1.
      const level = /error|ERROR|Error/.test(msg) ? 'error' : 'info';
      log({ runtime: 'csound', level, msg });
    });
    log({ runtime: 'csound', level: 'info', msg: 'engine loaded' });
  }
  return true;
}

export const csoundAdapter: RuntimeAdapter = {
  id: 'csound',
  extensions: ['.csd'],
  events: adapterEvents,
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) throw new Error('csound not ready');
    // Phase 2.7 étape A : re-compile complet à chaque Ctrl+Enter.
    // compileCSD(text, 1) = "compile from in-memory string, mode 1".
    // Csound redéfinit les instruments in-place, donc ré-exécuter est
    // idempotent (un clic audio possible mais pas de corruption d'état).
    // Étape B livrera evalCode / readScore incrémental — cf CSOUND.md §A.
    const status = await instance!.compileCSD(code, 1);
    if (status < 0) {
      const err = new Error(`csound compile error (status ${status})`);
      log({ runtime: 'csound', level: 'error', msg: err.message });
      throw err;
    }
    if (!started) {
      await instance!.start();
      started = true;
    }
    log({ runtime: 'csound', level: 'info', msg: `eval ok (${code.length}b)` });
    emitLifecycle('eval', src.fileId);
  },
  async stop(src: EvalSource, log: LogPush) {
    try {
      if (instance && started) {
        await instance.stop();
        // stop() ends the current performance but keeps the instance
        // alive; toggling `started` back to false lets the next evaluate
        // call start() again without re-initialising the engine.
        started = false;
      }
      log({ runtime: 'csound', level: 'info', msg: 'stopped' });
      emitLifecycle('stop', src.fileId);
    } catch (err) {
      log({ runtime: 'csound', level: 'error', msg: String(err) });
    }
  },
  async dispose() {
    try {
      if (instance) await instance.destroy();
    } catch {
      /* ignore — engine may already be torn down */
    }
    instance = undefined;
    started = false;
  }
};
