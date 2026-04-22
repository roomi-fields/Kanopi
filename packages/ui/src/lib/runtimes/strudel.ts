import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus, TokenLocation } from '../events/types';

// Shape of a @strudel/draw Drawer instance (draw.mjs:136). Kept local — we
// don't call through a type-checked import, we consume the dynamic module.
interface DrawerInstance {
  start: (scheduler: unknown) => void;
  stop: () => void;
  invalidate: (scheduler: unknown, t?: number) => void;
  setDrawTime?: (drawTime: readonly number[]) => void;
}

interface StrudelMod {
  initStrudel: (opts?: Record<string, unknown>) => Promise<unknown>;
  evaluate: (code: string, autoplay?: boolean) => Promise<unknown>;
  hush: () => void;
  samples: (url: string | Record<string, unknown>, base?: string) => Promise<unknown>;
  getAudioContext?: () => AudioContext;
  getSuperdoughAudioController?: () => {
    output?: {
      destinationGain?: GainNode;
    };
  };
  // Re-exported from @strudel/transpiler via `export * from` in web.mjs.
  // Called by bridgeInlineWidgets() to teach web's transpiler which chain
  // methods are inline widgets (so it rewrites `._X()` → `._X('<id>')`).
  registerWidgetType?: (type: string) => void;
}

// Strudel hap: the minimum surface we rely on at runtime. Kept loose on
// purpose — Strudel's internals drift; we only touch well-known fields.
interface StrudelHap {
  whole?: { begin: number; end: number };
  part?: { begin: number; end: number };
  value?: Record<string, unknown> | string | number;
  context?: {
    // Versions of @strudel/core vary — historically [from, to] tuples, now
    // { start: { line, column, offset }, end: { line, column, offset } }.
    locations?: Array<unknown>;
    [k: string]: unknown;
  };
}

