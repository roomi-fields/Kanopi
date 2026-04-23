import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

interface HydraInstance {
  hush: () => void;
  // Internal state we reach into to rescue NaN time (see rescueHydraTime).
  synth: { time: number };
}
type HydraCtor = new (opts: { canvas: HTMLCanvasElement; detectAudio?: boolean; makeGlobal?: boolean }) => HydraInstance;

let HydraClass: HydraCtor | undefined;
let instance: HydraInstance | undefined;
let canvasEl: HTMLCanvasElement | undefined;
let pending: HTMLCanvasElement | undefined;
let warnInstalled = false;

const adapterEvents: EventBus = createEventBus();

function emitLifecycle(name: 'eval' | 'stop', fileId: string) {
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'trigger',
    runtime: 'hydra',
    source: fileId,
    t: performance.now(),
    name
  });
}

/**
 * hydra-synth has three places that `console.warn` from inside the rAF loop,
 * one per frame, so a broken patch produces hundreds of lines in seconds:
 *   - glsl-source.js:30   `console.warn('shader could not compile', err)`
 *   - format-arguments.js:82 `console.warn('ERROR', e)` when a uniform
 *     callback throws (e.g. `osc(() => undefinedVar).out()`)
 *   - hydra-synth.js:476 `console.warn('Error during tick():', e)`
 * None of these are routed through a public error event. We shadow
 * `console.warn` globally and suppress any duplicate flood signature within
 * a short window while letting the first occurrence through to our log bus.
 */
const FLOOD_SIGNATURES = ['shader could not compile', 'ERROR', 'Error during tick'];
function installWarnShadow(log: LogPush) {
  if (warnInstalled) return;
  warnInstalled = true;
  const seen = new Map<string, number>();
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    const head = typeof args[0] === 'string' ? args[0] : '';
    const sig = FLOOD_SIGNATURES.find((s) => head.includes(s));
    if (sig) {
      const now = performance.now();
      const last = seen.get(sig) ?? 0;
      if (now - last > 2000) {
        seen.set(sig, now);
        const detail = args.length > 1 ? String(args[1]) : '';
        log({ runtime: 'hydra', level: 'error', msg: `${sig}: ${detail}` });
        // First occurrence of a flood signature: auto-hush so the broken
        // chain stops firing every frame. Matches a user Ctrl+. exactly.
        try { instance?.hush(); } catch { /* best-effort */ }
      }
      // Suppress the per-frame duplicates (both in the browser console and
      // in our log bus). Original warn is swallowed intentionally.
      return;
    }
    originalWarn.apply(console, args);
  };
}

/**
 * hydra-synth's EvalSandbox copies `window[speed|bpm|fps|update|afterUpdate]`
 * into `this.synth.*` on every tick. Strudel's `@strudel/web` injects its
 * own `speed` and `bpm` as pattern-method functions onto `globalThis`, which
 * then poison Hydra's render loop: `this.synth.time += dt * 0.001 * <fn>`
 * evaluates to NaN, and `time=NaN` as a GLSL uniform makes every shader
 * render fully black. Call this before any Hydra frame can fire to
 * re-assert the numeric defaults.
 */
function rescueHydraGlobals() {
  const g = globalThis as unknown as { speed?: unknown; fps?: unknown };
  if (typeof g.speed !== 'number') g.speed = 1;
  if (typeof g.fps !== 'undefined' && typeof g.fps !== 'number') g.fps = undefined;
}

/**
 * Once `this.synth.time` becomes NaN (from a polluted `speed` during the
 * first ticks after construction), every subsequent `synth.time += dt * …`
 * stays NaN — and the `time` GLSL uniform passed to every shader is NaN,
 * which the driver typically renders as fully black. hydra-synth has no
 * public API to reset time, so we poke the internal field directly.
 */
function rescueHydraTime() {
  if (!instance) return;
  if (!Number.isFinite(instance.synth.time)) instance.synth.time = 0;
}

async function ensure(log: LogPush): Promise<boolean> {
  if (!canvasEl) {
    log({ runtime: 'hydra', level: 'warn', msg: 'no canvas attached yet' });
    return false;
  }
  if (!HydraClass) {
    const m = (await import('hydra-synth')) as unknown as { default: HydraCtor };
    HydraClass = m.default;
  }
  if (!instance) {
    // Critical: rescue BEFORE construction. hydra-synth's constructor
    // starts the rAF loop on line 124 and creates the sandbox on line 127,
    // so the first frames read `window.speed` directly. If Strudel has
    // already clobbered it with a pattern-method function, the very first
    // tick corrupts `this.synth.time` to NaN — and the first user eval
    // renders black until the next rescueHydraTime() call. Resetting
    // the globals here lets Hydra boot with clean numeric defaults.
    rescueHydraGlobals();
    instance = new HydraClass({ canvas: canvasEl, detectAudio: false, makeGlobal: true });
    installWarnShadow(log);
  }
  rescueHydraGlobals();
  return true;
}

export function attachHydraCanvas(el: HTMLCanvasElement) {
  canvasEl = el;
  if (pending && el === pending) pending = undefined;
}

export const hydraAdapter: RuntimeAdapter = {
  id: 'hydra',
  events: adapterEvents,
  setBpm(bpm: number, _log: LogPush) {
    // Expose as a global so hydra patches can reference `bpm` (e.g. speed = bpm/120)
    (globalThis as unknown as { bpm: number }).bpm = bpm;
  },
  onBeat(count: number, _log: LogPush) {
    // Hydra patches can now do `.rotate(beat)`, `.scrollX(beat/8)`, etc.
    // `count` is monotonic since transport start; patches take `beat % 4`
    // if they want the position-in-bar.
    (globalThis as unknown as { beat: number }).beat = count;
  },
  onBar(count: number, _log: LogPush) {
    (globalThis as unknown as { bar: number }).bar = count;
  },
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) throw new Error('hydra not ready');
    rescueHydraGlobals();
    rescueHydraTime();
    try {
      // hydra-synth API exposes globals (osc, noise, out...) when makeGlobal: true
      // eslint-disable-next-line no-new-func
      new Function(code)();
      log({ runtime: 'hydra', level: 'info', msg: `eval ok (${code.length}b)` });
      emitLifecycle('eval', src.fileId);
    } catch (err) {
      log({ runtime: 'hydra', level: 'error', msg: `js: ${String(err)}` });
      throw err;
    }
  },
  async stop(src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) return;
    rescueHydraGlobals();
    rescueHydraTime();
    try {
      // Use the instance's hush() — same path as a Ctrl+. in hydra-editor.
      // It clears all sources, zeroes every output (not just o0), resets
      // update/afterUpdate callbacks, and calls synth.render(o[0]).
      //
      // NOTE: we never toggle `canvas.style.display`. Chrome drops the WebGL
      // context on hidden canvases, and regl can't recover when the canvas
      // comes back — subsequent re-evals render black. A hushed canvas is
      // already visually transparent (solid(0,0,0,0) + CSS opacity 0.85),
      // so there's nothing to hide.
      instance?.hush();
      log({ runtime: 'hydra', level: 'info', msg: 'cleared' });
      emitLifecycle('stop', src.fileId);
    } catch (err) {
      log({ runtime: 'hydra', level: 'error', msg: String(err) });
    }
  },
  async dispose() {
    instance = undefined;
  }
};
