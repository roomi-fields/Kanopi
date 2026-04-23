import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';

/**
 * p5 lifecycle entry points the user can declare as bare functions.
 * They are captured from the eval closure and lifted onto the p5 instance
 * so the engine picks them up — matching the canonical p5 Web Editor
 * style where users write `function setup() {…}` without a prefix.
 */
const P5_CALLBACKS = [
  'setup', 'draw', 'preload', 'windowResized',
  'mousePressed', 'mouseReleased', 'mouseMoved', 'mouseDragged',
  'mouseClicked', 'doubleClicked', 'mouseWheel',
  'keyPressed', 'keyReleased', 'keyTyped',
  'touchStarted', 'touchMoved', 'touchEnded'
];

// p5's instance type is heavy; we only care about the bits we touch.
interface P5Instance {
  remove: () => void;
  setup?: (...args: unknown[]) => void;
  draw?: (...args: unknown[]) => void;
  beat: number;
  bar: number;
  bpm: number;
  [key: string]: unknown;
}
type P5Ctor = new (sketch: (p: P5Instance) => void, container?: HTMLElement) => P5Instance;

let P5Class: P5Ctor | undefined;
let instance: P5Instance | undefined;
let containerEl: HTMLElement | undefined;

const adapterEvents: EventBus = createEventBus();

function emitLifecycle(name: 'eval' | 'stop', fileId: string) {
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'trigger',
    runtime: 'p5',
    source: fileId,
    t: performance.now(),
    name
  });
}

async function ensureP5Ctor(log: LogPush): Promise<boolean> {
  if (!containerEl) {
    log({ runtime: 'p5', level: 'warn', msg: 'no container attached yet' });
    return false;
  }
  if (!P5Class) {
    const m = (await import('p5')) as unknown as { default: P5Ctor };
    P5Class = m.default;
  }
  return true;
}

export function attachP5Container(el: HTMLElement) {
  containerEl = el;
}

/**
 * Build the JS body for the sketch callback. User code executes inside
 * `with (__scope__)`, so bare identifiers (`ellipse`, `background`,
 * `mouseX`, `beat`, `bar`, `bpm`, …) resolve against the p5 instance
 * directly — live getters for `mouseX`/`width`/`height` stay live.
 *
 * After the user body runs, the suffix lifts any lifecycle callback the
 * user declared (`function setup()`, `function draw()`, …) from the
 * closure-local scope onto the p5 instance so the engine picks them up.
 * Declared functions don't go into the `with` scope object automatically;
 * they're bound in the enclosing Function's local scope, which we then
 * forward explicitly.
 *
 * Scope injection is ADAPTER_SPEC §5bis Plan A.
 */
function buildSketchBody(userCode: string): string {
  const capture = P5_CALLBACKS
    .map((n) => `if (typeof ${n} === 'function') __scope__.${n} = ${n};`)
    .join('\n    ');
  return `
  with (__scope__) {
    ${userCode}
    ${capture}
  }`;
}

function runSketch(p: P5Instance, userCode: string) {
  // eslint-disable-next-line no-new-func
  const fn = new Function('__scope__', buildSketchBody(userCode));
  fn(p);
}

export const p5Adapter: RuntimeAdapter = {
  id: 'p5',
  events: adapterEvents,
  setBpm(bpm: number, _log: LogPush) {
    // Expose on the p5 instance (not globalThis). Patches read it from
    // scope: `ellipse(width/2, height/2, bpm)`, etc.
    if (instance) instance.bpm = bpm;
  },
  onBeat(count: number, _log: LogPush) {
    if (instance) instance.beat = count;
  },
  onBar(count: number, _log: LogPush) {
    if (instance) instance.bar = count;
  },
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    if (!(await ensureP5Ctor(log))) throw new Error('p5 not ready');
    try {
      // Destroy the previous sketch before starting the new one. p5 keeps
      // rAF loops per instance, so skipping remove() accumulates ghost
      // sketches that keep redrawing with stale state.
      if (instance) {
        try { instance.remove(); } catch { /* best-effort */ }
        instance = undefined;
      }
      // p5 passes the instance into the sketch callback ONCE, during
      // construction. We run user code inside that callback so the user
      // can declare setup/draw/etc. on the closure and have them lifted
      // onto the instance via buildSketchBody's capture suffix.
      let pending: P5Instance | undefined;
      const inst = new (P5Class as P5Ctor)((p) => {
        p.beat = 0;
        p.bar = 0;
        p.bpm = 128;
        runSketch(p, code);
        pending = p;
      }, containerEl);
      instance = pending ?? inst;
      log({ runtime: 'p5', level: 'info', msg: `eval ok (${code.length}b)` });
      emitLifecycle('eval', src.fileId);
    } catch (err) {
      log({ runtime: 'p5', level: 'error', msg: `js: ${String(err)}` });
      throw err;
    }
  },
  async stop(src: EvalSource, log: LogPush) {
    try {
      if (instance) {
        try { instance.remove(); } catch { /* best-effort */ }
        instance = undefined;
      }
      log({ runtime: 'p5', level: 'info', msg: 'cleared' });
      emitLifecycle('stop', src.fileId);
    } catch (err) {
      log({ runtime: 'p5', level: 'error', msg: String(err) });
    }
  },
  async dispose() {
    if (instance) {
      try { instance.remove(); } catch { /* best-effort */ }
      instance = undefined;
    }
  }
};