// Parse a Strudel note literal ("c4", "f#3", "eb5", "C4", "C#4"...) into a
// MIDI note number. Returns undefined for anything we can't confidently map.
const NOTE_BASE: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function parseNoteToMidi(s: string): number | undefined {
  const m = /^([a-gA-G])([#b]?)(-?\d+)$/.exec(s.trim());
  if (!m) return undefined;
  const base = NOTE_BASE[m[1].toLowerCase()];
  if (base === undefined) return undefined;
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const oct = parseInt(m[3], 10);
  // MIDI: C-1 = 0, C4 = 60 (octave + 1) × 12 offset.
  return (oct + 1) * 12 + base + acc;
}

// Filter + remap a hap's `context.locations` from composite-space to
// source-doc space. Returns a shallow-cloned hap with its locations rewritten
// as `{start, end}` objects (the shape `highlightMiniLocations` expects per
// highlight.mjs:63). Returns undefined when the hap is inactive or its
// locations don't map to the current file — dropping it prevents the
// visibleMiniLocations StateField from keying on stale composite offsets.
function hapWithMappedLocations(hap: StrudelHap, time: number): unknown | undefined {
  const active = (hap as unknown as { isActive?: (t: number) => boolean }).isActive;
  if (typeof active !== 'function' || !active.call(hap, time)) return undefined;
  const rawLocs = hap.context?.locations;
  if (!rawLocs || !rawLocs.length) return undefined;
  const mapped: Array<{ start: number; end: number }> = [];
  for (const raw of rawLocs) {
    const pair = rawOffsetsFromLocation(raw);
    if (!pair) continue;
    const src = mapCompositeToSource(pair[0], pair[1]);
    if (!src) continue;
    mapped.push({ start: src.from, end: src.to });
  }
  if (!mapped.length) return undefined;
  return { ...hap, context: { ...(hap.context ?? {}), locations: mapped } };
}

// Extract (from,to) composite offsets from a strudel location object.
// Handles both legacy [from,to] tuples and current {start:number,end:number}.
function rawOffsetsFromLocation(loc: unknown): [number, number] | undefined {
  if (Array.isArray(loc) && typeof loc[0] === 'number' && typeof loc[1] === 'number') {
    return [loc[0], loc[1]];
  }
  if (loc && typeof loc === 'object') {
    const o = loc as { start?: unknown; end?: unknown };
    const fromOffset = typeof o.start === 'object' && o.start && 'offset' in (o.start as object)
      ? Number((o.start as { offset: unknown }).offset)
      : typeof o.start === 'number'
      ? o.start
      : undefined;
    const toOffset = typeof o.end === 'object' && o.end && 'offset' in (o.end as object)
      ? Number((o.end as { offset: unknown }).offset)
      : typeof o.end === 'number'
      ? o.end
      : undefined;
    if (typeof fromOffset === 'number' && typeof toOffset === 'number'
        && !Number.isNaN(fromOffset) && !Number.isNaN(toOffset)) {
      return [fromOffset, toOffset];
    }
  }
  return undefined;
}

// Anything listening for "the last Strudel eval failed" — used by CMEditor's
// eval-tracker so we can turn an async runtime error into a red flash.
export type StrudelErrorListener = (err: unknown) => void;
const errorListeners = new Set<StrudelErrorListener>();
export function onStrudelError(cb: StrudelErrorListener): () => void {
  errorListeners.add(cb);
  return () => errorListeners.delete(cb);
}
function emitError(err: unknown) {
  for (const cb of errorListeners) cb(err);
}

export type StrudelStatus = 'idle' | 'loading' | 'ready' | 'error';
let status: StrudelStatus = 'idle';
const statusListeners = new Set<(s: StrudelStatus) => void>();
function setStatus(s: StrudelStatus) {
  status = s;
  for (const cb of statusListeners) cb(s);
}
export function strudelStatus(): StrudelStatus { return status; }
export function onStrudelStatus(cb: (s: StrudelStatus) => void): () => void {
  statusListeners.add(cb);
  cb(status);
  return () => statusListeners.delete(cb);
}

let mod: StrudelMod | undefined;
let initPromise: Promise<unknown> | undefined;

// Strudel's async errors fire via onEvalError / strudel.log DURING our
// await m.evaluate() — not after. We latch the last one so the adapter's
// evaluate() can throw on exit and the outer .then chain never resolves as ok.
let latchedError: unknown | undefined;

// Per-adapter event bus. Relayed into core.events by real-core at startup.
const adapterEvents: EventBus = createEventBus();
// Active fileId bound to the latest eval call — used as default for token.locations.
let activeFileId: string = 'strudel';
// Stopped flag prevents haps scheduled pre-hush from emitting after stop().
let stopped = false;

function emitTokenFromHap(
  hap: StrudelHap,
  targetTime: number,
  cps: number,
  audioCtx: AudioContext | undefined
) {
  if (stopped) return;
  // Wall-clock conversion: Strudel targetTime is audio-clock seconds.
  const t = audioCtx
    ? performance.now() + (targetTime - audioCtx.currentTime) * 1000
    : performance.now();
  const whole = hap.whole ?? hap.part;
  const cycleDur = whole ? Number(whole.end) - Number(whole.begin) : 0;
  const durationMs = cps > 0 ? (cycleDur / cps) * 1000 : 0;
  // Pull a human-friendly name from hap.value.
  let name = 'token';
  let pitch: number | undefined;
  let gain: number | undefined;
  const v = hap.value;
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (typeof obj.s === 'string') name = obj.s;
    else if (typeof obj.sound === 'string') name = obj.sound as string;
    else if (typeof obj.note === 'string') name = obj.note as string;
    if (typeof obj.note === 'number') pitch = obj.note as number;
    else if (typeof obj.note === 'string') pitch = parseNoteToMidi(obj.note as string);
    if (typeof obj.n === 'number' && pitch === undefined) pitch = obj.n as number;
    if (typeof obj.gain === 'number') gain = obj.gain as number;
  } else if (typeof v === 'string') {
    name = v;
    pitch = parseNoteToMidi(v);
  } else if (typeof v === 'number') {
    name = String(v);
    pitch = v;
  }
  const rawLocs = hap.context?.locations;
  const locations: TokenLocation[] | undefined = rawLocs
    ? (rawLocs
        .map((l) => rawOffsetsFromLocation(l))
        .map((pair) => (pair ? mapCompositeToSource(pair[0], pair[1]) : undefined))
        .filter((m): m is { from: number; to: number; fileId: string } => m !== undefined)
        .map((m) => [m.from, m.to, m.fileId] as TokenLocation))
    : undefined;
  // Fall back to the file bound by the latest evaluate() if the mapping
  // didn't resolve (e.g. locations carry an odd shape we don't know).
  const source = locations?.[0]?.[2] ?? activeFileId;
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'token',
    runtime: 'strudel',
    source,
    t,
    name: name.normalize('NFC'),
    pitch,
    gain,
    duration: durationMs,
    locations: locations && locations.length ? locations : undefined
  });
}

