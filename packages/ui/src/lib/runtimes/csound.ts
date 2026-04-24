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
  /**
   * `compileCSD(csd, mode=1)` compiles an inline CSD document. Name
   * comes from `csoundApiRename` stripping the `csound` prefix and
   * lowercasing the first letter of `csoundCompileCSD`, leaving the
   * uppercase `SD` intact. See `@csound/browser/src/utils.js:49` +
   * `modules/performance.js:103`. mode=1 is the default.
   */
  compileCSD: (csd: string, mode?: number) => Promise<number>;
  compileOrc: (orc: string) => Promise<number>;
  readScore: (score: string) => Promise<undefined>;
  on: (event: string, listener: (arg: unknown) => void) => unknown;
};

let instance: CsoundInstance | undefined;
/** True once a full `<CsoundSynthesizer>` has been compileCSD'd. Survives
 *  `stop()` (hush) — the engine retains instrument definitions, so later
 *  compileOrc / readScore calls work without recompiling the full CSD. */
let booted = false;
/** True while audio is actually streaming. Flipped off by `stop()`, flipped
 *  on again by `start()` on the next eval. */
let playing = false;

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
    // useSAB:false sidesteps SharedArrayBuffer → no COOP/COEP headers
    // required; Comlink uses MessageChannel instead. Default worker
    // path (useWorker:true) exposes the full Csound live-coding API:
    // compileCSD (inline CSD text), compileOrc, evalCode, readScore.
    const cs = await mod.Csound({ useSAB: false });
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

    // Phase 2.7 étape B — live eval incrémental. The `extractBlock`
    // upstream already ran through the Lezer AST, so `code` is either:
    //   - a full CSD (contains <CsoundSynthesizer>)          → compileCSD
    //   - an `instr N … endin` or `opcode … endop` block     → compileOrc
    //   - a single score event (line starting with i/f/e/s…) → readScore
    //   - a fragment that doesn't match any of the above     → compileOrc fallback
    // The detection is a simple first-token switch. It's not a grammar
    // match — the AST boundary is what Kanopi already used to cut the
    // block in `extract-block.ts`.
    const trimmed = code.trim();
    const isFullCsd = /<CsoundSynthesizer>/.test(trimmed);
    const isInstrBlock = /^(?:instr|opcode)\b/.test(trimmed);
    const isScoreEvent = /^[a-z]\s+[-\d.]/i.test(trimmed); // i, f, e, s, t, m, n, q, r, v, w, x, y

    try {
      if (isFullCsd) {
        // Full CSD: compile/redefine everything. Csound allows in-place
        // instrument redefinition, so this works both on first boot and
        // on subsequent whole-file re-evals.
        const status = await instance!.compileCSD(code);
        if (status < 0) throw new Error(`csound compile error (status ${status})`);
        booted = true;
      } else if (!booted) {
        // No CSD ever compiled — we have no <CsOptions>/sr/ksmps header.
        // Nothing we can do with a bare fragment. Direct the user.
        throw new Error('engine not booted — put the cursor on <CsoundSynthesizer> (line 1) and Ctrl+Enter first');
      } else if (isInstrBlock) {
        // Redefine an instrument or UDO at runtime. `compileOrc` adds the
        // block to the running performance; `evalCode` only parses/validates
        // without applying. Confirmed by kunstmusik/csound-live-code.
        const status = await instance!.compileOrc(code);
        if (status < 0) throw new Error(`csound compileOrc error (status ${status})`);
      } else if (isScoreEvent) {
        // Append a score event to the running timeline.
        await instance!.readScore(code);
      } else {
        // Fragment we couldn't classify — try compileOrc as a safe default.
        const status = await instance!.compileOrc(code);
        if (status < 0) throw new Error(`csound compileOrc error (status ${status})`);
      }

      // Kick audio streaming on first boot, or resume it after a prior
      // `stop()` (hush) left the engine booted but paused. Idempotent
      // while `playing` is true.
      if (!playing) {
        await instance!.start();
        playing = true;
      }
    } catch (err) {
      log({ runtime: 'csound', level: 'error', msg: String(err) });
      throw err;
    }

    log({ runtime: 'csound', level: 'info', msg: `eval ok (${code.length}b)` });
    emitLifecycle('eval', src.fileId);
  },
  async stop(src: EvalSource, log: LogPush) {
    try {
      if (instance && booted) {
        // `stop()` alone leaves wasm Csound in a "started" state that
        // rejects subsequent `start()` calls with "already started" and
        // no audio resumes. `reset()` fully returns the engine to a
        // clean slate — next eval must be a full <CsoundSynthesizer>
        // document (matches the user's "Ctrl+Home, Ctrl+Enter to boot"
        // mental model).
        await instance.reset();
        booted = false;
        playing = false;
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
    booted = false;
    playing = false;
  }
};
