import { describe, it, expect } from 'vitest';
import { parseBP3 } from 'bp3-frontend';
import { createBPx } from 'bpx';
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';
import { Resolver } from '../../../../core/src/dispatcher/resolver.js';

// E-016 end-to-end, on the PUBLISHED BPx dist (sealing committed at BPx 2717992).
// A minimal grammar carries the exact alan/beatrix controls — `_vel`/`_transpose`
// on top-level terminals, `_vel(0)` to mute — so the whole chain is exercised
// deterministically without the dice randomness or large fixtures:
//   parseBP3 → createBPx().derive()  seals the resolved state per terminal,
//   Dispatcher applies it            (transpose shifts pitch, vel:0 mutes).
// This guards against a BPx dist that regresses the sealing.

const TWELVE_TET = Array.from({ length: 12 }, (_, i) => Math.pow(2, i / 12));
function solfegeResolver() {
  return new Resolver({
    alphabet: {
      notes: ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'],
      alterations: { '#': 1, b: -1 }
    },
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

interface Tok {
  token: string;
  start: number;
  end: number;
  runtimeQualifiers?: Record<string, number> | null;
}

function derive(grammar: string): Tok[] {
  const r = parseBP3(grammar, { alphabetNames: ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'] }) as {
    ast: unknown;
    errors: { message: string }[];
  };
  expect(r.errors).toEqual([]);
  const bpx = createBPx({ tempo: 120 }) as {
    loadGrammar(ast: unknown): void;
    derive(): { tokens: Tok[] };
  };
  bpx.loadGrammar(r.ast);
  return bpx.derive().tokens;
}

function dispatch(tokens: Tok[]): string[] {
  const sent: string[] = [];
  const ctx = { currentTime: 0, state: 'running', resume() {} };
  const d = new Dispatcher(ctx as unknown as AudioContext) as unknown as {
    addTransport(n: string, t: unknown): void;
    setControlDefaults(d: Record<string, number>): void;
    load(t: Tok[]): void;
    _resolver: unknown;
    _running: boolean;
    _cursor: number;
    _loopOffset: number;
    _schedule(n: number): void;
  };
  d.addTransport('default', { send: (e: { token: string }) => sent.push(e.token), close() {} });
  d._resolver = solfegeResolver();
  d.setControlDefaults({ vel: 64, chan: 1 });
  d.load(tokens);
  d._running = true;
  d._cursor = 0;
  d._loopOffset = 0;
  d._schedule(Infinity);
  return sent;
}

describe('E-016 end-to-end on the published BPx dist', () => {
  // alan's signature: `_vel(80) _transpose(-12) … _vel(0)` — sounding notes
  // transposed down an octave, the post-vel(0) note muted.
  const alan = '-se.tiny\ngram#1[1] S --> _vel(80) _transpose(-12) do4 mi4 _vel(0) sol4';
  // beatrix: same notes, NO transpose — the differentiator.
  const beatrix = '-se.tiny\ngram#1[1] S --> _vel(80) do4 mi4 _vel(0) sol4';

  it('BPx seals the resolved runtime state per terminal', () => {
    const toks = derive(alan).filter((t) => /^(do|re|mi|fa|sol|la|si)/.test(t.token));
    expect(toks.map((t) => [t.token, t.runtimeQualifiers])).toEqual([
      ['do4', { vel: 80, transpose: -12 }],
      ['mi4', { vel: 80, transpose: -12 }],
      ['sol4', { vel: 0, transpose: -12 }]
    ]);
  });

  it('the dispatcher applies the seal: transposed pitches, muted vel:0', () => {
    expect(dispatch(derive(alan))).toEqual(['do3', 'mi3']); // sol4 (vel:0) dropped
  });

  it('makes the alan/beatrix differentiator visible post-dispatch', () => {
    expect(dispatch(derive(alan))).toEqual(['do3', 'mi3']); // transposed down an octave
    expect(dispatch(derive(beatrix))).toEqual(['do4', 'mi4']); // not transposed
  });
});