// Inline widget names cm registers on Pattern.prototype via registerWidget()
// in @strudel/codemirror/widget.mjs:107–142. Source of truth — don't duplicate
// this list if cm adds/removes entries; grep widget.mjs for `registerWidget(`.
const INLINE_WIDGET_METHODS = ['_pianoroll', '_scope', '_spectrum', '_punchcard', '_spiral', '_pitchwheel'] as const;

/**
 * Bridge cm's inline-widget prototype patches onto @strudel/web's Pattern.
 *
 * @strudel/codemirror/widget.mjs:86 does
 *   `Pattern.prototype[type] = function(id, options) { return fn(id, options, this); }`
 * where `Pattern` is cm's import from `@strudel/core`. @strudel/web's dist
 * inlines its OWN Pattern (Vite dedupe can't deduplicate inlined deps), so
 * user code running through web.evaluate never sees cm's patches and
 * `._pianoroll()` resolves to undefined. We import Pattern from @strudel/core
 * directly (resolves to cm's patched instance thanks to resolve.dedupe), read
 * the patched methods, and install the SAME function references on web's
 * Pattern.prototype. No reimplementation: the function body is still cm's
 * closure, calling cm's setWidget into cm's widgetElements map — which is
 * what cm's BlockWidget.toDOM() reads from.
 *
 * We also call `mod.registerWidgetType(name)` on each method so web's
 * transpiler (also inlined in web's dist) rewrites `._X()` → `._X('<id>')`
 * and emits a widget config on `options.meta.widgets` for `afterEval`.
 *
 * Glue line count: 3 (+ 1 type cast). Everything else is a comment.
 * Phase 2.1 task 1.3bis.
 */
async function bridgeInlineWidgets(m: StrudelMod): Promise<void> {
  // Force cm's widget.mjs to execute before we read core.Pattern.prototype.
  // Our CMEditor already imports widgetPlugin from this proxy at mount, so in
  // practice it has already run — but this await protects the scratch case
  // where a user evals before any CMEditor is mounted.
  await import('./strudel-cm');
  // @ts-expect-error — @strudel/core has no .d.ts (same as @strudel/web elsewhere in this file).
  const coreMod = await import('@strudel/core');
  const corePattern = (coreMod as { Pattern?: { prototype?: Record<string, (...a: unknown[]) => unknown> } }).Pattern;
  if (!corePattern?.prototype) return;
  const cmProto = corePattern.prototype!;
  const webProto = (m as unknown as { Pattern?: { prototype?: Record<string, unknown> } }).Pattern?.prototype;
  if (!webProto) return;
  for (const name of INLINE_WIDGET_METHODS) {
    if (typeof cmProto[name] === 'function') webProto[name] = cmProto[name];
    m.registerWidgetType?.(name);
  }
}

