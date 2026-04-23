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
/**
 * Timestamp of the most recent successful evaluate(). Kanopi's transport
 * emits a synthetic re-eval of every armed block right after a Ctrl+Enter
 * that starts the clock (real-core.evaluateBlock line 301 → clock.play()
 * → installBlockReplay subscribe → openBlocks.replayArmed()). Hydra and
 * Strudel both replace their existing state on re-eval, so the duplicate
 * is harmless there; p5 constructs a brand-new instance each call, which
 * spawns a second canvas until the first `remove()` catches up. A user
 * cannot Ctrl+Enter twice by hand inside 50ms, so we drop any eval that
 * fires within that window of the previous one.
 */
let lastEvalTime = 0;
const REEVAL_DEDUP_MS = 50;

/**
 * Remove every canvas currently living inside our container and ask p5
 * for each canvas's owning instance (`_pInst`, set by p5 on the canvas
 * during createCanvas) to dispose. A module-level `let instance` is
 * reset to `undefined` on Vite HMR swap, but the live p5 keeps its
 * rAF loop forever — its canvas lingers in the DOM and the sketch
 * keeps drawing over the new one. Clearing defensively before any
 * new instance boots guarantees a single canvas at a time.
 */
function cleanupOrphans() {
  if (!containerEl) return;
  const canvases = Array.from(containerEl.querySelectorAll('canvas'));
  for (const cv of canvases) {
    const p = (cv as unknown as { _pInst?: P5Instance })._pInst;
    if (p && typeof p.remove === 'function') {
      try { p.remove(); } catch { /* best-effort */ }
    } else {
      cv.remove();
    }
  }
}

// Vite HMR: dispose of the live p5 BEFORE the module swaps, so the new
// module boots with a clean container instead of a ghost sketch.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try { instance?.remove(); } catch { /* best-effort */ }
    cleanupOrphans();
    instance = undefined;
  });
}

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
    const now = performance.now();
    if (now - lastEvalTime < REEVAL_DEDUP_MS) {
      // Synthetic re-eval from Kanopi's transport replay — see comment on
      // lastEvalTime. The user's intent was evaluated a few ms ago.
      return;
    }
    lastEvalTime = now;
    try {
      // Destroy the previous sketch before starting the new one. p5 keeps
      // rAF loops per instance, so skipping remove() accumulates ghost
      // sketches that keep redrawing with stale state. cleanupOrphans()
      // also handles HMR ghosts that our `instance` reference has lost.
      if (instance) {
        try { instance.remove(); } catch { /* best-effort */ }
        instance = undefined;
      }
      cleanupOrphans();
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
      // Belt-and-braces: kill any ghost canvas the `instance` reference
      // didn't cover (HMR can orphan one before we get here).
      cleanupOrphans();
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
