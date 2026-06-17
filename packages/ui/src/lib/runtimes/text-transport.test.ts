import { describe, it, expect } from 'vitest';
import { Dispatcher } from '../../../../core/src/dispatcher/dispatcher.js';

// Per-symbol play-vs-skip (decision routage-texte-son-par-symbole). One dispatcher,
// ONE audio transport: a token sounds → audio; a mute token is NOT PLAYED (skipped
// — there is NO text transport, the symbolic readout is a VIEW of the production
// tree, not a routed output). Proven on a MIXED token list: a grammar splits per
// symbol, not wholesale.

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

describe('dispatcher — per-symbol play-vs-skip (text is a view, not a transport)', () => {
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