async function ensure(): Promise<StrudelMod> {
  if (!mod) {
    setStatus('loading');
    mod = (await import('@strudel/web')) as unknown as StrudelMod;
  }
  if (!initPromise) {
    initPromise = (async () => {
      try {
        // Strudel's async errors never reject m.evaluate() — they surface
        // through these callbacks DURING the evaluate await, and through a
        // 'strudel.log' DOM event as a safety net for scheduler ticks.
        // Drawer wiring, in mirror of @strudel/codemirror/codemirror.mjs
        // (StrudelMirror's drawer — codemirror.mjs:175-224, 287-288). Needed
        // for viz methods that register painters via `Pattern.prototype.onPaint`
        // (spiral / pitchwheel / punchcard / wordfall + their `_X` widget
        // variants), since `onPaint` is inert without a Drawer iterating
        // `state.controls.painters` each frame. `.draw()`-based viz
        // (pianoroll/scope/spectrum/fscope) runs its own rAF loop and
        // doesn't need this. Phase 2.1 task 1.3ter.
        // @ts-expect-error — @strudel/draw has no .d.ts
        const drawMod = await import('@strudel/draw');
        const DrawerCtor = (drawMod as { Drawer?: new (...a: unknown[]) => DrawerInstance }).Drawer;
        const getDrawContext = (drawMod as { getDrawContext?: () => CanvasRenderingContext2D }).getDrawContext;
        const cleanupDraw = (drawMod as { cleanupDraw?: (clear?: boolean, id?: string) => void }).cleanupDraw;
        // `drawTime = [lookbehind, lookahead]` seconds. Upstream StrudelMirror
        // uses [-2, 2] when painters are active, [0, 0] otherwise to avoid
        // querying a 4-second window when only highlight is needed.
        // Cache the cm proxy exports — the Drawer callback runs on every
        // animation frame, and re-`import()`ing is wasteful even when Vite
        // memoizes the promise. Resolve once, read pointers every frame.
        const cmProxy = await import('./strudel-cm');

        let drawer: DrawerInstance | undefined;
        let scheduler: unknown;
        if (typeof DrawerCtor === 'function' && typeof getDrawContext === 'function') {
          drawer = new DrawerCtor((haps: unknown[], time: number, _: unknown, painters: Array<(ctx: CanvasRenderingContext2D, t: number, h: unknown[], dt: readonly number[]) => void>) => {
            const ctx = getDrawContext();
            // Mini-notation highlight — mirrors StrudelMirror's per-frame call
            // (codemirror.mjs:175-178). Upstream highlightMiniLocations reads
            // `hap.context.locations` which arrive in composite-space (Kanopi
            // wraps each slot in an IIFE, shifting every offset). We remap to
            // source-space so the `start:end` IDs match those from
            // updateMiniLocations() in afterEval — otherwise the
            // visibleMiniLocations StateField keys never intersect with
            // miniLocations and nothing highlights.
            const view = currentEditorView() as Parameters<typeof cmProxy.highlightMiniLocations>[0] | undefined;
            if (view && typeof cmProxy.highlightMiniLocations === 'function') {
              const activeHaps: unknown[] = [];
              for (const h of haps as StrudelHap[]) {
                const mapped = hapWithMappedLocations(h, time);
                if (mapped) activeHaps.push(mapped);
              }
              try { cmProxy.highlightMiniLocations(view, time, activeHaps); }
              catch { /* dispatch race shouldn't halt the frame */ }
            }
            painters?.forEach((p) => {
              try { p(ctx, time, haps, [-2, 2]); } catch { /* painter glitch shouldn't halt the frame */ }
            });
          }, [-2, 2]);
        }

        const repl = await mod!.initStrudel({
          onEvalError: (err: unknown) => {
            latchedError = err;
            emitError(err);
          },
          onError: (err: unknown) => {
            latchedError = err;
            emitError(err);
          },
          // editPattern runs before the scheduler receives the pattern, so we
          // can attach a non-dominant onTrigger hook that taps every hap
          // without affecting audio output. See @strudel/core pattern.mjs:843.
          editPattern: (pattern: unknown) => {
            stopped = false;
            const p = pattern as {
              onTrigger?: (
                cb: (hap: StrudelHap, currentTime: number, cps: number, targetTime: number) => void,
                dominant?: boolean
              ) => unknown;
            };
            if (typeof p?.onTrigger === 'function') {
              return p.onTrigger((hap, _currentTime, cps, targetTime) => {
                emitTokenFromHap(hap, targetTime, cps, mod?.getAudioContext?.());
              }, false);
            }
            return pattern;
          },
          // Drawer lifecycle — mirrors StrudelMirror's onToggle (codemirror.mjs:
          // 186-203). On start, the drawer subscribes to the scheduler and
          // begins iterating painters each animation frame. On stop, it halts,
          // cleanupDraw clears every lingering `.draw()` rAF + the #test-canvas
          // contents, AND updateMiniLocations(view, []) clears the base
          // mini-notation decorations — without this the last active char
          // stays outlined after Ctrl+. because the visibleMiniLocations
          // StateField never receives a fresh dispatch.
          onToggle: (started: boolean) => {
            if (!drawer || !scheduler) return;
            try {
              if (started) drawer.start(scheduler);
              else {
                drawer.stop();
                cleanupDraw?.(true);
                const view = currentEditorView() as Parameters<typeof cmProxy.updateMiniLocations>[0] | undefined;
                if (view && typeof cmProxy.updateMiniLocations === 'function') {
                  try { cmProxy.updateMiniLocations(view, []); } catch { /* best-effort */ }
                }
              }
            } catch (err) { console.warn('[kanopi/strudel] drawer toggle', err); }
          },
          // afterEval fires after the transpiler has produced widget configs
          // for inline `._X()` calls. Each config carries `to` as an offset
          // into the TRANSPILED COMPOSITE (our IIFE wrapper + Strudel's own
          // AST rewrites), so we remap it to the user's source-doc offset
          // via mapCompositeToSource — without this CM6 throws "Position N
          // out of range" for any multi-slot eval (the composite is always
          // longer than any single slot's source). Widgets whose `to`
          // doesn't fall inside a known slot range are dropped.
          //
          // Slider widgets are filtered out here until phase 2.1 task 1.5
          // wires the bidirectional slider<->state sync.
          //
          // Finally, the drawer is invalidated (codemirror.mjs:221-224) so
          // `.onPaint`-registered painters on the freshly-evaluated pattern
          // get collected for the next frame. Without this, spiral / pitchwheel
          // / punchcard remain blank after eval.
          afterEval: (options: { meta?: { widgets?: unknown[]; miniLocations?: number[][] }; pattern?: unknown }) => {
            const rawWidgets = options?.meta?.widgets ?? [];
            const rawMini = options?.meta?.miniLocations ?? [];
            const view = currentEditorView() as { state?: { doc?: { length: number } } } | undefined;
            if (view) {
              const docLen = view.state?.doc?.length ?? 0;

              // Widget configs — remap composite-space `to` → source-doc, drop
              // out-of-range and slider widgets (task 1.5 will wire sliders).
              const widgets: unknown[] = [];
              for (const w of rawWidgets) {
                const cfg = w as { type?: string; to?: number; id?: string; from?: number };
                if (cfg.type === 'slider') continue;
                if (typeof cfg.to !== 'number') continue;
                const mapped = mapCompositeToSource(cfg.to, cfg.to);
                if (!mapped) continue;
                if (mapped.to < 0 || mapped.to > docLen) continue;
                widgets.push({ ...cfg, to: mapped.to, from: mapped.from });
              }
              if (widgets.length && typeof cmProxy.updateWidgets === 'function') {
                try { cmProxy.updateWidgets(view as Parameters<typeof cmProxy.updateWidgets>[0], widgets); }
                catch (err) { console.warn('[kanopi/strudel] widget dispatch failed', err); }
              }

              // Mini-notation locations — transpiler emits tuples [from, to,
              // value]; upstream highlight.mjs:27-38 only reads [from, to].
              // Same composite→source remap as widgets. `updateMiniLocations`
              // sets the base `miniLocations` StateField; per-frame
              // `highlightMiniLocations` (in the Drawer) picks which IDs to
              // outline. Without this call, the highlight StateField has no
              // ranges to intersect with active haps and nothing lights up.
              const mini: Array<[number, number]> = [];
              for (const loc of rawMini) {
                if (!Array.isArray(loc) || typeof loc[0] !== 'number' || typeof loc[1] !== 'number') continue;
                const mapped = mapCompositeToSource(loc[0], loc[1]);
                if (!mapped) continue;
                if (mapped.from < 0 || mapped.to > docLen) continue;
                mini.push([mapped.from, mapped.to]);
              }
              if (typeof cmProxy.updateMiniLocations === 'function') {
                try { cmProxy.updateMiniLocations(view as Parameters<typeof cmProxy.updateMiniLocations>[0], mini); }
                catch (err) { console.warn('[kanopi/strudel] miniLocations dispatch failed', err); }
              }
            }
            if (drawer && scheduler && options?.pattern) {
              try {
                const getPainters = (options.pattern as { getPainters?: () => unknown[] }).getPainters;
                const hasPainters = typeof getPainters === 'function'
                  && getPainters.call(options.pattern).length > 0;
                drawer.setDrawTime?.(hasPainters ? [-2, 2] : [0, 0]);
                drawer.invalidate(scheduler);
              } catch (err) { console.warn('[kanopi/strudel] drawer invalidate', err); }
            }
          }
        } as Record<string, unknown>) as { scheduler?: unknown };
        scheduler = repl?.scheduler;
        document.addEventListener('strudel.log', (e) => {
          const detail = (e as CustomEvent).detail as { message?: string; type?: string };
          if (detail?.type === 'error') {
            let msg = detail.message ?? 'strudel error';
            // Turn strudel's terse "sound X not found!" into a hint that
            // actually tells the user what to do. Surfaces in the Console
            // panel and re-flashes the last-evaluated block red.
            const missing = /sound (\S+) not found/i.exec(msg);
            if (missing) {
              msg = `sound "${missing[1]}" is not loaded. Use a built-in synth (sine, sawtooth, square, triangle) or enable a sample bank via the Library panel.`;
            }
            const err = new Error(msg);
            latchedError = err;
            emitError(err);
          }
        });
        // Fullscreen variants (`.pianoroll() / .scope() / .spectrum() /
        // .tscope() / .fscope() / .spiral() / .pitchwheel() / .punchcard()
        // / .wordfall()`) run natively — @strudel/web's dist inlines
        // @strudel/draw + @strudel/webaudio which patch them on
        // mod.Pattern.prototype at web's load time. CMEditor pre-injects a
        // `#test-canvas` so @strudel/draw's getDrawContext() (draw.mjs:9)
        // picks it up instead of prepending a fullscreen overlay on
        // document.body. Phase 2.1 task 1.2.
        //
        // Inline variants (`._pianoroll() / ._scope() / ._spectrum() /
        // ._punchcard() / ._spiral() / ._pitchwheel()`) are patched on
        // Pattern.prototype by @strudel/codemirror/widget.mjs at its own
        // load time — but ONLY on the Pattern instance cm imports from
        // @strudel/core, which is NOT the Pattern web.mjs's evaluate uses
        // (each dist bundle inlines its own Pattern). See §4 of
        // docs/integrations/STRUDEL.md. We bridge by copying the function
        // reference from cm's graph onto web's Pattern.prototype — no
        // reimplementation, same closure, same widgetElements map, same
        // defaults. Phase 2.1 task 1.3bis.
        await bridgeInlineWidgets(mod!);
        // Sample banks are no longer hardcoded — the session declares them
        // via `@library <id>`, which `real-core.loadSession` applies through
        // `loadSampleBank(source)` below. Out-of-the-box the default session
        // starts with `@library dirt-samples` so `s("bd sd hh cp")` keeps
        // working without manual setup.
        setStatus('ready');
      } catch (err) {
        setStatus('error');
        throw err;
      }
    })();
  }
  await initPromise;
  return mod;
}

