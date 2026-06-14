import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import type { Runtime } from '../core-mock';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';
import { parseBP3, parseSeFile } from 'bp3-frontend';
import type { FileRef, SeEngineSettings } from 'bp3-frontend';
import { compileBPS } from 'bpscript/src/transpiler/index.js';
import { createBPx } from 'bpx';
import { BUNDLED_SE } from './bp3-aux';
// MIDI output sink for the beta-ensemble. runtime-midi OWNS the ISO-BP3 MIDI
// path (hub/contrats/kanopi-runtime-midi.md); Kanopi feeds it the SAME raw BPx
// timed tokens it sends to the WebAudio dispatcher, on the SAME AudioContext
// clock, and runtime-midi emits the MIDI bytes. Consumed AS-IS — no
// reimplementation of the MIDI transport here.
import { MidiSink } from 'runtime-midi';
// Core runtime, reused AS-IS (no port): the dispatcher schedules timed tokens
// on the WebAudio transport; the resolver turns pitch names into frequencies.
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';
import { WebAudioTransport } from '../../../../core/src/dispatcher/transports/webaudio.js';
// Text grammars (bols, words, numbers — half the corpus) route here instead of
// audio: a timestamped-symbol console, fed AS-IS through the same dispatcher.
import { TextTransport } from '../../../../core/src/dispatcher/transports/text.js';
import { Resolver } from '../../../../core/src/dispatcher/resolver.js';
import { textStream } from '../../stores/textstream.svelte';

/**
 * BPx language adapters (PRIMARY vertical slice).
 *
 * Two languages reach audible WebAudio output through the SAME upstream BPx
 * engine and Kanopi's own dispatcher — only the front-end differs:
 *
 *   .gr  : source → parseBP3 ───────────────────────────┐
 *   .bps : source → compileBPS → BP3 grammar text → parseBP3 ┤
 *                                                        ▼
 *     → SceneAST → createBPx().loadGrammar → derive() → TimedToken[]
 *     → Dispatcher.load() → Dispatcher.start() → WebAudioTransport (+ MIDI sink)
 *
 * Glue only. The frontends (bp3-frontend, bpscript), the engine (bpx) and the
 * dispatcher / transport / resolver (core) are all consumed as-is. BPScript
 * transpiles TO a BP3 grammar (`compileBPS().grammar`), so the `.bps` path just
 * feeds that text into the SAME BP3 front-end the keystone `.gr` uses — no
 * second engine, no token-shape shim. The TimedToken shape BPx emits
 * (`{ token, start, end }` in ms) is exactly what `Dispatcher.load()` reads.
 *
 * The slice scopes to ONE engine instance + ONE transport per file.
 */

// Western 12-TET resolver config. BP3 grammars in the slice use pitch names
// like `C4 D4 E4`; the resolver needs an alphabet + tuning + temperament to
// turn them into frequencies. This is a fixed default for the slice (the
// language's own alphabet/scale system is a SECONDARY concern).
const TWELVE_TET = Array.from({ length: 12 }, (_, i) => Math.pow(2, i / 12));
function makeWesternResolver(): Resolver {
  return new Resolver({
    alphabet: { notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], alterations: { '#': 1, b: -1 } },
    octaves: {
      position: 'suffix',
      separator: '',
      registers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      default: 4
    },
    tuning: { degrees: [0, 2, 4, 5, 7, 9, 11], baseHz: 440, baseNote: 'A', baseRegister: 4 },
    temperament: { divisions: 12, period_ratio: 2, ratios: TWELVE_TET }
  });
}

// Solfège 12-TET resolver — same grid, do/re/mi note names. Many BP3 grammars
// (Bol Processor heritage) emit French solfège terminals (`do3`, `fa#3`,
// `sol4`); the western resolver leaves those untouched, so a sealed transpose
// would never reach their pitch. Same degrees as western (do=la-relative C),
// la = A440. This is a BP3-naming concern kept in the BP3 adapter, NOT woven
// into the clean core resolver (guardrail: ISO-BP3 stays isolated).
const SOLFEGE_NOTES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
function makeSolfegeResolver(): Resolver {
  return new Resolver({
    alphabet: { notes: SOLFEGE_NOTES, alterations: { '#': 1, b: -1 } },
    octaves: {
      position: 'suffix',
      separator: '',
      registers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      default: 4
    },
    tuning: { degrees: [0, 2, 4, 5, 7, 9, 11], baseHz: 440, baseNote: 'la', baseRegister: 4 },
    temperament: { divisions: 12, period_ratio: 2, ratios: TWELVE_TET }
  });
}

