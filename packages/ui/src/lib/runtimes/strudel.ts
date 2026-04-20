import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus, TokenLocation } from '../events/types';

interface StrudelMod {
  initStrudel: (opts?: Record<string, unknown>) => Promise<unknown>;
  evaluate: (code: string, autoplay?: boolean) => Promise<unknown>;
  hush: () => void;
  samples: (url: string | Record<string, unknown>, base?: string) => Promise<unknown>;
  getAudioContext?: () => AudioContext;
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

function normalizeLocation(
  loc: unknown,
  fileId: string
): [number, number, string] | undefined {
  if (Array.isArray(loc) && typeof loc[0] === 'number' && typeof loc[1] === 'number') {
    return [loc[0], loc[1], fileId];
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
    if (typeof fromOffset === 'number' && typeof toOffset === 'number' && !Number.isNaN(fromOffset) && !Number.isNaN(toOffset)) {
      return [fromOffset, toOffset, fileId];
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
    else if (typeof obj.note === 'number') {
      pitch = obj.note as number;
      name = String(obj.note);
    }
    if (typeof obj.note === 'number' && pitch === undefined) pitch = obj.note as number;
    if (typeof obj.n === 'number') pitch = pitch ?? (obj.n as number);
    if (typeof obj.gain === 'number') gain = obj.gain as number;
  } else if (typeof v === 'string') {
    name = v;
  } else if (typeof v === 'number') {
    name = String(v);
    pitch = v;
  }
  const rawLocs = hap.context?.locations;
  const locations: TokenLocation[] | undefined = rawLocs
    ? (rawLocs
        .map((l) => normalizeLocation(l, activeFileId))
        .filter((l): l is [number, number, string] => l !== undefined) as TokenLocation[])
    : undefined;
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'token',
    runtime: 'strudel',
    source: activeFileId,
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
            const err = new Error(detail.message ?? 'strudel error');
            latchedError = err;
            emitError(err);
          }
        });
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
const slots = new Map<string, string>();

function composite(): string {
  return [...slots.values()].map((c) => `$: (${c.trim()})`).join('\n\n');
}

async function flush(m: StrudelMod): Promise<void> {
  if (slots.size === 0) {
    m.hush();
    return;
  }
  await m.evaluate(composite());
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
    slots.set(slot, code);
    activeFileId = src?.fileId ?? slot;
    stopped = false;
    // Strudel swallows runtime errors into its logger, which fires onEvalError
    // DURING the await below. We clear the latch first, then throw after if an
    // error was captured, so the outer .then() chain sees a real rejection.
    latchedError = undefined;
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
    log({ runtime: 'strudel', level: 'info', msg: `eval ok [${slot}] (${code.length}b)` });
  },
  async stop(src: EvalSource, log: LogPush) {
    try {
      const m = await ensure();
      const slot = src?.actorId ?? src?.fileId;
      if (!slot || slot === '__hush__') {
        stopped = true;
        slots.clear();
        m.hush();
        log({ runtime: 'strudel', level: 'info', msg: 'hush (all slots)' });
        return;
      }
      slots.delete(slot);
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