// Per-actor code slots. Strudel evaluates one big program at a time, so we
// keep each actor's source around and recombine as "$: <code>" lines on every
// eval/stop. That lets multiple actors coexist in the same Strudel runtime.
const slots = new Map<string, { code: string; fileId: string; docOffset: number }>();

// Per-slot composite-offset bookkeeping for mapping hap.context.locations
// (which come from the transpiler operating on the composite source) back to
// offsets inside the user's original file.
interface CompositeRange {
  fileId: string;
  codeStart: number; // offset of the first char of user code inside composite
  codeEnd: number;   // exclusive
  leadingOffset: number; // chars trimmed from the start of original code
  docOffset: number; // position of the evaluated block inside the source doc
}
let compositeRanges: CompositeRange[] = [];

// Per-slot evaluation errors captured during the last `flush`. When a slot's
// IIFE wrapper catches a ReferenceError (typo like `no(...)` instead of
// `note(...)`) or any other runtime throw, we record it here keyed by slotId.
// `adapter.evaluate` consults this map for the current-eval's slotId and
// re-throws so the editor flashes red on the exact block at fault — without
// taking down the other armed slots, which keep their composite entry.
const slotErrors = new Map<string, Error>();
// Subscribers notified whenever slotErrors changes (set/delete/clear). Used
// by the Actors panel to paint a block's LED red while it's erroring.
const slotErrorListeners = new Set<() => void>();
function notifySlotErrors() {
  for (const cb of slotErrorListeners) cb();
}
export function onSlotErrorChange(cb: () => void): () => void {
  slotErrorListeners.add(cb);
  return () => slotErrorListeners.delete(cb);
}
export function getSlotErrors(): ReadonlyMap<string, Error> {
  return slotErrors;
}

