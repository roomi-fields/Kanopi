import { describe, it, expect } from 'vitest';
// The dispatcher and resolver are the runtime core, imported the same way the
// bp3 adapter imports them (packages/core ships raw ESM).
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';
import { Resolver } from '../../../../core/src/dispatcher/resolver.js';

// Proof harness for E-016 ("post-dispatch parity"): the engine seals the
// resolved velocity/transpose/channel state onto each terminal token as
// `runtimeQualifiers` (M5+ contract). This test proves the Kanopi dispatcher
// CONSUMES that payload exactly like BPx's own MIDI emitter (emit/midiEvents.ts):
//   - transpose stacks onto the grid shift  (C4 -12 → an octave lower)
//   - vel / velocity overrides the running velocity for that token
//   - a sealed vel:0 mutes the terminal (native silences it → no event)
//   - chan overrides the running channel
// alan/beatrix can only prove END-TO-END once BPx stops emitting
// `runtimeQualifiers: null` (emit/emitFromInstances.ts) — the consumer below is
// ready and waiting, exercised here on synthetic tokens that carry the payload.

const TWELVE_TET = Array.from({ length: 12 }, (_, i) => Math.pow(2, i / 12));
function westernResolver() {
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

interface SentEvent {
  token: string;
  velocity: number;
  chan?: number;
}

interface TimedTokenLike {
  token: string;
  start: number;
  end: number;
  type?: string;
  runtimeQualifiers?: Record<string, number> | null;
}

// The dispatcher exposes a typed public API; the scheduling internals this
// harness drives (resolver, control defaults, cursor, _schedule) are private,
// reached through a cast — the same shape bp3.ts uses for `_resolver`.
interface DispatcherInternals {
  addTransport(name: string, t: unknown): void;
  setControlDefaults(d: Record<string, number>): void;
  load(tokens: TimedTokenLike[]): void;
  _resolver: unknown;
  _running: boolean;
  _cursor: number;
  _loopOffset: number;
  _schedule(until: number): void;
}

/**
 * Build a dispatcher with a capturing transport, flush a token list
 * synchronously through the real scheduling path, and return what the
 * transport received. No audio context needed: a stub `currentTime` + the
 * default clock start time of 0 make `_schedule(Infinity)` deterministic.
 */
function dispatch(tokens: TimedTokenLike[]): SentEvent[] {
  const sent: SentEvent[] = [];
  const fakeCtx = { currentTime: 0, state: 'running', resume() {} };
  const d = new Dispatcher(fakeCtx as unknown as AudioContext) as unknown as DispatcherInternals;
  d.addTransport('default', {
    send(evt: SentEvent) {
      sent.push({ token: evt.token, velocity: evt.velocity, chan: evt.chan });
    },
    close() {}
  });
  d._resolver = westernResolver();
  d.setControlDefaults({ vel: 64, chan: 1 });
  d.load(tokens);
  d._running = true;
  d._cursor = 0;
  d._loopOffset = 0;
  d._schedule(Infinity);
  return sent;
}

describe('dispatcher — per-token runtimeQualifiers (E-016 consumer)', () => {
  it('applies a sealed transpose by stacking it onto the grid shift', () => {
    const sent = dispatch([
      { token: 'C4', start: 0, end: 500, type: 'terminal', runtimeQualifiers: { transpose: -12 } }
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0].token).toBe('C3'); // -12 steps on a 12-EDO grid = one octave down
  });

  it('overrides velocity from the payload (vel / velocity)', () => {
    const sent = dispatch([
      { token: 'C4', start: 0, end: 500, type: 'terminal', runtimeQualifiers: { vel: 100 } }
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0].velocity).toBeCloseTo(100 / 127, 5);
  });

  it('mutes a terminal whose sealed velocity is 0 (native silences it)', () => {
    const sent = dispatch([
      { token: 'C4', start: 0, end: 500, type: 'terminal' },
      {
        token: 'D4',
        start: 500,
        end: 1000,
        type: 'terminal',
        runtimeQualifiers: { vel: 0, chan: 2 }
      },
      { token: 'E4', start: 1000, end: 1500, type: 'terminal' }
    ]);
    // The vel:0 token is dropped; the two default-velocity notes survive.
    expect(sent.map((e) => e.token)).toEqual(['C4', 'E4']);
  });

  it('routes a terminal to the channel sealed in its payload', () => {
    const sent = dispatch([
      { token: 'C4', start: 0, end: 500, type: 'terminal', runtimeQualifiers: { chan: 5 } }
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0].chan).toBe(5);
  });

  it('leaves tokens untouched when no payload is sealed (null path)', () => {
    const sent = dispatch([
      { token: 'C4', start: 0, end: 500, type: 'terminal', runtimeQualifiers: null }
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0].token).toBe('C4');
    expect(sent[0].velocity).toBeCloseTo(64 / 127, 5);
  });
});
