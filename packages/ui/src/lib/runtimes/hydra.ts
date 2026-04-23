import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

interface HydraInstance {
  hush: () => void;
}
type HydraCtor = new (opts: { canvas: HTMLCanvasElement; detectAudio?: boolean; makeGlobal?: boolean }) => HydraInstance;

let HydraClass: HydraCtor | undefined;
let instance: HydraInstance | undefined;
let canvasEl: HTMLCanvasElement | undefined;
let pending: HTMLCanvasElement | undefined;

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
    instance = new HydraClass({ canvas: canvasEl, detectAudio: false, makeGlobal: true });
  }
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
    // hydra-synth swallows GLSL compile errors silently via
    // console.warn('shader could not compile', err) (cf glsl-source.js:30).
    // There's no public API to subscribe to shader errors, so we briefly
    // shadow console.warn during the eval to capture them. The JS parse/
    // runtime path still throws normally through new Function().
    const originalWarn = console.warn;
    let glslError: Error | undefined;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].includes('shader could not compile')) {
        const detail = args.length > 1 ? String(args[1]) : '(no detail)';
        glslError = new Error(`[GLSL] ${detail}`);
      }
      originalWarn.apply(console, args);
    };
    try {
      // hydra-synth API exposes globals (osc, noise, out...) when makeGlobal: true
      // eslint-disable-next-line no-new-func
      new Function(code)();
      if (canvasEl) canvasEl.style.display = 'block';
      if (glslError) {
        // Broken shader. Stop the render loop so hydra-synth doesn't re-attempt
        // compilation every rAF and flood the console with stack traces (the
        // failing chain would keep firing `console.warn('shader could not
        // compile', …)` at 60 Hz otherwise). `instance.hush()` re-applies
        // solid(0,0,0,0) on every output and resets source buffers cleanly —
        // same path as a Ctrl+. from the user, no residue.
        try { instance?.hush(); } catch { /* best-effort */ }
        if (canvasEl) canvasEl.style.display = 'none';
        log({ runtime: 'hydra', level: 'error', msg: `glsl: ${glslError.message}` });
        throw glslError;
      }
      log({ runtime: 'hydra', level: 'info', msg: `eval ok (${code.length}b)` });
      emitLifecycle('eval', src.fileId);
    } catch (err) {
      if (!glslError) {
        log({ runtime: 'hydra', level: 'error', msg: `js: ${String(err)}` });
      }
      throw err;
    } finally {
      console.warn = originalWarn;
    }
  },
  async stop(src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) return;
    try {
      // eslint-disable-next-line no-new-func
      new Function('solid(0,0,0,0).out()')();
      if (canvasEl) canvasEl.style.display = 'none';
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