// Global error-report hook the wrapped slot code calls on catch. Exposed on
// `window` so the eval'd source can reach it (it runs inside Strudel's own
// `evaluate` sandbox, which doesn't share module scope). Strudel transpiles
// every string literal into a mini-notation Pattern, so we can't pass the
// slotId as a string — we use a numeric index that maps to the slotId via
// `compositeSlotIds`, rebuilt each `buildComposite` call.
const REPORT_FN = '__kanopiSlotError';
let compositeSlotIds: string[] = [];
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)[REPORT_FN] = (slotIdx: number, err: unknown) => {
    const id = compositeSlotIds[slotIdx];
    if (!id) return;
    slotErrors.set(id, err instanceof Error ? err : new Error(String(err)));
    notifySlotErrors();
  };
}

function buildComposite(): string {
  compositeRanges = [];
  compositeSlotIds = [];
  const parts: string[] = [];
  let pos = 0;
  const sep = '\n\n';
  // Each slot becomes: `$: ((() => { try { return <code>; } catch (e) { ... return silence } })())`
  // - The IIFE isolates the slot's execution: a runtime throw is caught,
  //   reported to the global `__kanopiSlotError` hook, and replaced with
  //   Strudel's `silence` pattern so composite evaluation keeps going.
  // - Code offsets for `compositeRanges` point at the user code inside the
  //   `return` statement, so mini-notation location mapping still works.
  const prefix = '$: ((() => { try { return ';
  let first = true;
  for (const [slotId, slot] of slots) {
    if (!first) {
      parts.push(sep);
      pos += sep.length;
    }
    parts.push(prefix);
    pos += prefix.length;
    const trimmed = slot.code.trimStart();
    const leadingOffset = slot.code.length - trimmed.length;
    const trimmedEnd = trimmed.trimEnd();
    const codeStart = pos;
    const codeEnd = pos + trimmedEnd.length;
    compositeRanges.push({
      fileId: slot.fileId,
      codeStart,
      codeEnd,
      leadingOffset,
      docOffset: slot.docOffset
    });
    parts.push(trimmedEnd);
    pos = codeEnd;
    // Numeric index into compositeSlotIds — Strudel transpile turns string
    // literals into mini-notation Patterns, numbers are left untouched.
    const idx = compositeSlotIds.length;
    compositeSlotIds.push(slotId);
    const tail = `; } catch (e) { ${REPORT_FN}(${idx}, e); return silence; } })())`;
    parts.push(tail);
    pos += tail.length;
    first = false;
  }
  return parts.join('');
}

