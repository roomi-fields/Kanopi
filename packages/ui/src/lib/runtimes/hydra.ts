import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';

type HydraCtor = new (opts: { canvas: HTMLCanvasElement; detectAudio?: boolean; makeGlobal?: boolean }) => unknown;

let HydraClass: HydraCtor | undefined;
let instance: unknown;
let canvasEl: HTMLCanvasElement | undefined;
let pending: HTMLCanvasElement | undefined;

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
  setBpm(bpm: number, _log: LogPush) {
    // Expose as a global so hydra patches can reference `bpm` (e.g. speed = bpm/120)
    (globalThis as unknown as { bpm: number }).bpm = bpm;
  },
  async evaluate(code: string, _src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) return;
    try {
      // hydra-synth API exposes globals (osc, noise, out...) when makeGlobal: true
      // eslint-disable-next-line no-new-func
      new Function(code)();
      if (canvasEl) canvasEl.style.display = 'block';
      log({ runtime: 'hydra', level: 'info', msg: `eval ok (${code.length}b)` });
    } catch (err) {
      log({ runtime: 'hydra', level: 'error', msg: String(err) });
    }
  },
  async stop(_src: EvalSource, log: LogPush) {
    if (!(await ensure(log))) return;
    try {
      // eslint-disable-next-line no-new-func
      new Function('solid(0,0,0,0).out()')();
      if (canvasEl) canvasEl.style.display = 'none';
      log({ runtime: 'hydra', level: 'info', msg: 'cleared' });
    } catch (err) {
      log({ runtime: 'hydra', level: 'error', msg: String(err) });
    }
  },
  async dispose() {
    instance = undefined;
  }
};
