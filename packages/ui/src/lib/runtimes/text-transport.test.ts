import { describe, it, expect } from 'vitest';
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';
import { TextTransport } from '../../../../core/src/dispatcher/transports/text.js';

// Proof that a text grammar's terminals stream through the dispatcher to the
// TextTransport as timestamped symbols (no resolver, no audio). This is the
// engine half of the in-app symbol console (decision routage-texte-midi).

interface TimedTokenLike {
  token: string;
  start: number;
  end: number;
  type?: string;
}

interface DispatcherInternals {
  addTransport(name: string, t: unknown): void;
  load(tokens: TimedTokenLike[]): void;
  _running: boolean;
  _cursor: number;
  _loopOffset: number;
  _schedule(until: number): void;
}

function run(tokens: TimedTokenLike[]) {
  const captured: { token: string; startSec: number; durSec: number }[] = [];
  const fakeCtx = { currentTime: 0, state: 'running', resume() {} };
  const d = new Dispatcher(fakeCtx as unknown as AudioContext) as unknown as DispatcherInternals;
  const transport = new TextTransport({
    onSymbol: (s) => captured.push({ token: s.token, startSec: s.startSec, durSec: s.durSec })
  });
  d.addTransport('default', transport);
  d.load(tokens);
  d._running = true;
  d._cursor = 0;
  d._loopOffset = 0;
  d._schedule(Infinity);
  return { captured, transport };
}

describe('TextTransport — symbolic streaming', () => {
  it('streams a bols grammar terminals in order, with onsets', () => {
    const { captured } = run([
      { token: 'dha', start: 0, end: 500, type: 'terminal' },
      { token: 'tigida', start: 500, end: 1000, type: 'terminal' },
      { token: 'na', start: 1000, end: 1500, type: 'terminal' },
      { token: 'dhin', start: 1500, end: 2000, type: 'terminal' }
    ]);
    expect(captured.map((s) => s.token)).toEqual(['dha', 'tigida', 'na', 'dhin']);
    expect(captured.map((s) => s.startSec)).toEqual([0, 0.5, 1, 1.5]);
    expect(captured[1].durSec).toBeCloseTo(0.5, 5);
  });

  it('keeps the full history on the transport for headless inspection', () => {
    const { transport } = run([{ token: 'ka', start: 0, end: 250, type: 'terminal' }]);
    expect(transport.symbols).toHaveLength(1);
    expect(transport.symbols[0].token).toBe('ka');
  });

  it('skips silences (no symbol emitted for "-")', () => {
    const { captured } = run([
      { token: 'dha', start: 0, end: 500, type: 'terminal' },
      { token: '-', start: 500, end: 1000, type: 'terminal' },
      { token: 'ta', start: 1000, end: 1500, type: 'terminal' }
    ]);
    expect(captured.map((s) => s.token)).toEqual(['dha', 'ta']);
  });
});

// Per-symbol play-vs-skip (decision routage-texte-son-par-symbole): one
// dispatcher, ONE audio transport. A token sounds → audio; a mute token is NOT
// PLAYED (skipped — no text transport, the symbolic readout is a view of the
// production tree). Proven on a MIXED token list: a grammar splits per symbol,
// not wholesale.
describe('dispatcher — per-symbol play-vs-skip', () => {
  function split(tokens: TimedTokenLike[], soundsFn: (t: string) => boolean) {
    const audio: string[] = [];
    const fakeCtx = { currentTime: 0, state: 'running', resume() {} };
    const d = new Dispatcher(
      fakeCtx as unknown as AudioContext
    ) as unknown as DispatcherInternals & {
      setSoundPredicate(fn: (t: string) => boolean): void;
    };
    d.addTransport('default', { send: (e: { token: string }) => audio.push(e.token), close() {} });
    d.setSoundPredicate(soundsFn);
    d.load(tokens);
    d._running = true;
    d._cursor = 0;
    d._loopOffset = 0;
    d._schedule(Infinity);
    return { audio };
  }

  it('routes notes + sounding symbols to audio, SKIPS the mute symbols', () => {
    // `do4` is a note (sounds by default); `dha` carries a sound assignment;
    // `tigida` is a mute bol → skipped (not played anywhere).
    const sounding = new Set(['dha']);
    const soundsFn = (t: string) => /^(do|re|mi|fa|sol|la|si)\d/.test(t) || sounding.has(t);
    const { audio } = split(
      [
        { token: 'do4', start: 0, end: 500, type: 'terminal' },
        { token: 'dha', start: 500, end: 1000, type: 'terminal' },
        { token: 'tigida', start: 1000, end: 1500, type: 'terminal' }
      ],
      soundsFn
    );
    expect(audio).toEqual(['do4', 'dha']);
  });

  it('plays nothing when nothing sounds (all-mute grammar)', () => {
    const { audio } = split(
      [
        { token: 'dha', start: 0, end: 500, type: 'terminal' },
        { token: 'ta', start: 500, end: 1000, type: 'terminal' }
      ],
      () => false
    );
    expect(audio).toEqual([]);
  });
});