function mapCompositeToSource(
  from: number,
  to: number
): { from: number; to: number; fileId: string } | undefined {
  for (const r of compositeRanges) {
    if (from >= r.codeStart && to <= r.codeEnd) {
      return {
        from: from - r.codeStart + r.leadingOffset + r.docOffset,
        to: to - r.codeStart + r.leadingOffset + r.docOffset,
        fileId: r.fileId
      };
    }
  }
  return undefined;
}

async function flush(m: StrudelMod): Promise<void> {
  if (slots.size === 0) {
    compositeRanges = [];
    m.hush();
    return;
  }
  await m.evaluate(buildComposite());
}

/**
 * Load a sample bank via Strudel's `samples(source)`. De-duplicated so the
 * same bank isn't fetched twice on repeated `loadSession` calls. Source is
 * whatever Strudel accepts: `github:user/repo`, full URL to strudel.json, etc.
 */
const loadedBanks = new Set<string>();
/**
 * Inline-widget support for Strudel's `._pianoroll()`, `._scope()`,
 * `._spectrum()` chain calls. @strudel/codemirror's `widgetPlugin` extension
 * does the CM6-side decoration work; we just need to dispatch the widget
 * configs produced by the transpiler (stashed on `options.meta.widgets`
 * during `afterEval`) into the right EditorView.
 *
 * Kanopi can have several Strudel files open at once, so we key views by
 * fileName and look them up from the active `src.fileId` at eval time.
 */
const strudelEditorViews = new Map<string, unknown>();
export function registerStrudelEditorView(fileId: string, view: unknown): void {
  strudelEditorViews.set(fileId, view);
}
export function unregisterStrudelEditorView(fileId: string): void {
  strudelEditorViews.delete(fileId);
}
function currentEditorView(): unknown | undefined {
  return strudelEditorViews.get(activeFileId);
}

export async function loadSampleBank(source: string): Promise<void> {
  if (loadedBanks.has(source)) return;
  const m = await ensure();
  await m.samples(source);
  loadedBanks.add(source);
}

/** Bank sources that should be in memory per the current session. */
let declaredBankSources = new Set<string>();

/**
 * Sync library declarations from `loadSession` against what's loaded.
 * Returns the list of sources that were removed from the declaration but
 * can't be truly unloaded — Strudel's `samples()` has no reverse (see
 * @strudel/webaudio's global soundMap, no `unloadSamples` API). The caller
 * surfaces these to the console so the user knows a page reload is needed
 * to actually drop them from memory.
 */
