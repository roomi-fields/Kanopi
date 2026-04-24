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
      if (!started && !isFullCsd) {
        // Engine not booted yet and user evaluated a block or score line
        // rather than the full CSD. Csound needs the header (<CsOptions>,
        // sr/ksmps/nchnls) before any instr or score can run — there's no
        // way to synthesise that from a fragment. Tell the user what to do.
        throw new Error('engine not booted — put the cursor on <CsoundSynthesizer> (line 1) and Ctrl+Enter first');
      }
      if (isFullCsd) {
        // Full CSD: compile and (on the first run) start the engine.
        // Csound allows in-place redefinition, so subsequent full-CSD
        // evals overwrite the running instrument set.
        const status = await instance!.compileCSD(code);
        if (status < 0) throw new Error(`csound compile error (status ${status})`);
        if (!started) {
          await instance!.start();
          started = true;
        }
      } else if (isInstrBlock) {
        // Redefine an instrument or UDO at runtime, no engine restart.
        // `compileOrc` adds the block to the running performance; `evalCode`
        // only parses/validates without applying. For live redefinition we
        // need the former (confirmed by kunstmusik/csound-live-code workflow).
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
    } catch (err) {
      log({ runtime: 'csound', level: 'error', msg: String(err) });
      throw err;
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