// Pick the resolver matching the grammar's note naming. BP3 grammars are either
// western (`C4`) or solfège (`do4`); a derivation is homogeneous, so the first
// pitched terminal decides. Solfège names are checked longest-first so `sol`
// isn't shadowed by `so`/`s`. Falls back to western (the slice default).
function pickResolver(tokens: { token: string }[]): Resolver {
  const solfegeHead = /^(do|re|mi|fa|sol|la|si)([#b]|\d|$)/;
  for (const t of tokens) {
    if (solfegeHead.test(t.token)) return makeSolfegeResolver();
    if (/^[A-G]([#b]|\d|$)/.test(t.token)) return makeWesternResolver();
  }
  return makeWesternResolver();
}

// A front-end turns language source into a derivable BP3 SceneAST + parse
// errors. Both languages produce the SAME `ast` shape (BPScript compiles down
// to a BP3 grammar that the BP3 front-end then parses), so the rest of the
// chain is shared verbatim.
type ParseError = { line?: number; message: string };
type Frontend = (code: string) => {
  ast: unknown | null;
  errors: ParseError[];
  // BP3 `-se.*` engine timing resolved from the grammar's file reference, when
  // available — drives native tempo (e.g. acceleration 750 ms vs 1000 ms).
  settings?: SeEngineSettings;
};

// Resolve the `-se` engine settings a grammar references. parseBP3 surfaces the
// reference in `fileRefs`; we load the bundled `-se` text and let the upstream
// parser interpret it. Absent reference / unbundled name → undefined (the
// engine then uses its 1000 ms default; graceful, never throws).
function resolveSeSettings(fileRefs: FileRef[]): SeEngineSettings | undefined {
  const ref = fileRefs.find((r) => r.prefix === 'se');
  if (!ref) return undefined;
  const text = BUNDLED_SE[ref.name];
  if (!text) return undefined;
  try {
    return parseSeFile(text).engine;
  } catch {
    return undefined;
  }
}

// The BP3 front-end injects a synthetic actor carrying the grammar-wide output
// mode (decision routage-texte-midi): notes → 'midi', bols/words/numbers →
// 'text'. We route the whole grammar by it; absent/unknown falls back to audio.
function readTransportKind(ast: unknown): 'midi' | 'text' | undefined {
  const actors = (ast as { actors?: { properties?: { transport?: { key?: string } } }[] } | null)
    ?.actors;
  const key = actors?.[0]?.properties?.transport?.key;
  return key === 'text' || key === 'midi' ? key : undefined;
}

// `.gr` — native BP3 grammar text straight into the BP3 front-end.
const WESTERN_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const grFrontend: Frontend = (code) => {
  const { ast, errors, fileRefs } = parseBP3(code, { alphabetNames: WESTERN_NOTES });
  return {
    ast,
    errors: errors.map((e) => ({ line: e.line, message: e.message })),
    settings: resolveSeSettings(fileRefs)
  };
};

// `.bps` — BPScript transpiles to a BP3 grammar (`compileBPS().grammar`), which
// we feed into the SAME BP3 front-end as `.gr`. The compiled alphabet drives
// parseBP3's terminal recognition. Two upstream tools, glue only.
const bpsFrontend: Frontend = (code) => {
  const c = compileBPS(code);
  if (c.errors.length > 0) {
    return { ast: null, errors: c.errors.map((e) => ({ line: e.line, message: e.message })) };
  }
  const alphabetNames = c.alphabet?.length ? c.alphabet : WESTERN_NOTES;
  const { ast, errors } = parseBP3(c.grammar, { alphabetNames });
  return { ast, errors: errors.map((e) => ({ line: e.line, message: e.message })) };
};

interface BP3Voice {
  dispatcher: InstanceType<typeof Dispatcher>;
  midiSink?: MidiSink;
}

// One-shot info when no MIDI output port is present (the normal headless / no
// hardware case): WebAudio still plays, so this is informational, not an error,
// and we log it once to avoid spamming on every eval. Shared across both
// adapters — the MIDI availability of the machine is a global fact.
let midiUnavailableLogged = false;

// Probe Web MIDI permission ONCE (cached). Without MIDI access, requestMIDIAccess
// rejects (NotAllowedError); we record that and never construct a MidiSink —
// runtime-midi's transport logs a console.error on denial (transports/midi.js:49),
// pure noise on a machine without MIDI. Probing ourselves keeps that denial silent.
let midiProbe: Promise<boolean> | undefined;
function webMidiAvailable(): Promise<boolean> {
  if (!midiProbe) {
    const req = (navigator as Navigator & { requestMIDIAccess?: () => Promise<unknown> })
      .requestMIDIAccess;
    midiProbe = req
      ? req
          .call(navigator)
          .then(() => true)
          .catch(() => false)
      : Promise.resolve(false);
  }
  return midiProbe;
}

// Current global tempo, kept in sync with the central clock via `setBpm`.
// A grammar derives at this tempo and live voices retune to it. Shared: both
// languages play under the one central transport tempo. Defaults to the clock's
// own default so a fresh page already matches the transport.
let currentBpm = 128;

let audioCtx: AudioContext | undefined;
// The dispatcher's lookahead clock schedules notes against `audioCtx.currentTime`.
// On the first eval after page load the context can still be `suspended` (its
// clock frozen near 0), so we must AWAIT the resume before starting playback —
// otherwise only the notes inside the first 100 ms lookahead window get
// scheduled and any grammar whose events are spread out (anacrusis / sparse
// rhythms) falls silent.
async function getCtx(): Promise<AudioContext> {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') await audioCtx.resume();
  return audioCtx;
}

function srcKey(s: EvalSource): string {
  return s.actorId ?? s.fileId;
}

/**
 * Build a BPx-language adapter. `frontend` is the only thing that varies between
 * `.gr` (parseBP3) and `.bps` (compileBPS → parseBP3); everything downstream —
 * derive, dispatch, MIDI, stop, tempo, dispose — is shared verbatim. Each
 * adapter owns its own event bus and live-voice map; the AudioContext, MIDI
 * probe and global tempo are shared module singletons.
 */
function makeBpxAdapter(
  id: Runtime,
  extensions: readonly string[],
  frontend: Frontend
): RuntimeAdapter {
  const adapterEvents: EventBus = createEventBus();
  // One dispatcher per source (file or actor block). Re-evaluating a source
  // stops its previous dispatcher before scheduling the new derivation.
  const voices = new Map<string, BP3Voice>();

  function emitLifecycle(name: 'eval' | 'stop', fileId: string) {
    adapterEvents.emit({
      schemaVersion: 1,
      type: 'trigger',
      runtime: id,
      source: fileId,
      t: performance.now(),
      name
    });
  }

  return {
    id,
    extensions,
    events: adapterEvents,
    async evaluate(code: string, src: EvalSource, log: LogPush) {
      const { ast, errors, settings } = frontend(code);
      if (errors.length > 0) {
        const msg = errors.map((e) => `line ${e.line ?? '?'}: ${e.message}`).join('; ');
        log({ runtime: id, level: 'error', msg: `parse: ${msg}` });
        throw new Error(`${id} parse error: ${msg}`);
      }
      if (!ast) {
        const msg = 'no grammar found (empty AST)';
        log({ runtime: id, level: 'error', msg });
        throw new Error(`${id}: ${msg}`);
      }

      let tokens;
      try {
        const bpx = createBPx({ tempo: currentBpm, settings });
        bpx.loadGrammar(ast);
        tokens = bpx.derive().tokens;
      } catch (err) {
        log({ runtime: id, level: 'error', msg: `derive: ${String(err)}` });
        throw err;
      }

      if (!tokens || tokens.length === 0) {
        const msg = 'derivation produced no tokens';
        log({ runtime: id, level: 'error', msg });
        throw new Error(`${id}: ${msg}`);
      }

      const key = srcKey(src);
      const prev = voices.get(key);
      if (prev) {
        prev.dispatcher.stop();
        prev.midiSink?.stop();
      }

      const ctx = await getCtx();
      const dispatcher = new Dispatcher(ctx);

      // Text grammars route the whole derivation to the symbolic console: no
      // resolver (terminals are symbols, not pitches), no audio, no MIDI. The
      // dispatcher schedules them on the same clock, so symbols stream in time.
      if (readTransportKind(ast) === 'text') {
        textStream.setSource(id);
        dispatcher.addTransport(
          'default',
          new TextTransport({
            onSymbol: (s) =>
              textStream.push({ token: s.token, startSec: s.startSec, durSec: s.durSec })
          })
        );
        dispatcher.load(tokens);
        dispatcher.start(undefined, { loop: true });
        voices.set(key, { dispatcher });
        log({ runtime: id, level: 'info', msg: `text out [${key}] (${tokens.length} symbols)` });
        emitLifecycle('eval', src.fileId);
        return;
      }

      const resolver = pickResolver(tokens);
      dispatcher.addTransport('default', new WebAudioTransport(ctx, { resolver }));
      // The dispatcher routes via per-token resolver/transport lookup; this
      // global resolver is the fallback the WebAudio path uses for pitches.
      (dispatcher as unknown as { _resolver: Resolver })._resolver = resolver;

      dispatcher.load(tokens);
      // Loop so an armed actor sustains like a Strudel pattern: the grammar's
      // derivation repeats at each cycle boundary until the actor is toggled off,
      // the transport stops, or the page hushes. A Ctrl+Enter on a standalone
      // grammar goes through this same code, so it loops too — intended: "play
      // the grammar" means keep playing it, and Ctrl+. silences.
      dispatcher.start(undefined, { loop: true });

      // MIDI sink: route the SAME raw BPx tokens to runtime-midi, on the SAME
      // AudioContext clock — but only when Web MIDI access is actually granted
      // (probed once, silently). Otherwise skip it entirely: WebAudio playback
      // stays intact and the console stays clean on machines without MIDI.
      let midiSink: MidiSink | undefined;
      if (await webMidiAvailable()) {
        try {
          const sink = new MidiSink(ctx);
          const hasPort = await sink.init();
          if (hasPort) {
            sink.load(tokens);
            sink.start();
            midiSink = sink;
            log({ runtime: id, level: 'info', msg: `midi out [${key}]` });
          }
        } catch (err) {
          // A MIDI failure must never take down the (already-playing) WebAudio path.
          log({ runtime: id, level: 'info', msg: `midi sink skipped: ${String(err)}` });
        }
      } else if (!midiUnavailableLogged) {
        midiUnavailableLogged = true;
        log({ runtime: id, level: 'info', msg: 'no Web MIDI — WebAudio only' });
      }

      voices.set(key, { dispatcher, midiSink });
      log({ runtime: id, level: 'info', msg: `eval ok [${key}] (${tokens.length} tokens)` });
      emitLifecycle('eval', src.fileId);
    },
    setBpm(bpm: number, _log: LogPush) {
      currentBpm = bpm;
      // Retune live voices so a tempo change from the central clock (or a
      // `@map tempo` MIDI knob) takes effect without re-deriving. The dispatcher
      // reads `_tempo` for its beats→seconds conversion and pushes it onto the
      // clock; setting both keeps already-scheduled and future cycles in step.
      for (const voice of voices.values()) {
        const d = voice.dispatcher as unknown as { _tempo?: number; clock?: { tempo?: number } };
        d._tempo = bpm;
        if (d.clock) d.clock.tempo = bpm;
      }
      // The MIDI sink owns its own internal dispatcher (runtime-midi private); we
      // don't reach into it to retune live. Its timing comes from the tokens it
      // was loaded with at the previous tempo, so a tempo change takes effect on
      // the next eval (re-derivation at the new `currentBpm`). Consistent with the
      // integration rule: no poking upstream internals.
    },
    async stop(src: EvalSource, log: LogPush) {
      const key = srcKey(src);
      // `__hush__` is the core's "stop everything" sentinel (transport stop,
      // Ctrl+. panic): no single voice matches it, so we tear down every live
      // dispatcher. Without this, stopping the transport left playback looping.
      if (key === '__hush__') {
        for (const voice of voices.values()) {
          voice.dispatcher.stop();
          voice.midiSink?.stop();
        }
        voices.clear();
        log({ runtime: id, level: 'info', msg: 'hush (all voices)' });
        emitLifecycle('stop', src.fileId);
        return;
      }
      const voice = voices.get(key);
      if (voice) {
        voice.dispatcher.stop();
        voice.midiSink?.stop();
        voices.delete(key);
      }
      log({ runtime: id, level: 'info', msg: `stop [${key}]` });
      emitLifecycle('stop', src.fileId);
    },
    async dispose() {
      for (const voice of voices.values()) {
        try {
          voice.dispatcher.stop();
          voice.midiSink?.stop();
        } catch {
          /* engine may already be torn down */
        }
      }
      voices.clear();
    }
  };
}

// `.gr` keystone (Bol Processor native grammar) and `.bps` (BPScript) — same
// engine, different front-end.
export const bp3Adapter: RuntimeAdapter = makeBpxAdapter('bp3', ['.gr'], grFrontend);
export const bpscriptAdapter: RuntimeAdapter = makeBpxAdapter('bpscript', ['.bps'], bpsFrontend);