export function setDeclaredBanks(sources: string[]): { lingering: string[] } {
  const next = new Set(sources);
  const lingering: string[] = [];
  for (const src of loadedBanks) {
    if (!next.has(src) && declaredBankSources.has(src)) {
      lingering.push(src);
    }
  }
  declaredBankSources = next;
  return { lingering };
}

export const strudelAdapter: RuntimeAdapter = {
  id: 'strudel',
  events: adapterEvents,
  setBpm(bpm: number, _log: LogPush) {
    // Tidal convention: 1 cycle = 4 beats. CPS = bpm/60/4.
    // We eval a tiny Strudel expression that calls setcps (provided by @strudel/core via makeGlobal).
    if (!mod) return;
    try {
      // eslint-disable-next-line no-new-func
      new Function('bpm', 'setcps(bpm/60/4)')(bpm);
    } catch {
      /* setcps may not be installed yet */
    }
  },
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    // Strudel's evaluate logs parse/runtime errors via its internal logger
    // WITHOUT rejecting — so red flash there would need to sniff console.
    // We do catch syntax errors here via new Function(), after stripping
    // hash-comment lines (Kanopi's auto-generated file headers use `#`).
    const stripped = code.replace(/^\s*#[^\n]*$/gm, '');
    try {
      // eslint-disable-next-line no-new, no-new-func
      new Function(stripped);
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: `parse: ${String(err)}` });
      throw err;
    }

    const m = await ensure();
    const slot = src?.actorId ?? src?.fileId ?? '__scratch__';
    const fileId = src?.fileId ?? slot;
    const docOffset = src?.docOffset ?? 0;
    slots.set(slot, { code, fileId, docOffset });
    activeFileId = fileId;
    stopped = false;
    // Strudel swallows runtime errors into its logger, which fires onEvalError
    // DURING the await below. We clear the latch first, then throw after if an
    // error was captured, so the outer .then() chain sees a real rejection.
    latchedError = undefined;
    // Clear just this slot's previous error so a successful re-eval clears
    // the red state. Other slots keep their error status until re-evaluated.
    if (slotErrors.delete(slot)) notifySlotErrors();
    try {
      await flush(m);
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
      throw err;
    }
    if (latchedError !== undefined) {
      const err = latchedError;
      latchedError = undefined;
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
      throw err instanceof Error ? err : new Error(String(err));
    }
    // After composite eval, the IIFE wrapper has populated slotErrors for any
    // slot that threw at runtime. Re-throw only for the current slot — the
    // caller (CMEditor's runEval) flashes red on the right block. Other slots
    // with errors stay silent in the composite and keep their red state until
    // re-evaluated.
    const slotErr = slotErrors.get(slot);
    if (slotErr) {
      log({ runtime: 'strudel', level: 'error', msg: `[${slot}] ${slotErr.message}` });
      throw slotErr;
    }
    log({ runtime: 'strudel', level: 'info', msg: `eval ok [${slot}] (${code.length}b)` });
  },
  async stop(src: EvalSource, log: LogPush) {
    try {
      const m = await ensure();
      const slot = src?.actorId ?? src?.fileId;
      if (!slot || slot === '__hush__') {
        stopped = true;
        slots.clear();
        if (slotErrors.size > 0) {
          slotErrors.clear();
          notifySlotErrors();
        }
        m.hush();
        log({ runtime: 'strudel', level: 'info', msg: 'hush (all slots)' });
        return;
      }
      slots.delete(slot);
      if (slotErrors.delete(slot)) notifySlotErrors();
      if (slots.size === 0) stopped = true;
      await flush(m);
      log({ runtime: 'strudel', level: 'info', msg: `stop [${slot}]` });
    } catch (err) {
      log({ runtime: 'strudel', level: 'error', msg: String(err) });
    }
  },
  async dispose() {
    try {
      slots.clear();
      mod?.hush();
    } catch {
      /* ignore */
    }
  }
};

// Tidal files use Strudel as runtime (port JS de TidalCycles)
export const tidalAdapter: RuntimeAdapter = {
  ...strudelAdapter,
  id: 'tidal',
  setBpm: strudelAdapter.setBpm?.bind(strudelAdapter)
};
