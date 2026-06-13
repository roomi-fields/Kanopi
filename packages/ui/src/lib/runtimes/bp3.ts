import type { RuntimeAdapter, EvalSource, LogPush } from './adapter';
import { createEventBus } from '../events/bus';
import type { EventBus } from '../events/types';
import { parseBP3 } from 'bp3-frontend';
import { createBPx } from 'bpx';
// Core runtime, reused AS-IS (no port): the dispatcher schedules timed tokens
// on the WebAudio transport; the resolver turns pitch names into frequencies.
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';
import { WebAudioTransport } from '../../../../core/src/dispatcher/transports/webaudio.js';
import { Resolver } from '../../../../core/src/dispatcher/resolver.js';

/**
 * Bol Processor adapter (PRIMARY vertical slice).
 *
 * Wires a `.gr` grammar to audible WebAudio output through the upstream BPx
 * engine and Kanopi's own dispatcher:
 *
 *   source(.gr) → parseBP3 → SceneAST → createBPx().loadGrammar → derive()
 *   → TimedToken[] → Dispatcher.load() → Dispatcher.start() → WebAudioTransport
 *
 * Glue only. The frontend (bp3-frontend), the engine (bpx) and the dispatcher /
 * transport / resolver (core) are all consumed as-is. The TimedToken shape BPx
 * emits (`{ token, start, end }` in ms) is exactly what `Dispatcher.load()`
 * reads, so no token-shape shim is needed.
 *
 * The slice intentionally scopes to ONE engine instance + ONE transport per
 * file, no MIDI, no loop, no actor panel — those are SECONDARY iterations.
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

const adapterEvents: EventBus = createEventBus();

function emitLifecycle(name: 'eval' | 'stop', fileId: string) {
  adapterEvents.emit({
    schemaVersion: 1,
    type: 'trigger',
    runtime: 'bp3',
    source: fileId,
    t: performance.now(),
    name
  });
}

interface BP3Voice {
  dispatcher: InstanceType<typeof Dispatcher>;
}

let audioCtx: AudioContext | undefined;
function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

// One dispatcher per source (file or actor block). Re-evaluating a source
// stops its previous dispatcher before scheduling the new derivation.
const voices = new Map<string, BP3Voice>();
function srcKey(s: EvalSource): string {
  return s.actorId ?? s.fileId;
}

export const bp3Adapter: RuntimeAdapter = {
  id: 'bp3',
  extensions: ['.gr'],
  events: adapterEvents,
  async evaluate(code: string, src: EvalSource, log: LogPush) {
    const { ast, errors } = parseBP3(code, {
      alphabetNames: ['C', 'D', 'E', 'F', 'G', 'A', 'B']
    });
    if (errors.length > 0) {
      const msg = errors.map((e) => `line ${e.line}: ${e.message}`).join('; ');
      log({ runtime: 'bp3', level: 'error', msg: `parse: ${msg}` });
      throw new Error(`bp3 parse error: ${msg}`);
    }
    if (!ast) {
      const msg = 'no grammar found (empty AST)';
      log({ runtime: 'bp3', level: 'error', msg });
      throw new Error(`bp3: ${msg}`);
    }

    let tokens;
    try {
      const bpx = createBPx({ tempo: 120 });
      bpx.loadGrammar(ast);
      tokens = bpx.derive().tokens;
    } catch (err) {
      log({ runtime: 'bp3', level: 'error', msg: `derive: ${String(err)}` });
      throw err;
    }

    if (!tokens || tokens.length === 0) {
      const msg = 'derivation produced no tokens';
      log({ runtime: 'bp3', level: 'error', msg });
      throw new Error(`bp3: ${msg}`);
    }

    const key = srcKey(src);
    voices.get(key)?.dispatcher.stop();

    const ctx = getCtx();
    const resolver = makeWesternResolver();
    const dispatcher = new Dispatcher(ctx);
    dispatcher.addTransport('default', new WebAudioTransport(ctx, { resolver }));
    // The dispatcher routes via per-token resolver/transport lookup; this
    // global resolver is the fallback the WebAudio path uses for pitches.
    (dispatcher as unknown as { _resolver: Resolver })._resolver = resolver;

    dispatcher.load(tokens);
    dispatcher.start(undefined, { loop: false });

    voices.set(key, { dispatcher });
    log({ runtime: 'bp3', level: 'info', msg: `eval ok [${key}] (${tokens.length} tokens)` });
    emitLifecycle('eval', src.fileId);
  },
  async stop(src: EvalSource, log: LogPush) {
    const key = srcKey(src);
    const voice = voices.get(key);
    if (voice) {
      voice.dispatcher.stop();
      voices.delete(key);
    }
    log({ runtime: 'bp3', level: 'info', msg: `stop [${key}]` });
    emitLifecycle('stop', src.fileId);
  },
  async dispose() {
    for (const voice of voices.values()) {
      try {
        voice.dispatcher.stop();
      } catch {
        /* engine may already be torn down */
      }
    }
    voices.clear();
  }
};
