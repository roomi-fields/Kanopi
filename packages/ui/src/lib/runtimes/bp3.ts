import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import type { Runtime } from '../core-mock';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';
import { parseBP3 } from 'bp3-frontend';
import { compileBPS } from 'bpscript/src/transpiler/index.js';
import { createBPx } from 'bpx';
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
import { Resolver } from '../../../../core/src/dispatcher/resolver.js';

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

// A front-end turns language source into a derivable BP3 SceneAST + parse
// errors. Both languages produce the SAME `ast` shape (BPScript compiles down
// to a BP3 grammar that the BP3 front-end then parses), so the rest of the
// chain is shared verbatim.
type ParseError = { line?: number; message: string };
type Frontend = (code: string) => { ast: unknown | null; errors: ParseError[] };

// `.gr` — native BP3 grammar text straight into the BP3 front-end.
const WESTERN_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const grFrontend: Frontend = (code) => {
  const { ast, errors } = parseBP3(code, { alphabetNames: WESTERN_NOTES });
  return { ast, errors: errors.map((e) => ({ line: e.line, message: e.message })) };
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
      const { ast, errors } = frontend(code);
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
        const bpx = createBPx({ tempo: currentBpm });
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
      const resolver = makeWesternResolver();
      const dispatcher = new Dispatcher(ctx);
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
