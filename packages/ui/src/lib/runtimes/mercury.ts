import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

type MercuryInstance = {
  code: (str: string) => { errors?: unknown[] };
  /** Calls `Tone.start()` + starts the Tone.Transport — must run in a user gesture. */
  resume: () => void;
  silence: () => void;
  setBPM: (bpm: number, ramp?: number) => void;
};

let instance: MercuryInstance | undefined;
let visualHintLogged = false;

const adapterEvents: EventBus = createEventBus();

function emitLifecycle(name: 'eval' | 'stop', fileId: string) {
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'trigger',
    runtime: 'mercury',
    source: fileId,
    t: performance.now(),
    name
  });
}

async function ensure(log: LogPush): Promise<boolean> {
  if (!instance) {
    // Upstream exports `Mercury` as a named export (cf node_modules/mercury-engine/index.js).
    // Philosophy 2: we intentionally do NOT pass `hydra` or `p5canvas` options —
    // Mercury's upstream cross-runtime hooks are a no-op by design in Kanopi
    // (cf KANOPI_PRINCIPLES §3 corollary). `visual()` in user code lands
    // silently; `warnOnVisualHook` logs a one-shot pointer.
    const { Mercury } = await import('mercury-engine');
    instance = new Mercury({
      onload: () => log({ runtime: 'mercury', level: 'info', msg: 'engine loaded' }),
      onmidi: (evt) => log({ runtime: 'mercury', level: 'info', msg: `midi: ${String(evt)}` })
    });
  }
  return true;
}

/**
 * Detect `visual(…)` calls in user code and log a one-shot hint pointing at
 * principle 3. The engine itself short-circuits the trigger (because no
 * canvas wrapper is passed), but the user who wrote it expects something
 * to happen — so we tell them why it didn't.
 */
function warnOnVisualHook(code: string, log: LogPush) {
  if (visualHintLogged) return;
  // Crude match — good enough. `visual(` with optional whitespace after the
  // identifier, not prefixed by a word char (so `bisVisual(` doesn't trip).
  if (!/(^|[^A-Za-z0-9_])visual\s*\(/.test(code)) return;
  visualHintLogged = true;
  log({
    runtime: 'mercury',
    level: 'info',
    msg: 'visual() hook ignored — cross-runtime is orchestrated via .kanopi directives (cf KANOPI_PRINCIPLES §3)'
  });
}

export const mercuryAdapter: RuntimeAdapter = {
  id: 'mercury',
  extensions: ['.mercury'],
  // ADAPTER_SPEC §1bis (b): Mercury produces pitched events → `notes`.
  outputType: 'notes',
  events: adapterEvents,
  setBpm(bpm: number, _log: LogPush) {
    try {
      instance?.setBPM(bpm);
    } catch {
      /* best-effort */
    }
  },
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) throw new Error('mercury not ready');
    warnOnVisualHook(code, log);
    // `resume()` is idempotent: no-op once Tone.Transport is running, and must
    // be called inside a user gesture (Ctrl+Enter is one). Without it Tone's
    // AudioContext stays suspended and `.code()` schedules to silence.
    try {
      instance!.resume();
    } catch {
      /* best-effort */
    }
    let tree: { errors?: unknown[] };
    try {
      tree = instance!.code(code);
    } catch (err) {
      log({ runtime: 'mercury', level: 'error', msg: `engine: ${String(err)}` });
      throw err;
    }
    if (tree.errors && tree.errors.length > 0) {
      // mercury-lang puts parse / semantic errors here. Stringify each and
      // surface the first line — the block flash + Console panel show it.
      const first = String(tree.errors[0]);
      log({ runtime: 'mercury', level: 'error', msg: `parse: ${first}` });
      throw new Error(first);
    }
    log({ runtime: 'mercury', level: 'info', msg: `eval ok (${code.length}b)` });
    emitLifecycle('eval', src.fileId);
  },
  async stop(src: EvalSource, log: LogPush) {
    try {
      instance?.silence();
      log({ runtime: 'mercury', level: 'info', msg: 'silenced' });
      emitLifecycle('stop', src.fileId);
    } catch (err) {
      log({ runtime: 'mercury', level: 'error', msg: String(err) });
    }
  },
  async dispose() {
    // mercury-engine has no explicit teardown path — it detaches the tree
    // when `silence()` is called. Drop the reference so `ensure()` can
    // reconstruct if needed.
    try {
      instance?.silence();
    } catch {
      /* ignore */
    }
    instance = undefined;
    visualHintLogged = false;
  }
};
