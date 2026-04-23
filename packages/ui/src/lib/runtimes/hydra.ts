import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

/**
 * The live synth state hydra-synth exposes on `this.synth`. With
 * `makeGlobal: false` it does NOT also mirror these onto `window.*`,
 * so Kanopi's user-code scope reads them from this object only.
 */
interface HydraSynthState {
  time: number;
  bpm: number;
  speed: number;
  width: number;
  height: number;
  // Kanopi adds these transport fields so patches can do `.rotate(beat)`.
  beat: number;
  bar: number;
  // Generator factory functions + output + source registries. hydra-synth
  // attaches more properties at runtime (osc, solid, noise, shape, o0…o3,
  // s0…s3, render, hush, setResolution, setFunction, update, afterUpdate).
  // An index signature keeps us from enumerating the ~40-odd surface.
  [key: string]: unknown;
}

interface HydraInstance {
  hush: () => void;
  synth: HydraSynthState;
}

type HydraCtor = new (opts: {
  canvas: HTMLCanvasElement;
  detectAudio?: boolean;
  makeGlobal?: boolean;
}) => HydraInstance;

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
 * `console.warn` globally and suppress duplicate flood signatures within
 * a 2s window while letting the first occurrence through to our log bus
 * and auto-hushing to break the loop.
 */
const FLOOD_SIGNATURES = [
  'shader could not compile',
  'ERROR',                                // format-arguments.js:82 (uniform cb throw)
  'function does not return a number',    // format-arguments.js:78 (wrong return)
  'Error during tick'                     // hydra-synth.js:476
];
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
        try { instance?.hush(); } catch { /* best-effort */ }
      }
      return;
    }
    originalWarn.apply(console, args);
  };
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
    // makeGlobal: false — hydra-synth stops writing `window.osc`, `window.time`,
    // `window.speed`, etc. Its internal tick reads from `this.synth` (not
    // `window`), so Strudel/p5 can't poison shader uniforms via name collision.
    // User code gets every primitive via scope injection in `evaluate()`.
    // Cf ADAPTER_SPEC §5bis.
    instance = new HydraClass({ canvas: canvasEl, detectAudio: false, makeGlobal: false });
    installWarnShadow(log);
    // Seed Kanopi transport additions on synth so patches built around
    // `beat`/`bar` render correctly before the first transport tick.
    instance.synth.beat = 0;
    instance.synth.bar = 0;
  }
  return true;
}

export function attachHydraCanvas(el: HTMLCanvasElement) {
  canvasEl = el;
  if (pending && el === pending) pending = undefined;
}

/**
 * Evaluate user code inside the Hydra scope. `with (scope)` resolves every
 * bare identifier (`osc`, `solid`, `noise`, `o0`, `time`, `beat`, …) against
 * the synth object before falling back to the enclosing scope. `new Function`
 * bodies are non-strict by default, so `with` is legal here.
 */
function evalInHydraScope(code: string): void {
  if (!instance) throw new Error('hydra not ready');
  // eslint-disable-next-line no-new-func
  const fn = new Function('__scope__', `with (__scope__) { ${code}\n}`);
  fn(instance.synth);
}

export const hydraAdapter: RuntimeAdapter = {
  id: 'hydra',
  events: adapterEvents,
  setBpm(bpm: number, _log: LogPush) {
    // Write directly to synth (not globalThis) so Hydra patches reading
    // `bpm` from their scope see Kanopi's transport value, not the
    // hydra-synth default of 30.
    if (instance) instance.synth.bpm = bpm;
  },
  onBeat(count: number, _log: LogPush) {
    // `count` is monotonic since transport start; patches take `beat % 4`
    // if they want the position-in-bar.
    if (instance) instance.synth.beat = count;
  },
  onBar(count: number, _log: LogPush) {
    if (instance) instance.synth.bar = count;
  },
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) throw new Error('hydra not ready');
    try {
      evalInHydraScope(code);
      log({ runtime: 'hydra', level: 'info', msg: `eval ok (${code.length}b)` });
      emitLifecycle('eval', src.fileId);
    } catch (err) {
      log({ runtime: 'hydra', level: 'error', msg: `js: ${String(err)}` });
      throw err;
    }
  },
  async stop(src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) return;
    try {
      // Same path as a Ctrl+. in hydra-editor: clears sources, zeroes every
      // output, resets update/afterUpdate callbacks, renders o[0].
      // No canvas display toggling — Chrome drops WebGL contexts on hidden
      // canvases and regl can't recover. A hushed canvas is already
      // visually transparent (solid(0,0,0,0) + CSS opacity 0.85).
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
