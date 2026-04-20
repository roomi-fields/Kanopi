import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus, TokenLocation } from '../events/types';

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
}

let analyserAttached = false;
let currentAnalyser: AnalyserNode | undefined;

/**
 * Returns the Strudel master AnalyserNode if the audio path has been tapped.
 * Visualizers use this to recover state when they mount AFTER the one-shot
 * `audio-attach` event has already fired.
 */
export function getStrudelAnalyser(): AnalyserNode | undefined {
  return currentAnalyser;
}

function attachAnalyserOnce() {
  if (analyserAttached) return;
  if (!mod) return;
  const ctrl = mod.getSuperdoughAudioController?.();
  const master = ctrl?.output?.destinationGain;
  const ctx = mod.getAudioContext?.();
  if (!master || !ctx) return;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  master.connect(analyser);
  analyserAttached = true;
  currentAnalyser = analyser;
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'audio-attach',
    runtime: 'strudel',
    source: 'master',
    t: performance.now(),
    analyser,
    channels: 2
  });
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
        await mod!.initStrudel({
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
          }
        } as Record<string, unknown>);
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
        // TEMPORARY: load dirt-samples by default so s("bd sd hh cp") works
        // out of the box. Phase F (Library panel) will make this opt-in and
        // move the hardcoded list into a catalog. Removing this before
        // Library exists leaves the flagship Strudel flow mute.
        await mod!.samples('github:tidalcycles/dirt-samples');
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
    // First successful eval: tap the superdough master gain to feed scope/
    // spectrum visualizers. Safe to call repeatedly — attachAnalyserOnce is
    // idempotent and only runs once per AudioContext lifetime.
    attachAnalyserOnce();
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
